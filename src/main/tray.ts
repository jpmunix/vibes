import { app, BrowserWindow, Menu, Tray, nativeImage } from "electron";
import * as path from "node:path";
import log from "electron-log";
import type { FlavorConfig } from "../flavors";

const logger = log.scope("tray");

let tray: Tray | null = null;
let mainWindowRef: BrowserWindow | null = null;
let flavorRef: FlavorConfig | null = null;

// Icon variants
let normalIcon: Electron.NativeImage | null = null;
let greenIcon: Electron.NativeImage | null = null;
let redIcon: Electron.NativeImage | null = null;

// State tracking
type TrayState = "normal" | "green" | "red";
let currentState: TrayState = "normal";
let activeStreamCount = 0;

// Pending notification messages shown in the context menu
interface PendingNotification {
  id: string;
  text: string;
  chatId?: number;
  timestamp: number;
}
const pendingNotifications: PendingNotification[] = [];
const MAX_PENDING_NOTIFICATIONS = 5;

/**
 * Creates a system-tray icon with a context menu.
 *
 * Behaviour:
 * - Left-click on the tray icon → show / focus the main window.
 * - Right-click → context menu with pending notifications + "Mostrar Vibes" + "Salir".
 * - "Salir" performs a real app.quit() (bypasses the close-to-tray logic).
 *
 * State colors:
 * - Normal: default icon (no activity)
 * - Green: at least one chat stream is running
 * - Red: all streams finished — go check the results
 */
export function createTray(
  mainWindow: BrowserWindow,
  activeFlavor: FlavorConfig,
): Tray {
  mainWindowRef = mainWindow;
  flavorRef = activeFlavor;

  const iconBase = path.join(
    app.getAppPath(),
    `assets/${activeFlavor.iconFolder}`,
  );

  // Pre-load all icon variants
  normalIcon = nativeImage.createFromPath(path.join(iconBase, "tray-icon.png"));
  greenIcon = nativeImage.createFromPath(path.join(iconBase, "tray-icon-green.png"));
  redIcon = nativeImage.createFromPath(path.join(iconBase, "tray-icon-badge.png"));

  tray = new Tray(normalIcon);
  tray.setToolTip(activeFlavor.productName);

  rebuildContextMenu();

  // NOTE: No explicit 'click' handler needed. On Linux (Cinnamon/AppIndicator),
  // setContextMenu() already makes the menu appear on both left and right click.
  // Adding a 'click' handler would consume the event and prevent the native menu.

  // When the window gains focus, clear the red badge and notifications
  mainWindow.on("focus", () => {
    clearPendingNotifications();
    // If no streams running, go back to normal
    if (activeStreamCount <= 0) {
      setTrayState("normal");
    }
  });

  logger.info("System tray created");
  return tray;
}

/**
 * Show and focus the main window, restoring it from minimized state if needed.
 */
function showWindow(mainWindow: BrowserWindow) {
  if (mainWindow.isDestroyed()) return;
  mainWindow.show();
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.focus();
}

// ── State Management ────────────────────────────────────────────────────────

function setTrayState(state: TrayState) {
  if (!tray || tray.isDestroyed()) return;
  if (currentState === state) return;

  const iconMap: Record<TrayState, Electron.NativeImage | null> = {
    normal: normalIcon,
    green: greenIcon,
    red: redIcon,
  };

  const icon = iconMap[state];
  if (!icon) return;

  tray.setImage(icon);
  currentState = state;

  const tooltipMap: Record<TrayState, string> = {
    normal: flavorRef?.productName || "Vibes",
    green: `${flavorRef?.productName || "Vibes"} — Trabajando...`,
    red: `${flavorRef?.productName || "Vibes"} — ¡Tarea completada!`,
  };
  tray.setToolTip(tooltipMap[state]);

  logger.info(`Tray state: ${state} (streams: ${activeStreamCount})`);
}

// ── Stream Lifecycle (called from chat_stream_handlers) ─────────────────────

/**
 * Notify the tray that a new stream has started.
 * Turns the icon green.
 */
export function notifyStreamStarted() {
  activeStreamCount++;
  setTrayState("green");
}

