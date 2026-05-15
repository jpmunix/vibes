import { app, BrowserWindow, dialog, Menu, screen } from "electron";
import * as path from "node:path";
import { createSplashWindow, updateSplash, closeSplash } from "./main/splash";
import { ensureOpenCodeInstalled } from "./main/ensure_opencode";
import { ensureNodeRuntime } from "./main/node_runtime";
import { registerIpcHandlers } from "./ipc/ipc_host";
import dotenv from "dotenv";
// @ts-ignore
import started from "electron-squirrel-startup";
import log from "electron-log";
import {
  readSettings,
  writeSettings,
} from "./main/settings";
import { readSession } from "./main/session";
import { preferencesCache } from "./main/preferences-cache";
import { initializeRemoteSchema } from "./db/remote";
import { handleSupabaseOAuthReturn } from "./supabase_admin/supabase_return_handler";
import { handleProReturn } from "./main/pro";
import { IS_TEST_BUILD } from "./ipc/utils/test_utils";


import { UserSettings } from "./lib/schemas";
import { handleNeonOAuthReturn } from "./neon_admin/neon_return_handler";
import { handleFirebaseOAuthReturn } from "./firebase_admin/firebase_return_handler";
import {
  AddMcpServerConfigSchema,
  AddMcpServerPayload,
  AddPromptDataSchema,
  AddPromptPayload,
} from "./ipc/deep_link_data";
import {
  startPerformanceMonitoring,
  stopPerformanceMonitoring,
} from "./utils/performance_monitor";
import { shutdownOpenCode } from "./ipc/handlers/opencode_adapter";
import fs from "fs";
import { gitAddSafeDirectory } from "./ipc/utils/git_utils";
import { getVibesAppsBaseDirectory } from "./paths/paths";
import { validateModelSettings } from "./ipc/utils/model_validator";
import { stopAllRunningApps } from "./ipc/utils/process_manager";
import { serializePendingBuffers } from "./ipc/utils/memory_extractor";

// ─── Config migration: minube-vibes → Vibes ─────────────────────────────
// productName changed to "Vibes" so Electron's userData moves to a new dir.
// If the old dir exists, copy everything over (overwriting) and delete it.
// On next startup the old dir is gone → migration is a no-op.
{
  const oldUserData = path.join(app.getPath("appData"), "minube-vibes");
  if (fs.existsSync(oldUserData)) {
    const newUserData = app.getPath("userData");
    // Skip Chromium caches (~2GB, auto-regenerated) and auth/settings files
    // (encrypted with old app identity — user will re-login and sync from BunnyDB)
    const SKIP = new Set([
      "Cache", "Code Cache", "GPUCache", "DawnGraphiteCache", "DawnWebGPUCache", "blob_storage",
      "user-settings.json", "Cookies", "Cookies-journal",
      "IndexedDB", "Local Storage", "Session Storage", "Preferences",
    ]);
    try {
      fs.cpSync(oldUserData, newUserData, {
        recursive: true,
        force: true,
        filter: (src) => !SKIP.has(path.basename(src)),
      });
      fs.rmSync(oldUserData, { recursive: true, force: true });
      // Write flags for the next launch:
      // - .migration-optimize: triggers DB VACUUM during splash
      // - .migration-trust-remote: allows providerSettings from BunnyDB to overwrite empty local keys
      fs.writeFileSync(path.join(newUserData, ".migration-optimize"), "", "utf-8");
      fs.writeFileSync(path.join(newUserData, ".migration-trust-remote"), "", "utf-8");
      console.log(`[Migration] Migrated ${oldUserData} → ${newUserData}`);
      if (app.isPackaged) {
        console.log("[Migration] Relaunching...");
        app.relaunch();
        app.exit(0);
      } else {
        console.log("[Migration] Dev mode — restart manually (rs + Enter)");
      }
    } catch (err: any) {
      console.warn(`[Migration] Failed: ${(err as Error).message}`);
    }
  }
}

log.errorHandler.startCatching();
log.eventLogger.startLogging();
log.scope.labelPadding = false;

