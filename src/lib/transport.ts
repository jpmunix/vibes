/**
 * Transport Layer — Abstracts communication between frontend and backend.
 *
 * In Electron mode: uses ipcRenderer (preload bridge) — no changes needed.
 * In Web mode: uses HTTP fetch + Socket.io — shims window.electron so that
 * createClient/createEventClient/createStreamClient in core.ts work transparently.
 *
 * The web transport installs itself onto `window.electron` at import time,
 * so existing code that accesses `(window as any).electron?.ipcRenderer`
 * works without modification.
 */

/**
 * Detect whether we're running inside Electron.
 * Check for the preload bridge (contextBridge sets window.electron).
 */
export const isElectron: boolean =
  typeof window !== "undefined" &&
  !!(window as any).electron?.ipcRenderer?.invoke;

/**
 * In web mode, we need to shim `window.electron` BEFORE any createClient()
 * calls execute. This module is imported early in renderer.tsx.
 *
 * If we're already in Electron (preload ran), this is a no-op.
 */
export function initializeWebTransport(): void {
  if (isElectron) return; // Electron preload already set up window.electron

  // Lazy-import to avoid pulling socket.io into the Electron bundle
  import("./transport-web").then(({ installWebTransport }) => {
    installWebTransport();
  });
}
