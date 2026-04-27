/**
 * detect_language — Lightweight file-based detection of primary language for a project.
 *
 * Checks for well-known config files (composer.json, package.json, Cargo.toml, etc.)
 * in the app root and returns the detected language + project type.
 *
 * This is a pure filesystem check — no AI, no network calls.
 */
import path from "node:path";
import { promises as fsPromises } from "node:fs";
import log from "electron-log";

const logger = log.scope("detect_language");

interface DetectedStack {
  primaryLanguage: string;
  projectType: string;
}

/**
 * Well-known file → language mappings, ordered by specificity.
 * The first match wins, so more specific markers should come first.
 */
const FILE_MARKERS: Array<{ file: string; lang: string; type: string }> = [
  { file: "composer.json", lang: "php", type: "php" },
  { file: "artisan", lang: "php", type: "php" },              // Laravel
  { file: "wp-config.php", lang: "php", type: "php" },        // WordPress
  { file: "Cargo.toml", lang: "rust", type: "generic" },
  { file: "go.mod", lang: "go", type: "generic" },
  { file: "pom.xml", lang: "java", type: "generic" },
  { file: "build.gradle", lang: "java", type: "generic" },
  { file: "build.gradle.kts", lang: "kotlin", type: "generic" },
  { file: "requirements.txt", lang: "python", type: "generic" },
  { file: "setup.py", lang: "python", type: "generic" },
  { file: "pyproject.toml", lang: "python", type: "generic" },
  { file: "Pipfile", lang: "python", type: "generic" },
  { file: "Gemfile", lang: "ruby", type: "generic" },
  { file: "pubspec.yaml", lang: "dart", type: "generic" },
  { file: "Package.swift", lang: "swift", type: "generic" },
  // Node/TS should come last — very common, less distinctive
  { file: "package.json", lang: "javascript", type: "node" },
];

/**
 * Detect primary language and project type for a project at `appPath`.
 * Returns `{ primaryLanguage, projectType }`.
 *
 * For Node projects, checks for tsconfig.json or typescript in deps to
 * distinguish TypeScript from JavaScript.
 */
export async function detectProjectLanguage(appPath: string): Promise<DetectedStack> {
  for (const marker of FILE_MARKERS) {
    try {
      await fsPromises.access(path.join(appPath, marker.file));

      let lang = marker.lang;
      let type = marker.type;

      // For package.json, refine: check if it's TypeScript
      if (marker.file === "package.json") {
        try {
          const hasTsconfig = await fsPromises
            .access(path.join(appPath, "tsconfig.json"))
            .then(() => true)
            .catch(() => false);

          if (hasTsconfig) {
            lang = "typescript";
          } else {
            // Check devDependencies for typescript
            const pkgRaw = await fsPromises.readFile(
              path.join(appPath, "package.json"),
              "utf-8",
            );
            const pkg = JSON.parse(pkgRaw);
            const deps = { ...pkg.dependencies, ...pkg.devDependencies };
            if (deps["typescript"]) lang = "typescript";
          }
        } catch {
          /* ignore parse errors */
        }
      }

      logger.debug(`Detected language for ${appPath}: ${lang}/${type}`);
      return { primaryLanguage: lang, projectType: type };
    } catch {
      // File doesn't exist, try next
    }
  }

  // Nothing detected
  logger.debug(`No language detected for ${appPath}`);
  return { primaryLanguage: "unknown", projectType: "generic" };
}