// Optimization: Only write errors to disk to avoid I/O contention
log.transports.file.level = "error";
log.transports.console.level = "info"; // Keep info logs in console/stdout

// Silence noisy scopes — they flood the console during normal operation
const SILENCED_SCOPES = new Set<string>([
  //"opencode_adapter",
  "design_handlers",
  "start_proxy_server",
  "scaffold-cache",
  "auth-handlers",
  "token_count_handlers",
  "opencode_diagnostic",
  "morph_patcher",
  "proposal_handlers",
  "window-handlers",
  "tsc",
]);
log.hooks.push((message, transport) => {
  if (transport !== log.transports.console) return message;
  if (message.scope && SILENCED_SCOPES.has(message.scope)) return false;
  return message;
});

// ──────────────────────────────────────────────────────────────────────────────
// Performance: Chromium command-line flags (must be set before app.ready)
// Inspired by VS Code's Electron optimizations
// ──────────────────────────────────────────────────────────────────────────────

// Enable GPU rasterization for smoother rendering
app.commandLine.appendSwitch("enable-gpu-rasterization");

// Enable zero-copy rasterization for reduced memory overhead
app.commandLine.appendSwitch("enable-zero-copy");

// Ignore GPU blocklist — use GPU even on "unsupported" configs (VS Code does this)
app.commandLine.appendSwitch("ignore-gpu-blocklist");

// Prevent Chromium from throttling the renderer process when window is not focused
app.commandLine.appendSwitch("disable-renderer-backgrounding");

// Enable smooth scrolling at Chromium level
app.commandLine.appendSwitch("enable-smooth-scrolling");

const logger = log.scope("main");


// ─── Build Profile ───────────────────────────────────────────────────────
// VIBES_PROFILE=vibes → standalone "Vibes" app (can run alongside vibes).
// Override userData BEFORE any settings/paths are accessed so the two instances
// get completely independent config directories and single-instance locks.
const IS_VIBES_PROFILE = process.env.VIBES_PROFILE === "vibes";
if (IS_VIBES_PROFILE) {
  const vibesUserData = path.join(app.getPath("appData"), "vibes");
  app.setPath("userData", vibesUserData);
  app.name = "Vibes";
}

// Load environment variables from .env file
dotenv.config();

// Register IPC handlers before app is ready
registerIpcHandlers();

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

// Decide the git directory depending on environment
function resolveLocalGitDirectory() {
  if (!app.isPackaged) {
    // Dev: app.getAppPath() is the project root
    return path.join(app.getAppPath(), "node_modules/dugite/git");
  }

  // Packaged app: git is bundled via extraResource
  return path.join(process.resourcesPath, "git");
}

const gitDir = resolveLocalGitDirectory();
if (fs.existsSync(gitDir)) {
  process.env.LOCAL_GIT_DIRECTORY = gitDir;
}

if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient("dyad", process.execPath, [
      path.resolve(process.argv[1]),
    ]);
    app.setAsDefaultProtocolClient("com.googleusercontent.apps.772397727909-7qjcbdkgt45ld7q91ijqdp4m8s0rngm3", process.execPath, [
      path.resolve(process.argv[1]),
    ]);
  }
} else {
  app.setAsDefaultProtocolClient("dyad");
  app.setAsDefaultProtocolClient("com.googleusercontent.apps.772397727909-7qjcbdkgt45ld7q91ijqdp4m8s0rngm3");
}

function getRecentLogs(lines: number = 50): string {
  try {
    const logPath = log.transports.file.getFile().path;
    const logContent = fs.readFileSync(logPath, "utf-8");
    const logLines = logContent.split("\n");
    return logLines.slice(-lines).join("\n");
  } catch (error) {
    logger.error("Error reading recent logs:", error);
    return "";
  }
}

