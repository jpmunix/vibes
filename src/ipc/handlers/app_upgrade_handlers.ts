import { createTypedHandler } from "./base";
import { upgradeContracts, type AppUpgrade } from "../types/upgrade";
import log from "electron-log";
import { getRemoteDb } from "../../db/remote";
import * as remoteSchema from "../../db/remote-schema";
import { and, eq } from "drizzle-orm";
import { getVibesAppPath } from "../../paths/paths";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { gitAddAll, gitCommit } from "../utils/git_utils";
import { simpleSpawn } from "../utils/simpleSpawn";

export const logger = log.scope("app_upgrade_handlers");

const availableUpgrades: Omit<AppUpgrade, "isNeeded">[] = [
  {
    id: "component-tagger",
    title: "Habilitar edición de componentes seleccionados",
    description:
      "Instala el complemento de etiquetado de componentes para permitir la selección visual.",
    manualUpgradeUrl:
      "https://github.com/minube/vibes/upgrades/select-component",
  },
  {
    id: "capacitor",
    title: "Actualiza a Capacitor para una experiencia móvil híbrida",
    description:
      "Añade Capacitor para permitir que tu app corra en iOS y Android además de la web.",
    manualUpgradeUrl:
      "https://github.com/minube/vibes/guides/mobile-app#upgrade-your-app",
  },
];

async function getApp(appId: number, userId: string) {
  const db = getRemoteDb();
  const app = await db.query.apps.findFirst({
    where: and(eq(remoteSchema.apps.id, appId), eq(remoteSchema.apps.userId, userId)),
  });
  if (!app) {
    throw new Error(`App with id ${appId} not found`);
  }
  return app;
}

function isViteApp(appPath: string): boolean {
  const viteConfigPathJs = path.join(appPath, "vite.config.js");
  const viteConfigPathTs = path.join(appPath, "vite.config.ts");

  return fs.existsSync(viteConfigPathTs) || fs.existsSync(viteConfigPathJs);
}

function isNextApp(appPath: string): boolean {
  return !!findNextConfigPath(appPath);
}

function findNextConfigPath(appPath: string): string | null {
  const candidates = ["next.config.ts", "next.config.mjs", "next.config.js"];
  for (const name of candidates) {
    const full = path.join(appPath, name);
    if (fs.existsSync(full)) return full;
  }
  return null;
}

function isViteComponentTaggerNeeded(appPath: string): boolean {
  const viteConfigPathJs = path.join(appPath, "vite.config.js");
  const viteConfigPathTs = path.join(appPath, "vite.config.ts");

  let viteConfigPath;
  if (fs.existsSync(viteConfigPathTs)) {
    viteConfigPath = viteConfigPathTs;
  } else if (fs.existsSync(viteConfigPathJs)) {
    viteConfigPath = viteConfigPathJs;
  } else {
    return false;
  }

  try {
    const viteConfigContent = fs.readFileSync(viteConfigPath, "utf-8");
    return !viteConfigContent.includes("@dyad-sh/react-vite-component-tagger") && !viteConfigContent.includes("@vibes/react-vite-component-tagger");
  } catch (e) {
    logger.error("Error reading vite config", e);
    return false;
  }
}

function isNextComponentTaggerNeeded(appPath: string): boolean {
  const configPath = findNextConfigPath(appPath);
  if (!configPath) return false;

  try {
    const content = fs.readFileSync(configPath, "utf-8");
    return !content.includes("@dyad-sh/nextjs-webpack-component-tagger") && !content.includes("@vibes/nextjs-webpack-component-tagger");
  } catch (e) {
    logger.error("Error reading next config", e);
    return false;
  }
}

function isComponentTaggerUpgradeNeeded(appPath: string): boolean {
  if (isViteApp(appPath)) return isViteComponentTaggerNeeded(appPath);
  if (isNextApp(appPath)) return isNextComponentTaggerNeeded(appPath);
  return false;
}

function isCapacitorUpgradeNeeded(appPath: string): boolean {
  // Check if it's a Vite app first
  if (!isViteApp(appPath)) {
    return false;
  }

  // Check if Capacitor is already installed
  const capacitorConfigJs = path.join(appPath, "capacitor.config.js");
  const capacitorConfigTs = path.join(appPath, "capacitor.config.ts");
  const capacitorConfigJson = path.join(appPath, "capacitor.config.json");

  // If any Capacitor config exists, the upgrade is not needed
  if (
    fs.existsSync(capacitorConfigJs) ||
    fs.existsSync(capacitorConfigTs) ||
    fs.existsSync(capacitorConfigJson)
  ) {
    return false;
  }

  return true;
}

async function applyComponentTagger(appPath: string) {
  if (isNextApp(appPath)) {
    await applyNextComponentTagger(appPath);
  } else {
    await applyViteComponentTagger(appPath);
  }
}

