import { app, BrowserWindow, Menu, Tray, nativeImage } from "electron";
import * as path from "node:path";
import log from "electron-log";
import type { FlavorConfig } from "../flavors";

const logger = log.scope("tray");

let tray: Tray | null = null;
let mainWindowRef: BrowserWindow | null = null;
let flavorRef: FlavorConfig | null = null;
let currentMenu: Electron.Menu | null = null;

// Icon variants
let normalIcon: Electron.NativeImage | null = null;
let amberIcon: Electron.NativeImage | null = null;
let greenIcon: Electron.NativeImage | null = null;
let questionIcon: Electron.NativeImage | null = null;
let permissionIcon: Electron.NativeImage | null = null;
let errorIcon: Electron.NativeImage | null = null;
let pausedIcon: Electron.NativeImage | null = null;

// State tracking
type TrayState = "normal" | "amber" | "green" | "question" | "permission" | "error" | "paused";
let currentState: TrayState = "normal";
let activeStreamCount = 0;

// Priority: higher number = more important. The tray shows the highest-priority state.
const STATE_PRIORITY: Record<TrayState, number> = {
  normal: 0,
  green: 1,      // completed — go check results
  paused: 2,
  amber: 3,      // working
  question: 4,   // agent needs your answer
  permission: 5, // agent needs permission
  error: 6,      // something broke
};

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
 * Both left-click and right-click open the context menu showing:
 * - Pending notifications (if any)
 * - Active stream count (if any)
 * - "Mostrar Vibes" to restore the window
 * - "Salir" to fully quit
 *
 * State colors:
 * - Normal:     default icon (no activity)
 * - Amber:      at least one stream is running
 * - Green:      all streams finished — go check the results
 * - Question:   agent asked the user a question (blue)
 * - Permission: agent needs user permission (purple)
 * - Error:      a stream/task failed (red)
 * - Paused:     tasks paused (grey)
 */
