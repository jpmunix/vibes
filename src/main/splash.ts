/**
 * Splash Screen Manager
 *
 * Creates and manages a frameless splash window with progress bar.
 * The splash appears during startup while heavy initialization tasks run,
 * then closes once the main window is ready.
 */

import { BrowserWindow, app } from "electron";
import * as path from "node:path";
import log from "electron-log";

const logger = log.scope("splash");

/**
 * Create the splash window.
 * It's frameless, centered, always-on-top, and loads splash.html.
 */
export function createSplashWindow(): BrowserWindow {
    const splash = new BrowserWindow({
        width: 400,
        height: 300,
        frame: false,
        transparent: true,
        resizable: false,
        movable: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        show: false,
        center: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    // Load the splash HTML
    // splash.html lives in assets/ which is included in the asar by forge.config.ts.
    const splashPath = path.join(app.getAppPath(), "assets/splash.html");
    splash.loadFile(splashPath);

    // Set logo path once loaded
    splash.webContents.once("did-finish-load", () => {
        const logoPath = path.join(app.getAppPath(), "assets/icon/logo.png");

        // Convert to file:// URL for the img src
        const logoUrl = `file://${logoPath.replace(/\\/g, "/")}`;
        splash.webContents.executeJavaScript(`window.setLogoSrc(${JSON.stringify(logoUrl)})`).catch(() => { });

        // Also send the app version
        const version = app.getVersion();
        splash.webContents.executeJavaScript(`window.updateSplash(0, 1, "Iniciando...", ${JSON.stringify(version)})`).catch(() => { });
    });

    splash.once("ready-to-show", () => {
        splash.show();
    });

    logger.info("Splash window created");
    return splash;
}

/**
 * Update the splash screen progress.
 */
export function updateSplash(splash: BrowserWindow | null, step: number, total: number, label: string): void {
    if (!splash || splash.isDestroyed()) return;

    splash.webContents.executeJavaScript(
        `window.updateSplash(${step}, ${total}, ${JSON.stringify(label)})`
    ).catch(() => { });

    logger.info(`Splash progress: ${step}/${total} — ${label}`);
}

/**
 * Close the splash window with a brief fade-out.
 */
export async function closeSplash(splash: BrowserWindow | null): Promise<void> {
    if (!splash || splash.isDestroyed()) return;

    // Quick fade out
    try {
        splash.webContents.executeJavaScript(`
            document.body.style.transition = 'opacity 0.3s ease';
            document.body.style.opacity = '0';
        `).catch(() => { });
    } catch { /* ignore */ }

    await new Promise(resolve => setTimeout(resolve, 350));

    if (!splash.isDestroyed()) {
        splash.destroy();
    }

    logger.info("Splash window closed");
}
