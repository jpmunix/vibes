import { app, BrowserWindow, Menu, Tray, nativeImage } from "electron";
import * as path from "node:path";
import log from "electron-log";
import type { FlavorConfig } from "../flavors";

const logger = log.scope("tray");

let tray: Tray | null = null;

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
  // Use the pre-scaled 32px tray icon (generated via ImageMagick)
  const trayIconPath = path.join(
    app.getAppPath(),
    `assets/${activeFlavor.iconFolder}/tray-icon.png`,
  );

  const icon = nativeImage.createFromPath(trayIconPath);
  tray = new Tray(icon);
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
 * Destroy the tray icon (called during app shutdown).
 */
export function destroyTray() {
  if (tray && !tray.isDestroyed()) {
    tray.destroy();
    tray = null;
  }
}