export function createTray(
  mainWindow: BrowserWindow,
  activeFlavor: FlavorConfig,
): Tray | null {
  // We want the tray in dev mode so we can test the new states.
  // if (!app.isPackaged) {
  //   logger.info("Tray disabled in development mode to allow clean restart");
  //   return null;
  // }
  
  mainWindowRef = mainWindow;
  flavorRef = activeFlavor;

  const iconBase = path.join(
    app.getAppPath(),
    `assets/${activeFlavor.iconFolder}`,
  );

  // Pre-load all icon variants
  normalIcon = nativeImage.createFromPath(path.join(iconBase, "tray-icon.png"));
  amberIcon = nativeImage.createFromPath(
    path.join(iconBase, "tray-icon-amber.png"),
  );
  greenIcon = nativeImage.createFromPath(
    path.join(iconBase, "tray-icon-green.png"),
  );
  questionIcon = nativeImage.createFromPath(
    path.join(iconBase, "tray-icon-question.png"),
  );
  permissionIcon = nativeImage.createFromPath(
    path.join(iconBase, "tray-icon-permission.png"),
  );
  errorIcon = nativeImage.createFromPath(
    path.join(iconBase, "tray-icon-error.png"),
  );
  pausedIcon = nativeImage.createFromPath(
    path.join(iconBase, "tray-icon-paused.png"),
  );

  tray = new Tray(normalIcon);
  tray.setToolTip(activeFlavor.productName);

  rebuildContextMenu();

  // Left-click → restore and focus the window
  tray.on("click", () => {
    showWindow(mainWindow);
  });

  // When the window gains focus, clear the badge and notifications
  mainWindow.on("focus", () => {
    clearPendingNotifications();
    // If streams are still running, show amber; otherwise normal
    if (activeStreamCount > 0) {
      setTrayState("amber");
    } else {
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

const TOOLTIP_MAP: Record<TrayState, string> = {
  normal: "",
  amber: "Trabajando...",
  green: "¡Tarea completada!",
  question: "Pregunta pendiente",
  permission: "Permiso requerido",
  error: "¡Se ha producido un error!",
  paused: "Pausado",
};

function setTrayState(state: TrayState) {
  if (!tray || tray.isDestroyed()) return;
  if (currentState === state) return;

  // Only upgrade to a higher-priority state; lower-priority requests are ignored
  // UNLESS the caller explicitly wants to downgrade (e.g. going back to "normal").
  // We allow downgrades when the new state is "normal" or "amber" or "green"
  // (these represent baseline states after clearing a higher-priority condition).
  const baselineStates: TrayState[] = ["normal", "amber", "green"];
  if (
    !baselineStates.includes(state) &&
    STATE_PRIORITY[state] < STATE_PRIORITY[currentState]
  ) {
    return; // Don't downgrade from a higher-priority alert
  }

  const iconMap: Record<TrayState, Electron.NativeImage | null> = {
    normal: normalIcon,
    amber: amberIcon,
    green: greenIcon,
    question: questionIcon,
    permission: permissionIcon,
    error: errorIcon,
    paused: pausedIcon,
  };

  const icon = iconMap[state];
  if (!icon) return;

  tray.setImage(icon);
  currentState = state;

  const productName = flavorRef?.productName || "Vibes";
  const suffix = TOOLTIP_MAP[state];
  tray.setToolTip(suffix ? `${productName} — ${suffix}` : productName);
  rebuildContextMenu();

  logger.info(`Tray state: ${state} (streams: ${activeStreamCount})`);
}



// ── Stream Lifecycle (called from chat_stream_handlers) ─────────────────────

/**
 * Notify the tray that a new stream has started.
 * Turns the icon amber.
 */
export function notifyStreamStarted() {
  activeStreamCount++;
  setTrayState("amber");
  rebuildContextMenu();
}

/**
 * Notify the tray that a stream has ended (success or error).
 * When all streams are done:
 * - On error → red icon
 * - On success → green icon (go check results)
 * If the window is focused, goes directly to normal instead.
 */
export function notifyStreamEnded(notification?: {
  text: string;
  chatId?: number;
  isError?: boolean;
}) {
  activeStreamCount = Math.max(0, activeStreamCount - 1);

  if (notification) {
    addPendingNotification(notification.text, notification.chatId);
  }

  if (activeStreamCount <= 0) {
    activeStreamCount = 0;

    // If window is focused, user is already looking → no badge needed
    if (
      mainWindowRef &&
      !mainWindowRef.isDestroyed() &&
      mainWindowRef.isFocused()
    ) {
      setTrayState("normal");
      clearPendingNotifications();
    } else {
      // Show error (red) or completed (green) depending on outcome
      setTrayState(notification?.isError ? "error" : "green");
    }
  }
  // else: still running streams → stay amber

  rebuildContextMenu();
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
 * Badge kinds map to tray icon states so the user sees the right color.
 */
export type BadgeKind = "question" | "permission" | "error" | "info";

/**
 * Add a notification and set the tray to the appropriate state.
 *
 * kind controls the icon color:
 * - "question"   → blue  (agent needs an answer)
 * - "permission" → purple (agent needs permission)
 * - "error"      → red   (something broke)
 * - "info"       → green (generic completed notification)
 */
export function setTrayBadge(
  notificationText?: string,
  chatId?: number,
  kind: BadgeKind = "info",
) {
  if (notificationText) {
    addPendingNotification(notificationText, chatId);
  }

  const stateForKind: Record<BadgeKind, TrayState> = {
    question: "question",
    permission: "permission",
    error: "error",
    info: "green",
  };

  setTrayState(stateForKind[kind]);
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
            if (notif.chatId) {
              mainWindowRef.webContents.send("navigate-to-route", {
                route: "/",
                search: { chatId: notif.chatId },
              });
            }
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
      label: `🟠 ${activeStreamCount} ${plural} en ejecución`,
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

  // Store reference for left-click popUpContextMenu
  currentMenu = Menu.buildFromTemplate(template);
  tray.setContextMenu(currentMenu);
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
  amberIcon = null;
  greenIcon = null;
  questionIcon = null;
  permissionIcon = null;
  errorIcon = null;
  pausedIcon = null;
  currentMenu = null;
  currentState = "normal";
  activeStreamCount = 0;
  pendingNotifications.length = 0;
}
