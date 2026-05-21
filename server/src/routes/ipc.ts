/**
 * IPC Routes — Generic endpoint that routes IPC channel calls to handlers.
 *
 * POST /api/ipc/:channel  →  handler from globalThis.__vibesIpcRegistry
 *
 * The ESM loader hooks (hooks.mjs) intercept `import "electron"` and return
 * a shim whose ipcMain.handle() stores handlers in globalThis.__vibesIpcRegistry.
 * This file simply reads from that registry and exposes it via HTTP.
 */
import type { FastifyInstance } from "fastify";
import type { Server as SocketIOServer } from "socket.io";

// The registry is populated by the electron shim in hooks.mjs
// when ipc_host.ts calls createTypedHandler → ipcMain.handle()
const getRegistry = (): Map<string, Function> => {
  return (globalThis as any).__vibesIpcRegistry || new Map();
};

async function registerAllHandlers() {
  try {
    const ipcHost = await import("../../../src/ipc/ipc_host.ts");
    ipcHost.registerIpcHandlers();
    console.log(`[IPC] Registered ${getRegistry().size} handlers`);
  } catch (err) {
    console.error("[IPC] Failed to register handlers:", err);
  }
}

export function registerIpcRoutes(app: FastifyInstance, io: SocketIOServer) {
  registerAllHandlers().catch((err) => {
    console.error("[IPC] Handler registration failed:", err);
  });

  app.post<{ Params: { channel: string }; Body: { args?: unknown[] } }>(
    "/api/ipc/:channel",
    async (request, reply) => {
      const { channel } = request.params;
      const { args = [] } = request.body || {};
      const registry = getRegistry();
      const handler = registry.get(channel);

      if (!handler) {
        reply.code(404).send({ error: `Unknown channel: ${channel}` });
        return;
      }

      const userId = (request as any).userId || "";
      const fakeEvent = {
        sender: {
          id: userId,
          userId, // Picked up by base.ts createTypedHandler for HandlerContext
          send: (ch: string, data: any) => {
            if (userId) io.to(userId).emit(ch, data);
            else io.emit(ch, data);
          },
          // Electron WebContents stubs — handlers call these to check window state
          isDestroyed: () => false,
        },
      };

      try {
        // JSON serialization turns undefined → null, but Zod void schemas
        // require undefined (not null). Convert null back to undefined.
        const input = args[0] === null ? undefined : args[0];

        // Auto-hydrate preferences cache on first request for this user.
        // In Electron this happens at login; in web mode the auth middleware
        // gives us userId but the cache may not be warm yet.
        if (userId) {
          const { preferencesCache } = await import("../../../src/main/preferences-cache.ts");
          if (!preferencesCache.isHydrated || preferencesCache.currentUserId !== userId) {
            try {
              await preferencesCache.hydrate(userId);
              app.log.info(`[IPC] Auto-hydrated preferences for user ${userId}`);
            } catch (hydrateErr: any) {
              app.log.warn(`[IPC] Failed to auto-hydrate preferences: ${hydrateErr.message}`);
            }
          }
        }

        const result = await (handler as any)(fakeEvent, input);
        reply.send({ result: result ?? null });
      } catch (err: any) {
        console.error(`[IPC] ${channel} error:`, err?.message || err);
        reply.code(500).send({ error: err.message || "Internal error" });
      }
    },
  );
}
