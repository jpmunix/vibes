import path from "path";
import fs from "fs-extra";
import { app } from "electron";
import { copyDirectoryRecursive } from "../utils/file_utils";
import { gitClone, getCurrentCommitHash } from "../utils/git_utils";
import { readSettings } from "@/main/settings";
import { getTemplateOrThrow } from "../utils/template_utils";
import { SCAFFOLD_TEMPLATE_IDS, DEFAULT_TEMPLATE_ID } from "../../shared/templates";
import log from "electron-log";
import { ensureScaffoldCached, copyScaffoldNodeModules } from "../utils/scaffold_cache";

const logger = log.scope("createFromTemplate");

/**
 * Default .gitignore content for new projects.
 * Used as a safety net when a scaffold or GitHub template is missing .gitignore.
 * This prevents catastrophic `git add .` from staging node_modules.
 */
const DEFAULT_GITIGNORE = [
  "# Dependencies",
  "node_modules",
  "",
  "# Build output",
  "dist",
  "dist-ssr",
  "build",
  ".next",
  ".nuxt",
  ".output",
  "",
  "# Environment",
  ".env",
  ".env.local",
  ".env.*.local",
  "*.local",
  "",
  "# Logs",
  "logs",
  "*.log",
  "npm-debug.log*",
  "yarn-debug.log*",
  "pnpm-debug.log*",
  "",
  "# Editor / OS",
  ".vscode/*",
  "!.vscode/extensions.json",
  ".idea",
  ".DS_Store",
  "*.sw?",
  "",
].join("\n");

/**
 * Ensure a .gitignore file exists at the project root.
 * If one already exists, leaves it untouched (user/template may have customized it).
 * If missing, writes a sensible default that at minimum excludes node_modules.
 *
 * This is a SAFETY NET — even if a scaffold or GitHub template forgets .gitignore,
 * the subsequent `git init && git add .` in app_handlers won't stage node_modules.
 */
async function ensureGitignore(appPath: string): Promise<void> {
  const gitignorePath = path.join(appPath, ".gitignore");
  try {
    await fs.access(gitignorePath);
    // File exists — don't overwrite
  } catch {
    // File doesn't exist — create it
    await fs.writeFile(gitignorePath, DEFAULT_GITIGNORE, "utf-8");
    logger.warn(`Created missing .gitignore at ${gitignorePath} (safety net)`);
  }
}

export async function createFromTemplate({
  fullAppPath,
  appName,
  forceDefaultScaffold,
}: {
  fullAppPath: string;
  appName?: string;
  forceDefaultScaffold?: boolean;
}) {
  const settings = readSettings();
  const templateId = forceDefaultScaffold ? DEFAULT_TEMPLATE_ID : settings.selectedTemplateId;

  // Check if this template has a local scaffold directory
  const scaffoldDirName = SCAFFOLD_TEMPLATE_IDS[templateId];
  if (scaffoldDirName) {
    logger.info(`Using local scaffold "${scaffoldDirName}" for template "${templateId}"`);
    // Ensure node_modules are cached for this scaffold (on-demand, first time runs npm install)
    await ensureScaffoldCached(scaffoldDirName);
    await copyDirectoryRecursive(
      path.join(__dirname, "..", "..", scaffoldDirName),
      fullAppPath,
    );
    // Sustituir wildcards en la plantilla
    await replaceTemplateWildcards(fullAppPath, appName);
    // Copy pre-cached node_modules for instant startup
    await copyScaffoldNodeModules(fullAppPath);
    // Safety net: guarantee .gitignore exists before git init
    await ensureGitignore(fullAppPath);
    return;
  }

  const template = await getTemplateOrThrow(templateId);
  if (!template.githubUrl) {
    throw new Error(`Template ${templateId} has no GitHub URL`);
  }
  const repoCachePath = await cloneRepo(template.githubUrl);
  await copyRepoToApp(repoCachePath, fullAppPath);
  // También sustituir wildcards en templates de GitHub
  await replaceTemplateWildcards(fullAppPath, appName);
  // Copy pre-cached node_modules (only matches scaffold deps, but still speeds things up)
  await copyScaffoldNodeModules(fullAppPath);
  // Safety net: guarantee .gitignore exists before git init
  await ensureGitignore(fullAppPath);
}

async function replaceTemplateWildcards(
  appPath: string,
  appName?: string,
): Promise<void> {
  const displayName = appName || "Vibes";
  // Replace {{APP_NAME}} in any files that use it
  const filesToCheck = ["index.html", "package.json"];
  for (const fileName of filesToCheck) {
    const filePath = path.join(appPath, fileName);
    try {
      const content = await fs.readFile(filePath, "utf-8");
      if (content.includes("{{APP_NAME}}")) {
        await fs.writeFile(
          filePath,
          content.replace(/\{\{APP_NAME\}\}/g, displayName),
          "utf-8",
        );
        logger.info(`Replaced {{APP_NAME}} with "${displayName}" in ${fileName}`);
      }
    } catch (error) {
      // File may not exist in some templates (e.g. Express has no index.html)
      logger.debug(`Could not replace wildcards in ${fileName}: ${error}`);
    }
  }
}