async function applyViteComponentTagger(appPath: string) {
  const viteConfigPathJs = path.join(appPath, "vite.config.js");
  const viteConfigPathTs = path.join(appPath, "vite.config.ts");

  let viteConfigPath;
  if (fs.existsSync(viteConfigPathTs)) {
    viteConfigPath = viteConfigPathTs;
  } else if (fs.existsSync(viteConfigPathJs)) {
    viteConfigPath = viteConfigPathJs;
  } else {
    throw new Error("Could not find vite.config.js or vite.config.ts");
  }

  let content = await fs.promises.readFile(viteConfigPath, "utf-8");

  // Add import statement if not present
  if (
    !content.includes(
      "import vibesComponentTagger from '@dyad-sh/react-vite-component-tagger';",
    )
  ) {
    // Add it after the last import statement
    const lines = content.split("\n");
    let lastImportIndex = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].startsWith("import ")) {
        lastImportIndex = i;
        break;
      }
    }
    lines.splice(
      lastImportIndex + 1,
      0,
      "import vibesComponentTagger from '@dyad-sh/react-vite-component-tagger';",
    );
    content = lines.join("\n");
  }

  // Add plugin to plugins array
  if (content.includes("plugins: [")) {
    if (!content.includes("vibesComponentTagger()")) {
      content = content.replace(
        "plugins: [",
        "plugins: [vibesComponentTagger(), ",
      );
    }
  } else {
    throw new Error(
      "Could not find `plugins: [` in vite.config.ts. Manual installation required.",
    );
  }

  await fs.promises.writeFile(viteConfigPath, content);

  // Install the dependency
  await installDependency(appPath, "@dyad-sh/react-vite-component-tagger");

  // Commit changes
  await commitTaggerChanges(appPath);
}

