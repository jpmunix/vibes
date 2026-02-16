import { BrowserWindow } from "electron";
import * as path from "node:path";
import log from "electron-log";
import { platform } from "os";
import { createTypedHandler } from "./base";
import { systemContracts } from "../types/system";
import { db } from "../../db";
import { apps } from "../../db/schema";
import { eq } from "drizzle-orm";

// eslint-disable-next-line no-var
declare let MAIN_WINDOW_VITE_DEV_SERVER_URL: string;

const logger = log.scope("window-handlers");

// Track database viewer windows to avoid duplicates
const databaseWindows = new Map<number, BrowserWindow>();

// Track chat windows to avoid duplicates (P18 — dedicated chat+preview)
const chatWindows = new Map<number, BrowserWindow>();

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

    const parentWindow = BrowserWindow.fromWebContents(event.sender);

    const dbWindow = new BrowserWindow({
      width: 1000,
      height: 700,
      minWidth: 600,
      minHeight: 400,
      parent: parentWindow ?? undefined,
      title: "Base de datos",
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, "preload.js"),
      },
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

  // P18 — Dedicated chat+preview window for performance isolation
  createTypedHandler(systemContracts.openChatWindow, async (event, { appId, chatId, prompt, attachments }) => {
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
      const app = await db.query.apps.findFirst({ where: eq(apps.id, appId) });
      if (app?.name) appName = app.name;
    } catch (e) {
      logger.warn(`Could not fetch app name for window title: ${e}`);
    }

    const chatWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      minWidth: 700,
      minHeight: 500,
      // No parent — independent window with its own taskbar entry
      skipTaskbar: false,
      autoHideMenuBar: true,
      title: `${appName} — Vibes Chat`,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, "preload.js"),
        v8CacheOptions: "bypassHeatCheck",
        spellcheck: false,
        backgroundThrottling: false,
      },
    });

    // Remove native menu bar entirely (File, Edit, View, etc.)
    chatWindow.removeMenu();

    const chatIdParam = chatId ? `&chatId=${chatId}` : "";
    const pendingParam = (prompt && chatId) ? `&hasPendingPrompt=true` : "";
    const queryParam = `?window=chat&appId=${appId}${chatIdParam}${pendingParam}`;

    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      chatWindow.loadURL(`${MAIN_WINDOW_VITE_DEV_SERVER_URL}${queryParam}`);
    } else {
      chatWindow.loadFile(
        path.join(__dirname, "../renderer/main_window/index.html"),
        { search: queryParam },
      );
    }

    chatWindows.set(appId, chatWindow);

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
}
