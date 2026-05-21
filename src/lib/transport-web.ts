/**
 * Web Transport — Shims `window.electron.ipcRenderer` for browser-based Vibes.
 *
 * This module replaces Electron's IPC with:
 *   - invoke()  → HTTP POST to /api/ipc/:channel
 *   - on()      → Socket.io event listener
 *   - removeAllListeners() → Socket.io off()
 *
 * The backend exposes a generic /api/ipc/:channel endpoint that routes
 * to the same handler functions used by Electron's ipcMain.handle().
 */
import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

function getSocket(): Socket {
  if (!socket) {
    const token = localStorage.getItem("vibes_session_token") || "";
    socket = io("/", {
      auth: { token },
      transports: ["websocket", "polling"],
    });

    socket.on("connect", () => {
      console.log("[WebTransport] Socket.io connected");
    });

    socket.on("disconnect", (reason) => {
      console.warn("[WebTransport] Socket.io disconnected:", reason);
    });
  }
  return socket;
}

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem("vibes_session_token") || "";
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/**
 * Install the web transport shim onto window.electron.
 * Must be called BEFORE any createClient()/createEventClient() executes.
 */
export function installWebTransport(): void {
  if ((window as any).__vibesWebTransportInstalled) return;

  const ipcShim = {
    /**
     * Replaces ipcRenderer.invoke(channel, ...args).
     * Sends HTTP POST to the backend, which routes to the original handler.
     */
    invoke: async (channel: string, ...args: unknown[]): Promise<unknown> => {
      // ── Window handlers: open new browser tab instead of BrowserWindow ──
      const windowMatch = channel.match(/^window:open-(.+)$/);
      if (windowMatch) {
        const windowType = windowMatch[1]; // "admin", "playground", "docs", etc.
        const params = (args[0] || {}) as Record<string, unknown>;
        const qs = new URLSearchParams({ window: windowType });
        if (params.theme) qs.set("theme", String(params.theme));
        if (params.themeIntensity != null) qs.set("intensity", String(params.themeIntensity));
        if (params.appId) qs.set("appId", String(params.appId));
        if (params.chatId) qs.set("chatId", String(params.chatId));
        if (params.messageId) qs.set("messageId", String(params.messageId));
        window.open(`/?${qs.toString()}`, "_blank");
        return undefined;
      }

      const res = await fetch(`/api/ipc/${encodeURIComponent(channel)}`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ args }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || `IPC call failed: ${channel} (${res.status})`);
      }

      const json = await res.json();
      return json.result;
    },

    /**
     * Replaces ipcRenderer.on(channel, listener).
     * Routes to Socket.io event subscription.
     * Returns an unsubscribe function (matching preload.ts behavior).
     */
    on: (channel: string, listener: (...args: unknown[]) => void): (() => void) => {
      const sock = getSocket();
      sock.on(channel, listener);
      return () => {
        sock.off(channel, listener);
      };
    },

    /**
     * Replaces ipcRenderer.removeAllListeners(channel).
     */
    removeAllListeners: (channel: string): void => {
      const sock = getSocket();
      sock.removeAllListeners(channel);
    },

    /**
     * Replaces ipcRenderer.removeListener(channel, listener).
     */
    removeListener: (channel: string, listener: (...args: unknown[]) => void): void => {
      const sock = getSocket();
      sock.off(channel, listener);
    },
  };

  (window as any).electron = {
    ipcRenderer: ipcShim,
    // Top-level `on` delegate — some code calls window.electron.on() directly
    // (e.g., useStreamChat.ts for undo-redo content events)
    on: ipcShim.on,
    webFrame: {
      setZoomFactor: (_factor: number) => {
        // No-op in web mode (browser has native zoom)
      },
      getZoomFactor: () => 1,
    },
  };

  (window as any).__vibesWebTransportInstalled = true;
  console.log("[WebTransport] Installed window.electron shim for web mode");
}

/**
 * Reconnect the socket with a new auth token (e.g. after login).
 */
export function reconnectWithToken(token: string): void {
  localStorage.setItem("vibes_session_token", token);
  if (socket) {
    socket.auth = { token };
    socket.disconnect().connect();
  }
}

/**
 * Disconnect the socket (e.g. on logout).
 */
export function disconnectTransport(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
