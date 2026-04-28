import { BrowserWindow, Menu, MenuItem, app, nativeImage } from "electron";
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

// Track message debug windows to avoid duplicates
const messageWindows = new Map<number, BrowserWindow>();

// Track console viewer windows to avoid duplicates
const consoleWindows = new Map<number, BrowserWindow>();

// Track code viewer windows to avoid duplicates
const codeWindows = new Map<number, BrowserWindow>();

// Track memory viewer windows to avoid duplicates
const memoryWindows = new Map<number, BrowserWindow>();

// Temporary store for pending prompts+attachments passed to chat windows via IPC
// Keyed by chatId — the chat window retrieves and clears this on mount
const pendingChatPrompts = new Map<number, {
  prompt: string;
  attachments?: Array<{ name: string; type: string; data: string; attachmentType: "upload-to-codebase" | "chat-context" }>;
}>();

export function registerWindowHandlers() {
  logger.debug("Registering window control handlers");

  // Admin panel — singleton window (not app-scoped)
  const ADMIN_USER_ID = "295703a0-093e-4b1a-9d27-9b8c4e2a2b71";
  let adminWindow: BrowserWindow | null = null;

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

  createTypedHandler(systemContracts.isWindowMaximized, async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return false;
    return window.isMaximized();
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
      title: `${appName} – Base de datos`,
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

    const gitIconPath = path.join(app.getAppPath(), "assets/icon/logo.png");
    const gitIcon = nativeImage.createFromPath(gitIconPath);

    const gitWindow = new BrowserWindow({
      width: 1100,
      height: 750,
      minWidth: 700,
      minHeight: 500,
      // No parent — independent window with its own taskbar entry
      skipTaskbar: false,
      title: `${appName} – Git`,
      icon: gitIcon,
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

    // Explicitly set icon after creation (required on some Linux WMs like Cinnamon)
    if (!gitIcon.isEmpty()) {
      gitWindow.setIcon(gitIcon);
    } else {
      logger.warn(`git icon not found at: ${gitIconPath}`);
    }

    // Prevent the renderer (HTML <title>) from overriding our window title
    gitWindow.on("page-title-updated", (e) => {
      e.preventDefault();
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
      title: `${appName} – Chat`,
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

  // Dedicated debug window for viewing a specific message in full mode
  createTypedHandler(systemContracts.openMessageWindow, async (event, { appId, chatId, messageId, theme, themeIntensity }, context) => {
    // If a window for this message already exists, focus it
    const existing = messageWindows.get(messageId);
    if (existing && !existing.isDestroyed()) {
      existing.focus();
      return;
    }

    let windowTitle = "Mensaje";
    if (context.userId) {
      const db = getRemoteDb();
      const chat = await db.query.chats.findFirst({
        where: and(eq(remoteSchema.chats.id, chatId), eq(remoteSchema.chats.userId, context.userId)),
        columns: { title: true },
      });
      if (chat?.title) {
        windowTitle = chat.title;
      }
    }

    const messageWindow = new BrowserWindow({
      show: false,
      width: 800,
      height: 600,
      minWidth: 500,
      minHeight: 400,
      skipTaskbar: false,
      autoHideMenuBar: true,
      title: windowTitle,
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

    // Remove native menu bar entirely
    messageWindow.removeMenu();

    // Maximize and block-show to prevent layout flash
    messageWindow.maximize();
    messageWindow.show();

    // Re-enable right-click → Inspect Element (dev tools)
    messageWindow.webContents.on("context-menu", (_e, params) => {
      const menu = new Menu();
      menu.append(new MenuItem({
        label: "Inspect Element",
        click: () => {
          messageWindow.webContents.inspectElement(params.x, params.y);
        },
      }));
      menu.popup();
    });

    // Re-register keyboard shortcuts
    messageWindow.webContents.on("before-input-event", (_e, input) => {
      if (input.type !== "keyDown") return;
      const ctrl = input.control || input.meta;
      if ((ctrl && input.shift && input.key.toLowerCase() === "r") || input.key === "F5") {
        messageWindow.webContents.reloadIgnoringCache();
      }
      if (ctrl && !input.shift && input.key.toLowerCase() === "r") {
        messageWindow.webContents.reload();
      }
      if (input.key === "F12" || (ctrl && input.shift && input.key.toLowerCase() === "i")) {
        messageWindow.webContents.toggleDevTools();
      }
    });

    const themeParam = theme ? `&theme=${theme}` : "";
    const intensityParam = themeIntensity ? `&intensity=${themeIntensity}` : "";
    const queryParam = `?window=message&appId=${appId}&chatId=${chatId}&messageId=${messageId}${themeParam}${intensityParam}`;

    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      messageWindow.loadURL(`${MAIN_WINDOW_VITE_DEV_SERVER_URL}${queryParam}`);
    } else {
      messageWindow.loadFile(
        path.join(__dirname, "../renderer/main_window/index.html"),
        { search: queryParam },
      );
    }

    messageWindows.set(messageId, messageWindow);

    messageWindow.on("closed", () => {
      messageWindows.delete(messageId);
    });

    logger.info(`Opened message window for message ${messageId}`);
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
      title: `${appName} – Consola`,
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

  // Code viewer window — dedicated file explorer + editor
  createTypedHandler(systemContracts.openCodeWindow, async (event, { appId, theme, themeIntensity }) => {
    // If a window for this appId already exists, focus it
    const existing = codeWindows.get(appId);
    if (existing && !existing.isDestroyed()) {
      existing.focus();
      return;
    }

    // Fetch app name for the window title
    let appName = "Código";
    try {
      const db = getRemoteDb();
      const settings = readSettings();
      if (settings.userId) {
        const app = await db.query.apps.findFirst({ where: and(eq(remoteSchema.apps.id, appId), eq(remoteSchema.apps.userId, settings.userId)) });
        if (app?.name) appName = app.name;
      }
    } catch (e) {
      logger.warn(`Could not fetch app name for code window title: ${e}`);
    }

    const codeIconPath = path.join(app.getAppPath(), "assets/icon/logo.png");
    const codeIcon = nativeImage.createFromPath(codeIconPath);

    const codeWindow = new BrowserWindow({
      width: 1100,
      height: 750,
      minWidth: 700,
      minHeight: 500,
      // No parent — independent window with its own taskbar entry
      skipTaskbar: false,
      title: `${appName} – Código`,
      icon: codeIcon,
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

    // Explicitly set icon after creation (required on some Linux WMs like Cinnamon)
    if (!codeIcon.isEmpty()) {
      codeWindow.setIcon(codeIcon);
    } else {
      logger.warn(`code icon not found at: ${codeIconPath}`);
    }

    // Prevent the renderer (HTML <title>) from overriding our window title
    codeWindow.on("page-title-updated", (e) => {
      e.preventDefault();
    });

    // Remove native menu bar entirely (File, Edit, View, etc.)
    codeWindow.removeMenu();

    // Re-enable right-click → Inspect Element (dev tools)
    codeWindow.webContents.on("context-menu", (_e, params) => {
      const menu = new Menu();
      menu.append(new MenuItem({
        label: "Inspect Element",
        click: () => {
          codeWindow.webContents.inspectElement(params.x, params.y);
        },
      }));
      menu.popup();
    });

    // Re-register keyboard shortcuts lost by removeMenu()
    codeWindow.webContents.on("before-input-event", (_e, input) => {
      if (input.type !== "keyDown") return;
      const ctrl = input.control || input.meta;
      if ((ctrl && input.shift && input.key.toLowerCase() === "r") || input.key === "F5") {
        codeWindow.webContents.reloadIgnoringCache();
      }
      if (ctrl && !input.shift && input.key.toLowerCase() === "r") {
        codeWindow.webContents.reload();
      }
      if (input.key === "F12" || (ctrl && input.shift && input.key.toLowerCase() === "i")) {
        codeWindow.webContents.toggleDevTools();
      }
    });

    const themeParam = theme ? `&theme=${theme}` : "";
    const intensityParam = themeIntensity != null ? `&intensity=${themeIntensity}` : "";
    const queryParam = `?window=code&appId=${appId}${themeParam}${intensityParam}`;

    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      codeWindow.loadURL(`${MAIN_WINDOW_VITE_DEV_SERVER_URL}${queryParam}`);
    } else {
      codeWindow.loadFile(
        path.join(__dirname, "../renderer/main_window/index.html"),
        { search: queryParam },
      );
    }

    codeWindows.set(appId, codeWindow);

    codeWindow.on("closed", () => {
      codeWindows.delete(appId);
    });

    logger.info(`Opened code viewer window for app ${appId}`);
  });

  // Cross-window navigation: focus the main window and tell it to navigate
  createTypedHandler(systemContracts.navigateMainWindow, async (_event, { route, search }) => {
    // Find the main window — it's the one NOT tracked as chat/db/git/console/code
    const trackedWindows = new Set<number>();
    for (const w of chatWindows.values()) if (!w.isDestroyed()) trackedWindows.add(w.id);
    for (const w of databaseWindows.values()) if (!w.isDestroyed()) trackedWindows.add(w.id);
    for (const w of gitWindows.values()) if (!w.isDestroyed()) trackedWindows.add(w.id);
    for (const w of consoleWindows.values()) if (!w.isDestroyed()) trackedWindows.add(w.id);
    for (const w of codeWindows.values()) if (!w.isDestroyed()) trackedWindows.add(w.id);
    for (const w of messageWindows.values()) if (!w.isDestroyed()) trackedWindows.add(w.id);
    for (const w of memoryWindows.values()) if (!w.isDestroyed()) trackedWindows.add(w.id);
    if (adminWindow && !adminWindow.isDestroyed()) trackedWindows.add(adminWindow.id);

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

  // Memory viewer window — dedicated diagnostic panel for agent memories
  createTypedHandler(systemContracts.openMemoryWindow, async (event, { appId, theme, themeIntensity }) => {
    const existing = memoryWindows.get(appId);
    if (existing && !existing.isDestroyed()) {
      existing.focus();
      return;
    }

    let appName = "Memorias";
    try {
      const db = getRemoteDb();
      const settings = readSettings();
      if (settings.userId) {
        const appRow = await db.query.apps.findFirst({ where: and(eq(remoteSchema.apps.id, appId), eq(remoteSchema.apps.userId, settings.userId)) });
        if (appRow?.name) appName = appRow.name;
      }
    } catch (e) {
      logger.warn(`Could not fetch app name for memory window title: ${e}`);
    }

    const memoryWindow = new BrowserWindow({
      width: 900,
      height: 650,
      minWidth: 600,
      minHeight: 400,
      skipTaskbar: false,
      title: `${appName} – Memorias del agente`,
      autoHideMenuBar: true,
      titleBarStyle: "hidden",
      titleBarOverlay: false,
      trafficLightPosition: { x: 10, y: 8 },
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, "preload.js"),
      },
    });

    // Prevent the renderer (HTML <title>) from overriding our window title
    memoryWindow.on("page-title-updated", (e) => {
      e.preventDefault();
    });

    memoryWindow.removeMenu();

    memoryWindow.webContents.on("context-menu", (_e, params) => {
      const menu = new Menu();
      menu.append(new MenuItem({
        label: "Inspect Element",
        click: () => memoryWindow.webContents.inspectElement(params.x, params.y),
      }));
      menu.popup();
    });

    memoryWindow.webContents.on("before-input-event", (_e, input) => {
      if (input.type !== "keyDown") return;
      const ctrl = input.control || input.meta;
      if ((ctrl && input.shift && input.key.toLowerCase() === "r") || input.key === "F5") {
        memoryWindow.webContents.reloadIgnoringCache();
      }
      if (ctrl && !input.shift && input.key.toLowerCase() === "r") {
        memoryWindow.webContents.reload();
      }
      if (input.key === "F12" || (ctrl && input.shift && input.key.toLowerCase() === "i")) {
        memoryWindow.webContents.toggleDevTools();
      }
    });

    const themeParam = theme ? `&theme=${theme}` : "";
    const intensityParam = themeIntensity != null ? `&intensity=${themeIntensity}` : "";
    const queryParam = `?window=memory&appId=${appId}${themeParam}${intensityParam}`;

    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      memoryWindow.loadURL(`${MAIN_WINDOW_VITE_DEV_SERVER_URL}${queryParam}`);
    } else {
      memoryWindow.loadFile(
        path.join(__dirname, "../renderer/main_window/index.html"),
        { search: queryParam },
      );
    }

    memoryWindows.set(appId, memoryWindow);

    memoryWindow.on("closed", () => {
      memoryWindows.delete(appId);
    });

    logger.info(`Opened memory viewer window for app ${appId}`);
  });

  // Admin panel window handler
  createTypedHandler(systemContracts.openAdminWindow, async (event, { theme, themeIntensity }) => {
    // Privilege check: only allow the authorized admin user
    const settings = readSettings();
    if (settings.userId !== ADMIN_USER_ID) {
      logger.warn(`Admin window access denied for user ${settings.userId}`);
      return;
    }

    // If window already exists, focus it
    if (adminWindow && !adminWindow.isDestroyed()) {
      adminWindow.focus();
      return;
    }

    const iconPath = path.join(app.getAppPath(), "assets/icon/logo.png");
    const icon = nativeImage.createFromPath(iconPath);

    adminWindow = new BrowserWindow({
      width: 1000,
      height: 700,
      minWidth: 700,
      minHeight: 500,
      skipTaskbar: false,
      title: "Panel de Administración",
      icon,
      autoHideMenuBar: true,
      titleBarStyle: "hidden",
      titleBarOverlay: false,
      trafficLightPosition: { x: 10, y: 8 },
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, "preload.js"),
      },
    });

    // Explicitly set icon after creation (required on some Linux WMs)
    if (!icon.isEmpty()) {
      adminWindow.setIcon(icon);
    }

    // Prevent the renderer from overriding our window title
    adminWindow.on("page-title-updated", (e) => {
      e.preventDefault();
    });

    adminWindow.removeMenu();

    // Re-enable right-click → Inspect Element
    adminWindow.webContents.on("context-menu", (_e, params) => {
      const menu = new Menu();
      menu.append(new MenuItem({
        label: "Inspect Element",
        click: () => adminWindow!.webContents.inspectElement(params.x, params.y),
      }));
      menu.popup();
    });

    // Re-register keyboard shortcuts
    adminWindow.webContents.on("before-input-event", (_e, input) => {
      if (input.type !== "keyDown") return;
      const ctrl = input.control || input.meta;
      if ((ctrl && input.shift && input.key.toLowerCase() === "r") || input.key === "F5") {
        adminWindow!.webContents.reloadIgnoringCache();
      }
      if (ctrl && !input.shift && input.key.toLowerCase() === "r") {
        adminWindow!.webContents.reload();
      }
      if (input.key === "F12" || (ctrl && input.shift && input.key.toLowerCase() === "i")) {
        adminWindow!.webContents.toggleDevTools();
      }
    });

    const themeParam = theme ? `&theme=${theme}` : "";
    const intensityParam = themeIntensity != null ? `&intensity=${themeIntensity}` : "";
    const queryParam = `?window=admin${themeParam}${intensityParam}`;

    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      adminWindow.loadURL(`${MAIN_WINDOW_VITE_DEV_SERVER_URL}${queryParam}`);
    } else {
      adminWindow.loadFile(
        path.join(__dirname, "../renderer/main_window/index.html"),
        { search: queryParam },
      );
    }

    adminWindow.on("closed", () => {
      adminWindow = null;
    });

    logger.info("Opened admin panel window");
  });
}
