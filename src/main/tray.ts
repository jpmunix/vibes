import { app, BrowserWindow, Menu, Tray, nativeImage } from "electron";
import * as path from "node:path";
import log from "electron-log";
import type { FlavorConfig } from "../flavors";

const logger = log.scope("tray");

let tray: Tray | null = null;
let normalIcon: Electron.NativeImage | null = null;
let badgeIcon: Electron.NativeImage | null = null;
let hasBadge = false;

/**
 * Creates a system-tray icon with a context menu.
 *
 * Behaviour:
 * - Left-click on the tray icon → show / focus the main window.
 * - Right-click → context menu with "Mostrar Vibes" and "Salir".
 * - "Salir" performs a real app.quit() (bypasses the close-to-tray logic).
 *
 * The tray icon uses a pre-scaled 32×32 PNG so it looks crisp on Linux desktops
 * (Cinnamon, GNOME, etc.) without relying on Electron's built-in resizing which
 * can produce blurry icons.
 */
export function createTray(
  mainWindow: BrowserWindow,
  activeFlavor: FlavorConfig,
): Tray {
  const iconBase = path.join(
    app.getAppPath(),
    `assets/${activeFlavor.iconFolder}`,
  );

  // Pre-load both icon variants (normal and with notification badge)
  normalIcon = nativeImage.createFromPath(path.join(iconBase, "tray-icon.png"));
  badgeIcon = nativeImage.createFromPath(path.join(iconBase, "tray-icon-badge.png"));

  tray = new Tray(normalIcon);
  tray.setToolTip(activeFlavor.productName);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: `Mostrar ${activeFlavor.productName}`,
      click: () => {
        showWindow(mainWindow);
      },
    },
    { type: "separator" },
    {
      label: "Salir",
      click: () => {
        // Setting this flag lets the 'close' handler in main.ts know
        // the user truly wants to quit (not just hide to tray).
        (app as any)._forceQuit = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  // Single-click on tray icon → restore window (Linux Mint / Cinnamon standard)
  tray.on("click", () => {
    showWindow(mainWindow);
  });

  // When the window gains focus, clear the badge automatically
  mainWindow.on("focus", () => {
    clearTrayBadge();
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

/**
 * Switch the tray icon to the badge variant (red dot) to indicate
 * unread notifications or pending interactions.
 */
export function setTrayBadge() {
  if (!tray || tray.isDestroyed() || !badgeIcon || hasBadge) return;
  tray.setImage(badgeIcon);
  hasBadge = true;
  logger.info("Tray badge set (notification pending)");
}

/**
 * Restore the tray icon to its normal (no-badge) variant.
 */
export function clearTrayBadge() {
  if (!tray || tray.isDestroyed() || !normalIcon || !hasBadge) return;
  tray.setImage(normalIcon);
  hasBadge = false;
  logger.info("Tray badge cleared");
}

/**
 * Destroy the tray icon (called during app shutdown).
 */
export function destroyTray() {
  if (tray && !tray.isDestroyed()) {
    tray.destroy();
    tray = null;
  }
  normalIcon = null;
  badgeIcon = null;
  hasBadge = false;
}