export async function onReady() {
  // Read settings first (quick, synchronous operation)
  const settings = readSettings();

  // Check if app was force-closed
  if (settings.isRunning) {
    logger.warn("App was force-closed on previous run");

    // Store performance data to send after window is created
    if (settings.lastKnownPerformance) {
      logger.warn("Last known performance:", settings.lastKnownPerformance);
      pendingForceCloseData = {
        performanceData: settings.lastKnownPerformance,
        appVersion: app.getVersion(),
        platform: `${process.platform} ${process.arch}`,
        recentLogs: getRecentLogs(50),
      };
    }
  }

  // Set isRunning to true at startup
  writeSettings({ isRunning: true });

  await onFirstRunMaybe(settings);

  // ─── Post-migration optimization ──────────────────────────────────────
  const migrationFlagPath = path.join(app.getPath("userData"), ".migration-optimize");
  const needsOptimization = fs.existsSync(migrationFlagPath);

  // ─── Splash Screen Startup Flow ──────────────────────────────────────
  // Show a splash screen with progress bar while running initialization tasks.
  // This replaces the "white screen" that appeared during startup.
  const TOTAL_STEPS = needsOptimization ? 7 : 6;
  const splash = createSplashWindow();
  // Give the splash window time to render (minimal delay)
  await new Promise(resolve => setTimeout(resolve, 50));

  // Step 1 (migration only): Optimize databases
  if (needsOptimization) {
    updateSplash(splash, 1, TOTAL_STEPS, "Optimizando base de datos...");
    try {
      const { execSync } = require("child_process");
      const HOME = process.env.HOME || `/home/${process.env.USER}`;

      // VACUUM + WAL checkpoint on OpenCode DB
      const openCodeDbPath = path.join(HOME, ".local/share/opencode/opencode.db");
      if (fs.existsSync(openCodeDbPath)) {
        execSync(`sqlite3 "${openCodeDbPath}" "PRAGMA wal_checkpoint(TRUNCATE); VACUUM;"`, { timeout: 60000 });
        logger.info("[Migration] OpenCode DB optimized");
      }

      // VACUUM the app's local SQLite DB too
      const appDbPath = path.join(app.getPath("userData"), "sqlite.db");
      if (fs.existsSync(appDbPath)) {
        execSync(`sqlite3 "${appDbPath}" "PRAGMA wal_checkpoint(TRUNCATE); VACUUM;"`, { timeout: 60000 });
        logger.info("[Migration] App DB optimized");
      }

      // Clean up the flag
      fs.unlinkSync(migrationFlagPath);
      logger.info("[Migration] Post-migration optimization completed");
    } catch (err: any) {
      logger.warn(`[Migration] Optimization failed (non-fatal): ${err.message}`);
      // Remove flag anyway to avoid retrying on every launch
      try { fs.unlinkSync(migrationFlagPath); } catch { /* ignore */ }
    }
  }


  const stepOffset = needsOptimization ? 1 : 0;

  // Step N+1: Ensure Node.js runtime is available
  updateSplash(splash, stepOffset + 1, TOTAL_STEPS, "Verificando entorno...");
  const nodeResult = await ensureNodeRuntime((msg) => {
    updateSplash(splash, stepOffset + 1, TOTAL_STEPS, msg);
  });
  if (nodeResult.source === "portable") {
    logger.info(`Using portable Node.js from ${nodeResult.nodeBinDir}`);
  } else {
    logger.info(`Using system Node.js from ${nodeResult.nodeBinDir}`);
  }

  // Pre-cache node status so the renderer's SetupBanner gets an instant
  // response (no flash of "install Node.js" banner).
  try {
    const { execSync } = require("child_process");
    const ver = execSync("node --version", { timeout: 5000, encoding: "utf-8" }).trim();
    const { preCacheNodeStatus } = await import("./ipc/handlers/node_handlers");
    preCacheNodeStatus(ver);
  } catch (e) {
    logger.warn("Failed to pre-cache node status (non-fatal):", e);
  }

  // Step N+2: Hydrate KV preferences from BunnyDB (BEFORE creating the window)
  // This must happen first so that when the renderer starts and calls getUserSettings,
  // the preferences cache is already populated with the real data (API keys, model selections, etc.).
  // Previously this ran after createWindow(), causing a race condition where the renderer
  // got empty defaults and flashed "configure OpenRouter" banners.
  const sessionData = readSession();
  updateSplash(splash, stepOffset + 2, TOTAL_STEPS, "Cargando preferencias...");
  if (sessionData?.userId) {
    try {
      await initializeRemoteSchema();
      await preferencesCache.hydrate(sessionData.userId);
      logger.info(`Splash: hydrated preferences for ${sessionData.userId}`);
    } catch (err) {
      logger.warn("Splash: preferences hydration failed (non-fatal):", err);
    }
  } else {
    logger.info("Splash: no session found, skipping preferences hydration");
  }


  // Step N+3: Create main window (now preferences are ready for the renderer)
  updateSplash(splash, stepOffset + 3, TOTAL_STEPS, "Preparando interfaz...");
  createWindow();
  createApplicationMenu();

  // Step N+4: Validate configured models still exist in OpenRouter
  updateSplash(splash, stepOffset + 4, TOTAL_STEPS, "Validando modelos...");
  await validateModelSettings().catch((err) =>
    logger.warn("Model validation failed (non-fatal):", err),
  );

  // Step N+5: Show main window and close splash
  // The main window renders behind the splash (splash is alwaysOnTop).
  // No need to wait for did-finish-load — the window has backgroundColor
  // "#1e1e24" (dark) so there's no white flash. The skeleton/app renders
  // naturally while the splash fades away.
  updateSplash(splash, stepOffset + 5, TOTAL_STEPS, "Cargando...");
  if (mainWindow) {
    mainWindow.show();
  }
  await closeSplash(splash);

  // Non-blocking background tasks (don't need splash progress)
  setImmediate(async () => {
    // Warm up scaffold caches now that Node.js is guaranteed in PATH.
    // Previously in ipc_host.ts, moved here to avoid race condition.
    const { warmUpScaffoldCache } = await import("./ipc/utils/scaffold_cache");
    warmUpScaffoldCache().catch(err =>
      logger.error("Scaffold cache warmup failed:", err),
    );

    // Check/install OpenCode binary in background (was blocking splash for ~2.2s)
    const openCodeResult = await ensureOpenCodeInstalled();
    if (!openCodeResult.ok) {
      logger.warn("OpenCode installation failed — agent mode will not work until manually installed");
    } else if (openCodeResult.updated) {
      logger.info(`OpenCode updated to v${openCodeResult.version}`);
    }

    // Add vibes-apps directory to git safe.directory (required for Windows).
    if (settings.enableNativeGit) {
      await gitAddSafeDirectory(`${getVibesAppsBaseDirectory()}/*`);
    }

    // Start performance monitoring after everything is initialized
    startPerformanceMonitoring();

    logger.info("Background initialization completed");
  });
}