async function cloneRepo(repoUrl: string): Promise<string> {
  const url = new URL(repoUrl);
  if (url.protocol !== "https:") {
    throw new Error("Repository URL must use HTTPS.");
  }
  if (url.hostname !== "github.com") {
    throw new Error("Repository URL must be a github.com URL.");
  }

  // Pathname will be like "/org/repo" or "/org/repo.git"
  const pathParts = url.pathname.split("/").filter((part) => part.length > 0);

  if (pathParts.length !== 2) {
    throw new Error(
      "Invalid repository URL format. Expected 'https://github.com/org/repo'",
    );
  }

  const orgName = pathParts[0];
  const repoName = path.basename(pathParts[1], ".git"); // Remove .git suffix if present

  if (!orgName || !repoName) {
    // This case should ideally be caught by pathParts.length !== 2
    throw new Error(
      "Failed to parse organization or repository name from URL.",
    );
  }
  logger.info(`Parsed org: ${orgName}, repo: ${repoName} from ${repoUrl}`);

  const cachePath = path.join(
    app.getPath("userData"),
    "templates",
    orgName,
    repoName,
  );

  if (fs.existsSync(cachePath)) {
    try {
      logger.info(
        `Repo ${repoName} already exists in cache at ${cachePath}. Checking for updates.`,
      );

      // Construct GitHub API URL
      const apiUrl = `https://api.github.com/repos/${orgName}/${repoName}/commits/HEAD`;
      logger.info(`Fetching remote SHA from ${apiUrl}`);

      // Use native fetch instead of isomorphic-git http.request
      const response = await fetch(apiUrl, {
        method: "GET",
        headers: {
          "User-Agent": "Vibes", // GitHub API requires this
          Accept: "application/vnd.github.v3+json",
        },
      });
      // Handle non-200 responses
      if (!response.ok) {
        throw new Error(
          `GitHub API request failed with status ${response.status}: ${response.statusText}`,
        );
      }
      // Parse JSON directly (fetch handles streaming internally)
      const commitData = await response.json();
      const remoteSha = commitData.sha;
      if (!remoteSha) {
        throw new Error("SHA not found in GitHub API response.");
      }

      logger.info(`Successfully fetched remote SHA: ${remoteSha}`);

      // Compare with local SHA
      const localSha = await getCurrentCommitHash({ path: cachePath });

      if (remoteSha === localSha) {
        logger.info(
          `Local cache for ${repoName} is up to date (SHA: ${localSha}). Skipping clone.`,
        );
        return cachePath;
      } else {
        logger.info(
          `Local cache for ${repoName} (SHA: ${localSha}) is outdated (Remote SHA: ${remoteSha}). Removing and re-cloning.`,
        );
        fs.rmSync(cachePath, { recursive: true, force: true });
        // Continue to clone…
      }
    } catch (err) {
      logger.warn(
        `Error checking for updates or comparing SHAs for ${repoName} at ${cachePath}. Will attempt to re-clone. Error: `,
        err,
      );
      return cachePath;
    }
  }

  fs.ensureDirSync(path.dirname(cachePath));

  logger.info(`Cloning ${repoUrl} to ${cachePath}`);
  try {
    await gitClone({ path: cachePath, url: repoUrl, depth: 1 });
    logger.info(`Successfully cloned ${repoUrl} to ${cachePath}`);
  } catch (err) {
    logger.error(`Failed to clone ${repoUrl} to ${cachePath}: `, err);
    throw err; // Re-throw the error after logging
  }
  return cachePath;
}

async function copyRepoToApp(repoCachePath: string, appPath: string) {
  logger.info(`Copying from ${repoCachePath} to ${appPath}`);
  try {
    await fs.copy(repoCachePath, appPath, {
      filter: (src, _dest) => {
        const excludedDirs = ["node_modules", ".git"];
        const relativeSrc = path.relative(repoCachePath, src);
        if (excludedDirs.includes(path.basename(relativeSrc))) {
          logger.info(`Excluding ${src} from copy`);
          return false;
        }
        return true;
      },
    });
    logger.info("Finished copying repository contents.");
  } catch (err) {
    logger.error(
      `Error copying repository from ${repoCachePath} to ${appPath}: `,
      err,
    );
    throw err; // Re-throw the error after logging
  }
}
