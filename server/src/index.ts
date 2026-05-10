/**
 * Vibes Cloud — Backend API Server
 *
 * Replaces Electron's main process for web mode.
 * Routes IPC channels to the same handler functions via HTTP + Socket.io.
 *
 * Architecture:
 *   POST /api/ipc/:channel  →  Same handler as ipcMain.handle(channel, ...)
 *   Socket.io events        →  Same as BrowserWindow.webContents.send(channel, ...)
 */
import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { Server } from "socket.io";
import http from "node:http";
import { registerIpcRoutes } from "./routes/ipc.ts";
import { registerPreviewProxy } from "./routes/preview.ts";
import { registerExportRoutes } from "./routes/export.ts";
import { registerOAuthRoutes } from "./routes/oauth.ts";
import { registerWebhookRoutes } from "./routes/webhook.ts";
import { OpenCodeManager } from "./opencode-manager.ts";
import { WorkspaceManager } from "./workspace.ts";

const PORT = Number(process.env.VIBES_API_PORT || process.env.PORT) || 4800;

// ─── Fastify + Socket.io setup ──────────────────────────────────────────────

const httpServer = http.createServer();
const app = Fastify({
  logger: true,
  serverFactory: (handler) => {
    httpServer.on("request", handler);
    return httpServer;
  },
});

const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  path: "/socket.io",
});

// ─── Global state ───────────────────────────────────────────────────────────

export const openCodeManager = new OpenCodeManager();
export const workspaceManager = new WorkspaceManager();

// ─── Plugins ────────────────────────────────────────────────────────────────

await app.register(cors, { origin: true });
await app.register(multipart, { limits: { fileSize: 100 * 1024 * 1024 } }); // 100MB

// ─── Auth middleware ────────────────────────────────────────────────────────

// Decorate request with userId (populated by auth hook)
app.decorateRequest("userId", "");

app.addHook("onRequest", async (request, reply) => {
  // Skip auth for health check and webhook
  const url = request.url;
  if (url === "/api/health" || url.startsWith("/api/webhooks/")) return;

  // Extract token from Authorization header
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    // Allow unauthenticated requests (login/register don't need auth)
    // The handler will check context.userId and throw if needed
    return;
  }

  const token = authHeader.slice(7);
  if (token) {
    // For now, the token IS the session token from BunnyDB.
    // We look up the user by session token.
    // TODO: Replace with proper JWT verification
    try {
      const { getRemoteDb } = await import("../../src/db/remote.ts");
      const { users } = await import("../../src/db/remote-schema.ts");
      const { eq } = await import("drizzle-orm");

      const db = getRemoteDb();
      const user = await db.query.users.findFirst({
        where: eq(users.sessionToken, token),
      });

      if (user) {
        (request as any).userId = user.id;
      }
    } catch (err) {
      app.log.warn("Auth lookup failed:", err);
    }
  }
});

// ─── Socket.io auth ─────────────────────────────────────────────────────────

io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next();

  try {
    const { getRemoteDb } = await import("../../src/db/remote.ts");
    const { users } = await import("../../src/db/remote-schema.ts");
    const { eq } = await import("drizzle-orm");

    const db = getRemoteDb();
    const user = await db.query.users.findFirst({
      where: eq(users.sessionToken, token),
    });

    if (user) {
      (socket as any).userId = user.id;
      socket.join(user.id); // Join a room named after their userId
    }
  } catch (err) {
    console.warn("[Socket.io] Auth failed:", err);
  }

  next();
});

io.on("connection", (socket) => {
  const userId = (socket as any).userId || "anonymous";
  app.log.info(`Socket.io client connected: ${userId}`);

  socket.on("disconnect", () => {
    app.log.info(`Socket.io client disconnected: ${userId}`);
  });
});

// Make io globally accessible for the IPC adapter
(globalThis as any).__vibesSocketIO = io;

// ─── Routes ─────────────────────────────────────────────────────────────────

registerIpcRoutes(app, io);
registerPreviewProxy(app, httpServer);
registerExportRoutes(app);
registerOAuthRoutes(app, io);
registerWebhookRoutes(app);

// Health check
app.get("/api/health", async () => ({ status: "ok", timestamp: Date.now() }));

// ─── Start ──────────────────────────────────────────────────────────────────

// Handle port-in-use gracefully (common during --watch restarts)
httpServer.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(`⚠️  Port ${PORT} is in use. Waiting for file changes to retry...`);
  } else {
    console.error("Server error:", err);
    process.exit(1);
  }
});

const start = async () => {
  try {
    await app.ready();
    httpServer.listen(PORT, "0.0.0.0", () => {
      app.log.info(`🚀 Vibes Cloud API running on http://0.0.0.0:${PORT}`);
    });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

// Graceful shutdown
const shutdown = async () => {
  app.log.info("Shutting down...");
  await openCodeManager.stopAll();
  io.close();
  httpServer.close();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

start();