export async function onFirstRunMaybe(settings: UserSettings) {
  if (!settings.hasRunBefore) {
    await promptMoveToApplicationsFolder();
    writeSettings({
      hasRunBefore: true,
    });
  }
  if (IS_TEST_BUILD) {
    writeSettings({
      isTestMode: true,
    });
  }
}

async function promptMoveToApplicationsFolder(): Promise<void> {
  if (IS_TEST_BUILD) return;
  if (process.platform !== "darwin") return;
  if (app.isInApplicationsFolder()) return;
  logger.log("Prompting user to move to applications folder");

  const { response } = await dialog.showMessageBox({
    type: "question",
    buttons: ["Move to Applications Folder", "Do Not Move"],
    defaultId: 0,
    message: "Move to Applications Folder?",
  });

  if (response === 0) {
    logger.log("User chose to move to applications folder");
    app.moveToApplicationsFolder();
  } else {
    logger.log("User chose not to move to applications folder");
  }
}

declare global {
  const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;
}

let mainWindow: BrowserWindow | null = null;
let pendingForceCloseData: any = null;

/**
 * Validates that the saved window position is on a visible display.
 * If the target display is no longer available, returns undefined so
 * Electron places the window on the primary display.
 */
function getValidatedWindowPosition(windowState?: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  isMaximized?: boolean;
}): { x?: number; y?: number } {
  if (windowState?.x == null || windowState?.y == null) {
    return {};
  }

  const displays = screen.getAllDisplays();
  // Check if the saved position falls within any available display
  const targetDisplay = displays.find((display) => {
    const { x, y, width, height } = display.bounds;
    return (
      windowState.x! >= x &&
      windowState.x! < x + width &&
      windowState.y! >= y &&
      windowState.y! < y + height
    );
  });

  if (targetDisplay) {
    return { x: windowState.x, y: windowState.y };
  }

  // Target monitor is gone — let Electron center the window on primary display
  logger.warn(
    `Saved window position (${windowState.x}, ${windowState.y}) is off-screen. Resetting to primary display.`,
  );
  return {};
}

