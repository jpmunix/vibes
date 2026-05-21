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
import * as fs from "node:fs";
import * as path from "node:path";

function setupPersistentLogs() {
  const HOME = process.env.HOME || "/home/munix";
  const logDir = process.env.VIBES_LOGS_DIR || path.join(HOME, ".vibes");
  const logFile = path.join(logDir, "server.log");

  try {
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  } catch (err) {
    console.error("Failed to create log directory:", err);
    return;
  }

  const logLines: string[] = [];
  const maxLines = 500;

  if (fs.existsSync(logFile)) {
    try {
      const content = fs.readFileSync(logFile, "utf8");
      logLines.push(...content.split("\n").filter(Boolean));
      if (logLines.length > maxLines) {
        logLines.splice(0, logLines.length - maxLines);
      }
    } catch { /* ignore */ }
  }

  const originalWrite = process.stdout.write;
  const originalErrorWrite = process.stderr.write;

  function handleLogWrite(chunk: string | Uint8Array) {
    const text = chunk.toString();
    const lines = text.split("\n").filter(Boolean);
    for (const line of lines) {
      const timePrefix = `[${new Date().toISOString()}] `;
      logLines.push(timePrefix + line);
    }
    
    if (logLines.length > maxLines) {
      logLines.splice(0, logLines.length - maxLines);
    }

    try {
      fs.writeFileSync(logFile, logLines.join("\n") + "\n", "utf8");
    } catch (err) {
      originalErrorWrite.call(process.stderr, `Failed to write to server.log: ${err}\n`);
    }
  }

  process.stdout.write = function (chunk: any, encoding?: any, callback?: any) {
    handleLogWrite(chunk);
    return originalWrite.call(process.stdout, chunk, encoding, callback);
  };

  process.stderr.write = function (chunk: any, encoding?: any, callback?: any) {
    handleLogWrite(chunk);
    return originalErrorWrite.call(process.stderr, chunk, encoding, callback);
  };
}

setupPersistentLogs();

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
    try {
      const { verifyJwt } = await import("../../src/lib/jwt.ts");
      const payload = verifyJwt(token);
      if (payload && payload.userId) {
        (request as any).userId = payload.userId;
      } else {
        // Fallback to old token lookup in DB for backwards compatibility
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
      }
    } catch (err) {
      app.log.warn({ err }, "Auth lookup failed");
    }
  }
});

// ─── Socket.io auth ─────────────────────────────────────────────────────────

io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next();

  try {
    const { verifyJwt } = await import("../../src/lib/jwt.ts");
    const payload = verifyJwt(token);
    if (payload && payload.userId) {
      (socket as any).userId = payload.userId;
      socket.join(payload.userId);
    } else {
      // Fallback to old token lookup in DB for backwards compatibility
      const { getRemoteDb } = await import("../../src/db/remote.ts");
      const { users } = await import("../../src/db/remote-schema.ts");
      const { eq } = await import("drizzle-orm");

      const db = getRemoteDb();
      const user = await db.query.users.findFirst({
        where: eq(users.sessionToken, token),
      });

      if (user) {
        (socket as any).userId = user.id;
        socket.join(user.id);
      }
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