async function applyNextComponentTagger(appPath: string) {
  const configPath = findNextConfigPath(appPath);
  if (!configPath) {
    throw new Error("Could not find next.config.js, next.config.mjs, or next.config.ts");
  }

  let content = await fs.promises.readFile(configPath, "utf-8");

  // ── 1. Detect existing config shape ──────────────────────────────────
  // Next.js configs come in many flavours. We handle the most common ones:
  //   • export default { ... }           (mjs/ts)
  //   • const nextConfig = { ... }; export default nextConfig;
  //   • module.exports = { ... }         (cjs)
  //
  // We need to inject a webpack function inside the config object.

  const taggerAlreadyPresent =
    content.includes("@dyad-sh/nextjs-webpack-component-tagger") ||
    content.includes("@vibes/nextjs-webpack-component-tagger");

  if (taggerAlreadyPresent) {
    logger.info("[nextjs-tagger] Component tagger already present in next config, skipping.");
    return;
  }

  // The webpack loader config snippet to inject
  const webpackSnippet = `
  webpack: (config, { dev }) => {
    if (dev) {
      config.module.rules.push({
        test: /\\.(jsx|tsx)$/,
        exclude: /node_modules/,
        use: [
          {
            loader: require.resolve('@dyad-sh/nextjs-webpack-component-tagger'),
          },
        ],
      });
    }
    return config;
  },`;

  let modified = false;

  // Strategy 1: Config has an existing `webpack:` or `webpack(` — warn and skip (manual needed)
  if (content.match(/webpack\s*[:(/]/)) {
    logger.warn(
      "[nextjs-tagger] Existing webpack config detected. Appending vibes tagger rule.",
    );
    // Try to inject inside existing webpack function by finding "return config"
    const returnConfigRegex = /(return\s+config\s*;?)/;
    if (returnConfigRegex.test(content)) {
      const ruleSnippet = `
    // [vibes] Component tagger for visual editing
    if (dev) {
      config.module.rules.push({
        test: /\\.(jsx|tsx)$/,
        exclude: /node_modules/,
        use: [
          {
            loader: require.resolve('@dyad-sh/nextjs-webpack-component-tagger'),
          },
        ],
      });
    }
    `;
      content = content.replace(returnConfigRegex, ruleSnippet + "\n    $1");
      modified = true;
    } else {
      throw new Error(
        "Could not inject tagger into existing webpack config. Manual installation required.",
      );
    }
  }

  // Strategy 2: No webpack config exists — inject into the config object
  if (!modified) {
    // Try to find the config object opening
    // Pattern A: `export default { ... }` or `export default defineConfig({ ... })`
    // Pattern B: `const nextConfig = { ... }`
    // Pattern C: `module.exports = { ... }`
    const configObjectPatterns = [
      // export default { → insert after the opening brace
      /(export\s+default\s+)\{/,
      // const nextConfig = { → insert after the opening brace
      /(const\s+\w+\s*=\s*)\{/,
      // module.exports = { → insert after the opening brace
      /(module\.exports\s*=\s*)\{/,
    ];

    for (const pattern of configObjectPatterns) {
      const match = content.match(pattern);
      if (match) {
        const fullMatch = match[0];
        content = content.replace(fullMatch, fullMatch + webpackSnippet);
        modified = true;
        break;
      }
    }
  }

  if (!modified) {
    throw new Error(
      "Could not detect next.config structure. Manual installation required.",
    );
  }

  await fs.promises.writeFile(configPath, content);
  logger.info(`[nextjs-tagger] Injected webpack loader into ${path.basename(configPath)}`);

  // Install the dependency
  await installDependency(appPath, "@dyad-sh/nextjs-webpack-component-tagger");

  // Commit changes
  await commitTaggerChanges(appPath);
}

async function installDependency(appPath: string, packageName: string) {
  await new Promise<void>((resolve, reject) => {
    logger.info(`Installing ${packageName}`);
    const proc = spawn(
      `npm install --save-dev --legacy-peer-deps ${packageName}`,
      {
        cwd: appPath,
        shell: true,
        stdio: "pipe",
      },
    );

    proc.stdout?.on("data", (data) => logger.info(data.toString()));
    proc.stderr?.on("data", (data) => logger.error(data.toString()));

    proc.on("close", (code) => {
      if (code === 0) {
        logger.info(`${packageName} installed successfully`);
        resolve();
      } else {
        logger.error(`Failed to install ${packageName}, exit code ${code}`);
        reject(new Error(`Failed to install ${packageName}`));
      }
    });

    proc.on("error", (err) => {
      logger.error(`Failed to spawn npm for ${packageName}`, err);
      reject(err);
    });
  });
}

async function commitTaggerChanges(appPath: string) {
  try {
    logger.info("Staging and committing changes");
    await gitAddAll({ path: appPath });
    await gitCommit({
      path: appPath,
      message: "[vibes] add Vibes component tagger",
    });
    logger.info("Successfully committed changes");
  } catch (err) {
    logger.warn(
      `Failed to commit changes. This may happen if the project is not in a git repository, or if there are no changes to commit.`,
      err,
    );
  }
}

async function applyCapacitor({
  appName,
  appPath,
}: {
  appName: string;
  appPath: string;
}) {
  // Install Capacitor dependencies
  await simpleSpawn({
    command:
      "npm install @capacitor/core@7.4.4 @capacitor/cli@7.4.4 @capacitor/ios@7.4.4 @capacitor/android@7.4.4 --legacy-peer-deps",
    cwd: appPath,
    successMessage: "Capacitor dependencies installed successfully",
    errorPrefix: "Failed to install Capacitor dependencies",
  });

  // Initialize Capacitor
  await simpleSpawn({
    command: `npx cap init "${appName}" "com.example.${appName.toLowerCase().replace(/[^a-z0-9]/g, "")}" --web-dir=dist`,
    cwd: appPath,
    successMessage: "Capacitor initialized successfully",
    errorPrefix: "Failed to initialize Capacitor",
  });

  // Add iOS and Android platforms
  await simpleSpawn({
    command: "npx cap add ios && npx cap add android",
    cwd: appPath,
    successMessage: "iOS and Android platforms added successfully",
    errorPrefix: "Failed to add iOS and Android platforms",
  });

  // Commit changes
  try {
    logger.info("Staging and committing Capacitor changes");
    await gitAddAll({ path: appPath });
    await gitCommit({
      path: appPath,
      message: "[vibes] add Capacitor for mobile app support",
    });
    logger.info("Successfully committed Capacitor changes");
  } catch (err) {
    logger.warn(
      `Failed to commit changes. This may happen if the project is not in a git repository, or if there are no changes to commit.`,
      err,
    );
    throw new Error(
      "Failed to commit Capacitor changes. Please commit them manually. Error: " +
      err,
    );
  }
}

export function registerAppUpgradeHandlers() {
  createTypedHandler(upgradeContracts.getAppUpgrades, async (_, { appId }, context) => {
      if (!context.userId) throw new Error("Unauthorized");
      const app = await getApp(appId, context.userId);
      const appPath = getVibesAppPath(app.path);

      const upgradesWithStatus = availableUpgrades.map((upgrade) => {
        let isNeeded = false;
        if (upgrade.id === "component-tagger") {
          isNeeded = isComponentTaggerUpgradeNeeded(appPath);
        } else if (upgrade.id === "capacitor") {
          isNeeded = isCapacitorUpgradeNeeded(appPath);
        }
        return { ...upgrade, isNeeded };
      });

      return upgradesWithStatus;
  });

  createTypedHandler(upgradeContracts.executeAppUpgrade, async (_, { appId, upgradeId }, context) => {
      if (!context.userId) throw new Error("Unauthorized");
      if (!upgradeId) {
        throw new Error("upgradeId is required");
      }

      const app = await getApp(appId, context.userId);
      const appPath = getVibesAppPath(app.path);

      if (upgradeId === "component-tagger") {
        await applyComponentTagger(appPath);
      } else if (upgradeId === "capacitor") {
        await applyCapacitor({ appName: app.name, appPath });
      } else {
        throw new Error(`Unknown upgrade id: ${upgradeId}`);
      }
    },
  );
}