const createWindow = () => {
  const settings = readSettings();
  const windowState = settings.windowState;
  const validatedPosition = getValidatedWindowPosition(windowState);

  mainWindow = new BrowserWindow({
    x: validatedPosition.x,
    y: validatedPosition.y,
    width:
      windowState?.width || (process.env.NODE_ENV === "development" ? 1280 : 960),
    minWidth: 800,
    height: windowState?.height || 700,
    minHeight: 500,
    // Show window only after content is rendered to prevent white flash (VS Code pattern)
    show: false,
    backgroundColor: "#1e1e24", // Match dark theme to prevent white flash
    titleBarStyle: "hidden",
    titleBarOverlay: false,
    trafficLightPosition: {
      x: 10,
      y: 8,
    },
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
      // Enable V8 code caching — compiles and caches JS bytecode immediately
      // instead of waiting for hot paths. Dramatically faster subsequent loads.
      v8CacheOptions: "bypassHeatCheck",
      // Disable spellcheck to reduce CPU overhead (we handle it ourselves)
      spellcheck: false,
      // Prevent Chromium from throttling timers/animations when window loses focus
      backgroundThrottling: false,
    },
    icon: path.join(app.getAppPath(), IS_VIBES_PROFILE ? "assets/icon-vibes/logo.png" : "assets/icon/logo.png"),
  });
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, "../renderer/main_window/index.html"),
    );
  }

  // Show window is handled by the splash manager in onReady().
  // The splash closes first, then mainWindow.show() is called.

  if (pendingForceCloseData) {
    mainWindow.webContents.once("did-finish-load", () => {
      mainWindow?.webContents.send(
        "force-close-detected",
        pendingForceCloseData,
      );
      pendingForceCloseData = null;
    });
  }

  mainWindow.webContents.on("context-menu", (event, params) => {
    event.preventDefault();

    const template: Electron.MenuItemConstructorOptions[] = [];
    if (params.isEditable) {
      template.push(
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "delete" },
      );
      if (params.misspelledWord) {
        const suggestions: Electron.MenuItemConstructorOptions[] =
          params.dictionarySuggestions.slice(0, 5).map((suggestion) => ({
            label: suggestion,
            click: () => {
              try {
                mainWindow?.webContents.replaceMisspelling(suggestion);
              } catch (error) {
                logger.error("Failed to replace misspelling:", error);
              }
            },
          }));
        template.push(
          { type: "separator" },
          {
            type: "submenu",
            label: `Correct "${params.misspelledWord}"`,
            submenu: suggestions,
          },
        );
      }
      template.push({ type: "separator" }, { role: "selectAll" });
    } else {
      if (params.selectionText && params.selectionText.length > 0) {
        template.push({ role: "copy" });
      }
      template.push({ role: "selectAll" });
    }

    template.push(
      { type: "separator" },
      {
        label: "Inspect Element",
        click: () => mainWindow?.webContents.inspectElement(params.x, params.y),
      },
    );

    const menu = Menu.buildFromTemplate(template);
    menu.popup({ window: mainWindow! });
  });

  if (windowState?.isMaximized ?? true) {
    mainWindow.maximize();
  }

  const saveWindowState = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const isMaximized = mainWindow.isMaximized();
    const currentSettings = readSettings();
    const newState = {
      ...currentSettings.windowState,
      isMaximized,
    };

    if (!isMaximized) {
      const bounds = mainWindow.getBounds();
      newState.x = bounds.x;
      newState.y = bounds.y;
      newState.width = bounds.width;
      newState.height = bounds.height;
    }

    writeSettings({ windowState: newState });
  };

  let saveTimeout: NodeJS.Timeout;
  const debouncedSave = () => {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(saveWindowState, 500);
  };

  mainWindow.on("resize", debouncedSave);
  mainWindow.on("move", debouncedSave);
  mainWindow.on("maximize", saveWindowState);
  mainWindow.on("unmaximize", saveWindowState);

  // Save state synchronously on close so hot-reload / forced restarts
  // don't lose the window position (the debounce may not have fired yet).
  mainWindow.on("close", () => {
    clearTimeout(saveTimeout);
    saveWindowState();
  });
};

