import { BrowserWindow, Menu, MenuItem } from "electron";
import * as path from "node:path";
import log from "electron-log";
import { platform } from "os";
import { createTypedHandler } from "./base";
import { systemContracts } from "../types/system";
import { getRemoteDb } from "../../db/remote";
import * as remoteSchema from "../../db/remote-schema";
import { and, eq } from "drizzle-orm";
import { readSettings, writeSettings } from "../../main/settings";

// eslint-disable-next-line no-var
declare let MAIN_WINDOW_VITE_DEV_SERVER_URL: string;

const logger = log.scope("window-handlers");

// Track database viewer windows to avoid duplicates
const databaseWindows = new Map<number, BrowserWindow>();

// Track Git viewer windows to avoid duplicates
const gitWindows = new Map<number, BrowserWindow>();

// Track chat windows to avoid duplicates (P18 — dedicated chat+preview)
const chatWindows = new Map<number, BrowserWindow>();

// Track console viewer windows to avoid duplicates
const consoleWindows = new Map<number, BrowserWindow>();

// Temporary store for pending prompts+attachments passed to chat windows via IPC
// Keyed by chatId — the chat window retrieves and clears this on mount
const pendingChatPrompts = new Map<number, {
  prompt: string;
  attachments?: Array<{ name: string; type: string; data: string; attachmentType: "upload-to-codebase" | "chat-context" }>;
}>();

