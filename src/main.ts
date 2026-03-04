import { app, BrowserWindow, dialog, Menu } from "electron";
import * as path from "node:path";
import { registerIpcHandlers } from "./ipc/ipc_host";
import dotenv from "dotenv";
// @ts-ignore
import started from "electron-squirrel-startup";
import log from "electron-log";
import {
  getSettingsFilePath,
  readSettings,
  writeSettings,
} from "./main/settings";
import { handleSupabaseOAuthReturn } from "./supabase_admin/supabase_return_handler";
import { handleDyadProReturn } from "./main/pro";
import { IS_TEST_BUILD } from "./ipc/utils/test_utils";

import { getDatabasePath, initializeDatabase } from "./db";
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
import { cleanupOldAiMessagesJson } from "./pro/main/ipc/handlers/local_agent/ai_messages_cleanup";
import fs from "fs";
import { gitAddSafeDirectory } from "./ipc/utils/git_utils";
import { getDyadAppsBaseDirectory } from "./paths/paths";

log.errorHandler.startCatching();
log.eventLogger.startLogging();
log.scope.labelPadding = false;

// Optimization: Only write errors to disk to avoid I/O contention
log.transports.file.level = "error";
log.transports.console.level = "info"; // Keep info logs in console/stdout

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

  // Create window FIRST to show UI quickly.
  // IMPORTANT: Do NOT await any heavy I/O (like BackupManager or DB init)
  // before this point. Blocking the event loop here starves Chromium's GPU
  // process of IPC messages, causing kTransientFailure on CreateCommandBuffer.
  await onFirstRunMaybe(settings);
  createWindow();
  createApplicationMenu();

  // Then do heavy operations in background (non-blocking)
  setImmediate(async () => {
    // Initialize database
    initializeDatabase();

    // Cleanup old ai_messages_json entries to prevent database bloat
    await cleanupOldAiMessagesJson();

    // Add dyad-apps directory to git safe.directory (required for Windows).
    if (settings.enableNativeGit) {
      await gitAddSafeDirectory(`${getDyadAppsBaseDirectory()}/*`);
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

const createWindow = () => {
  const settings = readSettings();
  const windowState = settings.windowState;

  mainWindow = new BrowserWindow({
    x: windowState?.x,
    y: windowState?.y,
    width:
      windowState?.width || (process.env.NODE_ENV === "development" ? 1280 : 960),
    minWidth: 800,
    height: windowState?.height || 700,
    minHeight: 500,
    // Show window only after content is rendered to prevent white flash (VS Code pattern)
    show: false,
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
    icon: path.join(app.getAppPath(), "assets/icon/logo.png"),
  });
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, "../renderer/main_window/index.html"),
    );
  }

  // Show window once content is rendered (prevents white flash on startup)
  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

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

  if (windowState?.isMaximized) {
    mainWindow.maximize();
  }

  const saveWindowState = () => {
    if (!mainWindow) return;
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

  if (parsed.hostname === "dyad-pro-return") {
    const apiKey = parsed.searchParams.get("key");
    if (!apiKey) {
      dialog.showErrorBox("Invalid URL", "Expected key");
      return;
    }
    await handleDyadProReturn({
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
  stopPerformanceMonitoring();
  writeSettings({ isRunning: false });
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