const createApplicationMenu = () => {
  const isMac = process.platform === "darwin";

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
        {
          label: app.name,
          submenu: [
            { role: "about" as const },
            { type: "separator" as const },
            { role: "services" as const },
            { type: "separator" as const },
            { role: "hide" as const },
            { role: "hideOthers" as const },
            { role: "unhide" as const },
            { type: "separator" as const },
            { role: "quit" as const },
          ],
        },
      ]
      : []),
    {
      label: "Edit",
      submenu: [
        { role: "undo" as const },
        { role: "redo" as const },
        { type: "separator" as const },
        { role: "cut" as const },
        { role: "copy" as const },
        { role: "paste" as const },
        { role: "delete" as const },
        { type: "separator" as const },
        { role: "selectAll" as const },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" as const },
        { role: "forceReload" as const },
        ...(process.env.NODE_ENV === "development"
          ? [{ role: "toggleDevTools" as const }]
          : []),
        { type: "separator" as const },
        { role: "resetZoom" as const },
        { role: "zoomIn" as const },
        { role: "zoomOut" as const },
        { type: "separator" as const },
        { role: "togglefullscreen" as const },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" as const },
        { role: "zoom" as const },
        ...(isMac
          ? [
            { type: "separator" as const },
            { role: "front" as const },
            { type: "separator" as const },
            { role: "window" as const },
          ]
          : [{ role: "close" as const }]),
      ],
    },
  ];

  const appMenu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(appMenu);
};

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, commandLine, _workingDirectory) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    handleDeepLinkReturn(commandLine.pop()!);
  });
  app.whenReady().then(onReady);
}

app.on("open-url", (event, url) => {
  handleDeepLinkReturn(url);
});