export function registerWindowHandlers() {
  logger.debug("Registering window control handlers");

  createTypedHandler(systemContracts.minimizeWindow, async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) {
      logger.error("Failed to get BrowserWindow instance for minimize command");
      return;
    }
    window.minimize();
  });

  createTypedHandler(systemContracts.maximizeWindow, async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) {
      logger.error("Failed to get BrowserWindow instance for maximize command");
      return;
    }
    if (window.isMaximized()) {
      window.restore();
    } else {
      window.maximize();
    }
  });

  createTypedHandler(systemContracts.closeWindow, async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) {
      logger.error("Failed to get BrowserWindow instance for close command");
      return;
    }
    window.close();
  });

  createTypedHandler(systemContracts.getSystemPlatform, async () => {
    return platform();
  });

  createTypedHandler(systemContracts.openDatabaseWindow, async (event, { appId }) => {
    // If a window for this appId already exists, focus it
    const existing = databaseWindows.get(appId);
    if (existing && !existing.isDestroyed()) {
      existing.focus();
      return;
    }

    // Fetch app name for the window title
    let appName = "Base de datos";
    try {
      const db = getRemoteDb();
      const settings = readSettings();
      if (settings.userId) {
        const app = await db.query.apps.findFirst({ where: and(eq(remoteSchema.apps.id, appId), eq(remoteSchema.apps.userId, settings.userId)) });
        if (app?.name) appName = app.name;
      }
    } catch (e) {
      logger.warn(`Could not fetch app name for database window title: ${e}`);
    }

    const dbWindow = new BrowserWindow({
      width: 1000,
      height: 700,
      minWidth: 600,
      minHeight: 400,
      // No parent — independent window with its own taskbar entry
      skipTaskbar: false,
      title: `${appName} — Base de datos`,
      autoHideMenuBar: true,
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
      },
    });

    // Remove native menu bar entirely (File, Edit, View, etc.)
    dbWindow.removeMenu();

    // Re-enable right-click → Inspect Element (dev tools)
    dbWindow.webContents.on("context-menu", (_e, params) => {
      const menu = new Menu();
      menu.append(new MenuItem({
        label: "Inspect Element",
        click: () => {
          dbWindow.webContents.inspectElement(params.x, params.y);
        },
      }));
      menu.popup();
    });

    // Re-register keyboard shortcuts lost by removeMenu()
    dbWindow.webContents.on("before-input-event", (_e, input) => {
      if (input.type !== "keyDown") return;
      const ctrl = input.control || input.meta;
      if ((ctrl && input.shift && input.key.toLowerCase() === "r") || input.key === "F5") {
        dbWindow.webContents.reloadIgnoringCache();
      }
      if (ctrl && !input.shift && input.key.toLowerCase() === "r") {
        dbWindow.webContents.reload();
      }
      if (input.key === "F12" || (ctrl && input.shift && input.key.toLowerCase() === "i")) {
        dbWindow.webContents.toggleDevTools();
      }
    });

    const queryParam = `?window=database&appId=${appId}`;

    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      dbWindow.loadURL(`${MAIN_WINDOW_VITE_DEV_SERVER_URL}${queryParam}`);
    } else {
      dbWindow.loadFile(
        path.join(__dirname, "../renderer/main_window/index.html"),
        { search: queryParam },
      );
    }

    databaseWindows.set(appId, dbWindow);

    dbWindow.on("closed", () => {
      databaseWindows.delete(appId);
    });

    logger.info(`Opened database viewer window for app ${appId}`);
  });

  // Git viewer window — lazy, only loaded on demand
  createTypedHandler(systemContracts.openGitWindow, async (event, { appId, commitHash, theme, themeIntensity }) => {
    // If a window for this appId already exists, focus it
    const existing = gitWindows.get(appId);
    if (existing && !existing.isDestroyed()) {
      existing.focus();
      return;
    }

    // Fetch app name for the window title
    let appName = "Git";
    try {
      const db = getRemoteDb();
      const settings = readSettings();
      if (settings.userId) {
        const app = await db.query.apps.findFirst({ where: and(eq(remoteSchema.apps.id, appId), eq(remoteSchema.apps.userId, settings.userId)) });
        if (app?.name) appName = app.name;
      }
    } catch (e) {
      logger.warn(`Could not fetch app name for git window title: ${e}`);
    }

    const gitWindow = new BrowserWindow({
      width: 1100,
      height: 750,
      minWidth: 700,
      minHeight: 500,
      // No parent — independent window with its own taskbar entry
      skipTaskbar: false,
      title: `${appName} — Control de Git`,
      autoHideMenuBar: true,
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
      },
    });

    // Remove native menu bar entirely (File, Edit, View, etc.)
    gitWindow.removeMenu();

    // Re-enable right-click → Inspect Element (dev tools)
    gitWindow.webContents.on("context-menu", (_e, params) => {
      const menu = new Menu();
      menu.append(new MenuItem({
        label: "Inspect Element",
        click: () => {
          gitWindow.webContents.inspectElement(params.x, params.y);
        },
      }));
      menu.popup();
    });

    // Re-register keyboard shortcuts lost by removeMenu()
    gitWindow.webContents.on("before-input-event", (_e, input) => {
      if (input.type !== "keyDown") return;
      const ctrl = input.control || input.meta;
      if ((ctrl && input.shift && input.key.toLowerCase() === "r") || input.key === "F5") {
        gitWindow.webContents.reloadIgnoringCache();
      }
      if (ctrl && !input.shift && input.key.toLowerCase() === "r") {
        gitWindow.webContents.reload();
      }
      if (input.key === "F12" || (ctrl && input.shift && input.key.toLowerCase() === "i")) {
        gitWindow.webContents.toggleDevTools();
      }
    });

    const commitParam = commitHash ? `&commitHash=${encodeURIComponent(commitHash)}` : "";
    const themeParam = theme ? `&theme=${theme}` : "";
    const intensityParam = themeIntensity != null ? `&intensity=${themeIntensity}` : "";
    const queryParam = `?window=git&appId=${appId}${commitParam}${themeParam}${intensityParam}`;

    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      gitWindow.loadURL(`${MAIN_WINDOW_VITE_DEV_SERVER_URL}${queryParam}`);
    } else {
      gitWindow.loadFile(
        path.join(__dirname, "../renderer/main_window/index.html"),
        { search: queryParam },
      );
    }

    gitWindows.set(appId, gitWindow);

    gitWindow.on("closed", () => {
      gitWindows.delete(appId);
    });

    logger.info(`Opened git viewer window for app ${appId}${commitHash ? `, commit ${commitHash}` : ""}`);
  });

  // P18 — Dedicated chat+preview window for performance isolation
  createTypedHandler(systemContracts.openChatWindow, async (event, { appId, chatId, prompt, chatMode, attachments, theme, themeIntensity }) => {
    // Store pending prompt data for the chat window to pick up
    if (prompt && chatId) {
      pendingChatPrompts.set(chatId, { prompt, attachments });
    }

    // If a window for this appId already exists, focus it
    const existing = chatWindows.get(appId);
    if (existing && !existing.isDestroyed()) {
      existing.focus();
      return;
    }

    // Fetch app name for the window title
    let appName = "Chat";
    try {
      const db = getRemoteDb();
      const settings = readSettings();
      if (settings.userId) {
        const app = await db.query.apps.findFirst({ where: and(eq(remoteSchema.apps.id, appId), eq(remoteSchema.apps.userId, settings.userId)) });
        if (app?.name) appName = app.name;
      }
    } catch (e) {
      logger.warn(`Could not fetch app name for window title: ${e}`);
    }

    // Load saved window state
    const settings = readSettings();
    const windowState = settings.windowState;

    const chatWindow = new BrowserWindow({
      width: windowState?.width ?? 1200,
      height: windowState?.height ?? 800,
      x: windowState?.x,
      y: windowState?.y,
      minWidth: 700,
      minHeight: 500,
      // No parent — independent window with its own taskbar entry
      skipTaskbar: false,
      autoHideMenuBar: true,
      title: `${appName} — Vibes Chat`,
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
        v8CacheOptions: "bypassHeatCheck",
        spellcheck: false,
        backgroundThrottling: false,
      },
    });

    if (windowState?.isMaximized) {
      chatWindow.maximize();
    }

    // Remove native menu bar entirely (File, Edit, View, etc.)
    chatWindow.removeMenu();

    // Re-enable right-click → Inspect Element (dev tools)
    chatWindow.webContents.on("context-menu", (_e, params) => {
      const menu = new Menu();
      menu.append(new MenuItem({
        label: "Inspect Element",
        click: () => {
          chatWindow.webContents.inspectElement(params.x, params.y);
        },
      }));
      menu.popup();
    });

    // Re-register keyboard shortcuts lost by removeMenu()
    chatWindow.webContents.on("before-input-event", (_e, input) => {
      if (input.type !== "keyDown") return;
      const ctrl = input.control || input.meta;
      // Ctrl+Shift+R or F5 → hard reload
      if ((ctrl && input.shift && input.key.toLowerCase() === "r") || input.key === "F5") {
        chatWindow.webContents.reloadIgnoringCache();
      }
      // Ctrl+R → normal reload
      if (ctrl && !input.shift && input.key.toLowerCase() === "r") {
        chatWindow.webContents.reload();
      }
      // F12 or Ctrl+Shift+I → toggle DevTools
      if (input.key === "F12" || (ctrl && input.shift && input.key.toLowerCase() === "i")) {
        chatWindow.webContents.toggleDevTools();
      }
    });

    const chatIdParam = chatId ? `&chatId=${chatId}` : "";
    const pendingParam = (prompt && chatId) ? `&hasPendingPrompt=true` : "";
    const chatModeParam = chatMode ? `&chatMode=${chatMode}` : "";
    const themeParam = theme ? `&theme=${theme}` : "";
    const intensityParam = themeIntensity ? `&intensity=${themeIntensity}` : "";
    const queryParam = `?window=chat&appId=${appId}${chatIdParam}${pendingParam}${chatModeParam}${themeParam}${intensityParam}`;

    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      chatWindow.loadURL(`${MAIN_WINDOW_VITE_DEV_SERVER_URL}${queryParam}`);
    } else {
      chatWindow.loadFile(
        path.join(__dirname, "../renderer/main_window/index.html"),
        { search: queryParam },
      );
    }

    chatWindows.set(appId, chatWindow);

    chatWindow.on("close", () => {
      // Save window state before closing
      if (!chatWindow.isDestroyed()) {
        const bounds = chatWindow.getBounds();
        const isMaximized = chatWindow.isMaximized();
        writeSettings({
          windowState: {
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: bounds.height,
            isMaximized,
          },
        });
      }
    });

    chatWindow.on("closed", () => {
      chatWindows.delete(appId);
    });

    logger.info(`Opened chat window for app ${appId}${chatId ? `, chat ${chatId}` : ""}`);
  });

  // Retrieve and clear pending prompt data
  createTypedHandler(systemContracts.getPendingChatPrompt, async (_event, chatId) => {
    const pending = pendingChatPrompts.get(chatId);
    if (pending) {
      pendingChatPrompts.delete(chatId);
      return pending;
    }
    return null;
  });

  // Console viewer window — dedicated window for server logs
  createTypedHandler(systemContracts.openConsoleWindow, async (event, { appId, theme, themeIntensity }) => {
    // If a window for this appId already exists, focus it
    const existing = consoleWindows.get(appId);
    if (existing && !existing.isDestroyed()) {
      existing.focus();
      return;
    }



    // Fetch app name for the window title
    let appName = "Console";
    try {
      const db = getRemoteDb();
      const settings = readSettings();
      if (settings.userId) {
        const app = await db.query.apps.findFirst({ where: and(eq(remoteSchema.apps.id, appId), eq(remoteSchema.apps.userId, settings.userId)) });
        if (app?.name) appName = app.name;
      }
    } catch (e) {
      logger.warn(`Could not fetch app name for console window title: ${e}`);
    }

    const consoleWindow = new BrowserWindow({
      width: 900,
      height: 550,
      minWidth: 500,
      minHeight: 300,
      // No parent — independent window with its own taskbar entry
      skipTaskbar: false,
      title: `${appName} — Consola`,
      autoHideMenuBar: true,
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
      },
    });

    const themeParam = theme ? `&theme=${theme}` : "";
    const intensityParam = themeIntensity != null ? `&intensity=${themeIntensity}` : "";
    const queryParam = `?window=console&appId=${appId}${themeParam}${intensityParam}`;

    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      consoleWindow.loadURL(`${MAIN_WINDOW_VITE_DEV_SERVER_URL}${queryParam}`);
    } else {
      consoleWindow.loadFile(
        path.join(__dirname, "../renderer/main_window/index.html"),
        { search: queryParam },
      );
    }

    consoleWindows.set(appId, consoleWindow);

    consoleWindow.on("closed", () => {
      consoleWindows.delete(appId);
    });

    logger.info(`Opened console viewer window for app ${appId}`);
  });

  // Cross-window navigation: focus the main window and tell it to navigate
  createTypedHandler(systemContracts.navigateMainWindow, async (_event, { route, search }) => {
    // Find the main window — it's the one NOT tracked as chat/db/git/console
    const trackedWindows = new Set<number>();
    for (const w of chatWindows.values()) if (!w.isDestroyed()) trackedWindows.add(w.id);
    for (const w of databaseWindows.values()) if (!w.isDestroyed()) trackedWindows.add(w.id);
    for (const w of gitWindows.values()) if (!w.isDestroyed()) trackedWindows.add(w.id);
    for (const w of consoleWindows.values()) if (!w.isDestroyed()) trackedWindows.add(w.id);

    const mainWindow = BrowserWindow.getAllWindows().find(
      (w) => !w.isDestroyed() && !trackedWindows.has(w.id),
    );

    if (!mainWindow) {
      logger.warn("navigateMainWindow: could not find main window");
      return;
    }

    // Focus
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();

    // Tell renderer to navigate
    mainWindow.webContents.send("navigate-to-route", { route, search });
    logger.info(`navigateMainWindow: sent navigation to ${route}`);
  });
}
