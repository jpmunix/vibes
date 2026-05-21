/**
 * Preview Proxy — Routes /preview/:appId/* to the app's dev server.
 *
 * Handles both HTTP and WebSocket (for Vite/Next.js HMR).
 * Uses http-proxy to forward requests to the dynamically-assigned dev server ports.
 */
import type { FastifyInstance } from "fastify";
import httpProxy from "http-proxy";
import type { Server as HttpServer } from "node:http";

// Import the proxyUrlByApp map from the execution engine
// This is populated when executeApp() detects a dev server URL
const getProxyMap = async () => {
  try {
    const { proxyUrlByApp } = await import("../../../src/ipc/handlers/app_execution.ts");
    return proxyUrlByApp;
  } catch {
    return new Map();
  }
};

export function registerPreviewProxy(app: FastifyInstance, httpServer: HttpServer) {
  const proxy = httpProxy.createProxyServer({ ws: true });

  proxy.on("error", (err, _req, res) => {
    console.error("[Preview Proxy] Error:", err.message);
    if (res && "writeHead" in res && typeof res.writeHead === "function") {
      try {
        res.writeHead(502, { "Content-Type": "text/plain" });
        (res as any).end("Preview server unavailable");
      } catch {
        // Response already sent
      }
    }
  });

  // HTTP proxy for preview routes
  app.all<{ Params: { appId: string; "*": string } }>(
    "/preview/:appId/*",
    async (request, reply) => {
      const appId = Number(request.params.appId);
      const proxyMap = await getProxyMap();
      const proxyInfo = proxyMap.get(appId);

      if (!proxyInfo) {
        reply.code(503).send({ error: "App not running" });
        return;
      }

      // Rewrite the URL to strip /preview/:appId
      const targetPath = request.params["*"] || "";
      request.raw.url = `/${targetPath}${request.raw.url?.includes("?") ? "?" + request.raw.url.split("?")[1] : ""}`;

      // Use raw reply to let http-proxy handle the response
      return new Promise<void>((resolve, reject) => {
        proxy.web(
          request.raw,
          reply.raw,
          {
            target: proxyInfo.originalUrl,
            changeOrigin: true,
          },
          (err) => {
            if (err) reject(err);
            else resolve();
          },
        );
        // Mark reply as sent so Fastify doesn't try to send it again
        reply.hijack();
      });
    },
  );

  // WebSocket upgrade for HMR (Vite/Next.js hot reload)
  httpServer.on("upgrade", async (req, socket, head) => {
    const match = req.url?.match(/^\/preview\/(\d+)\/(.*)/);
    if (!match) return;

    const appId = Number(match[1]);
    const proxyMap = await getProxyMap();
    const proxyInfo = proxyMap.get(appId);

    if (!proxyInfo) {
      socket.destroy();
      return;
    }

    // Rewrite URL for the target
    req.url = `/${match[2]}`;

    proxy.ws(req, socket, head, {
      target: proxyInfo.originalUrl,
      changeOrigin: true,
    });
  });
}