/**
 * Notify the tray that a stream has ended (success or error).
 * When all streams are done, turns the icon red (go check results).
 * If the window is focused, goes directly to normal instead.
 */
export function notifyStreamEnded(notification?: { text: string; chatId?: number }) {
  activeStreamCount = Math.max(0, activeStreamCount - 1);

  if (notification) {
    addPendingNotification(notification.text, notification.chatId);
  }

  if (activeStreamCount <= 0) {
    activeStreamCount = 0;

    // If window is focused, user is already looking → no badge needed
    if (mainWindowRef && !mainWindowRef.isDestroyed() && mainWindowRef.isFocused()) {
      setTrayState("normal");
      clearPendingNotifications();
    } else {
      // All streams done — red badge to invite the user to check
      setTrayState("red");
    }
  }
  // else: still running streams → stay green
}

// ── Pending Notifications (shown in context menu) ───────────────────────────

function addPendingNotification(text: string, chatId?: number) {
  // Truncate long texts
  const truncated = text.length > 80 ? text.slice(0, 77) + "…" : text;

  pendingNotifications.unshift({
    id: `${Date.now()}-${Math.random()}`,
    text: truncated,
    chatId,
    timestamp: Date.now(),
  });

  // Keep only the most recent N
  while (pendingNotifications.length > MAX_PENDING_NOTIFICATIONS) {
    pendingNotifications.pop();
  }

  rebuildContextMenu();
}

function clearPendingNotifications() {
  if (pendingNotifications.length === 0) return;
  pendingNotifications.length = 0;
  rebuildContextMenu();
}

/**
 * Add a notification from outside (e.g. question.asked, permission.asked)
 * and set the tray to red.
 */
export function setTrayBadge(notificationText?: string, chatId?: number) {
  if (notificationText) {
    addPendingNotification(notificationText, chatId);
  }
  // Only set red if no streams are active (green takes priority)
  if (activeStreamCount <= 0) {
    setTrayState("red");
  }
  // If streams are running, the badge will turn red when they finish
}

/**
 * Restore the tray icon to its normal (no-badge) variant.
 */
export function clearTrayBadge() {
  if (activeStreamCount <= 0) {
    setTrayState("normal");
  }
  clearPendingNotifications();
}

// ── Context Menu ────────────────────────────────────────────────────────────

function rebuildContextMenu() {
  if (!tray || tray.isDestroyed()) return;

  const productName = flavorRef?.productName || "Vibes";
  const template: Electron.MenuItemConstructorOptions[] = [];

  // Pending notifications section
  if (pendingNotifications.length > 0) {
    template.push({
      label: `📬 Notificaciones (${pendingNotifications.length})`,
      enabled: false,
    });

    for (const notif of pendingNotifications) {
      template.push({
        label: `  ${notif.text}`,
        click: () => {
          if (mainWindowRef && !mainWindowRef.isDestroyed()) {
            showWindow(mainWindowRef);
          }
        },
      });
    }

    template.push({ type: "separator" });
  }

  // Status indicator
  if (activeStreamCount > 0) {
    const plural = activeStreamCount === 1 ? "tarea" : "tareas";
    template.push({
      label: `🟢 ${activeStreamCount} ${plural} en ejecución`,
      enabled: false,
    });
    template.push({ type: "separator" });
  }

  // Standard items
  template.push({
    label: `Mostrar ${productName}`,
    click: () => {
      if (mainWindowRef && !mainWindowRef.isDestroyed()) {
        showWindow(mainWindowRef);
      }
    },
  });

  template.push({ type: "separator" });

  template.push({
    label: "Salir",
    click: () => {
      (app as any)._forceQuit = true;
      app.quit();
    },
  });

  tray.setContextMenu(Menu.buildFromTemplate(template));
}

// ── Cleanup ─────────────────────────────────────────────────────────────────

/**
 * Destroy the tray icon (called during app shutdown).
 */
export function destroyTray() {
  if (tray && !tray.isDestroyed()) {
    tray.destroy();
    tray = null;
  }
  mainWindowRef = null;
  flavorRef = null;
  normalIcon = null;
  greenIcon = null;
  redIcon = null;
  currentState = "normal";
  activeStreamCount = 0;
  pendingNotifications.length = 0;
}