async function handleDeepLinkReturn(url: string) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    log.info("Invalid deep link URL", url);
    return;
  }

  log.log(
    "Handling deep link: protocol",
    parsed.protocol,
    "hostname",
    parsed.hostname,
  );

  // Handle Google iOS-style redirect (e.g. com.googleusercontent.apps.xxx:/oauth2redirect)
  if (parsed.protocol === "com.googleusercontent.apps.772397727909-7qjcbdkgt45ld7q91ijqdp4m8s0rngm3:" && parsed.pathname === "/oauth2redirect") {
    const code = parsed.searchParams.get("code");
    if (code) {
      await handleFirebaseOAuthReturn({ code });
      mainWindow?.webContents.send("deep-link-received", {
        type: "firebase-oauth-return",
      });
      return;
    }
  }

  if (parsed.protocol !== "dyad:") {
    dialog.showErrorBox(
      "Invalid Protocol",
      `Expected dyad://, got ${parsed.protocol}. Full URL: ${url}`,
    );
    return;
  }

  if (parsed.hostname === "neon-oauth-return") {
    const token = parsed.searchParams.get("token");
    const refreshToken = parsed.searchParams.get("refreshToken");
    const expiresIn = Number(parsed.searchParams.get("expiresIn"));
    if (!token || !refreshToken || !expiresIn) {
      dialog.showErrorBox(
        "Invalid URL",
        "Expected token, refreshToken, and expiresIn",
      );
      return;
    }
    await handleNeonOAuthReturn({ token, refreshToken, expiresIn });
    mainWindow?.webContents.send("deep-link-received", {
      type: parsed.hostname,
    });
    return;
  }

  if (parsed.hostname === "firebase-oauth-return") {
    const code = parsed.searchParams.get("code");
    if (!code) {
      dialog.showErrorBox("Invalid URL", "Expected code parameter");
      return;
    }
    await handleFirebaseOAuthReturn({ code });
    mainWindow?.webContents.send("deep-link-received", {
      type: parsed.hostname,
    });
    return;
  }

  if (parsed.hostname === "supabase-oauth-return") {
    const token = parsed.searchParams.get("token");
    const refreshToken = parsed.searchParams.get("refreshToken");
    const expiresIn = Number(parsed.searchParams.get("expiresIn"));
    if (!token || !refreshToken || !expiresIn) {
      dialog.showErrorBox(
        "Invalid URL",
        "Expected token, refreshToken, and expiresIn",
      );
      return;
    }
    await handleSupabaseOAuthReturn({ token, refreshToken, expiresIn });
    mainWindow?.webContents.send("deep-link-received", {
      type: parsed.hostname,
    });
    return;
  }

  if (parsed.hostname === "vibes-pro-return") {
    const apiKey = parsed.searchParams.get("key");
    if (!apiKey) {
      dialog.showErrorBox("Invalid URL", "Expected key");
      return;
    }
    await handleProReturn({
      apiKey,
    });
    mainWindow?.webContents.send("deep-link-received", {
      type: parsed.hostname,
    });
    return;
  }

  if (parsed.hostname === "add-mcp-server") {
    const name = parsed.searchParams.get("name");
    const config = parsed.searchParams.get("config");
    if (!name || !config) {
      dialog.showErrorBox("Invalid URL", "Expected name and config");
      return;
    }

    try {
      const decodedConfigJson = atob(config);
      const decodedConfig = JSON.parse(decodedConfigJson);
      const parsedConfig = AddMcpServerConfigSchema.parse(decodedConfig);

      mainWindow?.webContents.send("deep-link-received", {
        type: parsed.hostname,
        payload: {
          name,
          config: parsedConfig,
        } as AddMcpServerPayload,
      });
    } catch (error) {
      logger.error("Failed to parse add-mcp-server deep link:", error);
      dialog.showErrorBox(
        "Invalid MCP Server Configuration",
        "The deep link contains malformed configuration data. Please check the URL and try again.",
      );
    }
    return;
  }

  if (parsed.hostname === "add-prompt") {
    const data = parsed.searchParams.get("data");
    if (!data) {
      dialog.showErrorBox("Invalid URL", "Expected data parameter");
      return;
    }

    try {
      const decodedJson = atob(data);
      const decoded = JSON.parse(decodedJson);
      const parsedData = AddPromptDataSchema.parse(decoded);

      mainWindow?.webContents.send("deep-link-received", {
        type: parsed.hostname,
        payload: parsedData as AddPromptPayload,
      });
    } catch (error) {
      logger.error("Failed to parse add-prompt deep link:", error);
      dialog.showErrorBox(
        "Invalid Prompt Data",
        "The deep link contains malformed data. Please check the URL and try again.",
      );
    }
    return;
  }

  dialog.showErrorBox("Invalid deep link URL", url);
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("will-quit", () => {
  logger.info("App is quitting, setting isRunning to false");
  // Kill all dev servers started from Vibes to prevent orphan processes
  stopAllRunningApps();
  shutdownOpenCode();
  stopPerformanceMonitoring();
  // Persist any pending memory buffers so they're processed on next startup
  try {
    serializePendingBuffers();
  } catch (err: any) {
    logger.warn("Failed to serialize pending memory buffers:", err.message);
  }
  writeSettings({ isRunning: false });
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
