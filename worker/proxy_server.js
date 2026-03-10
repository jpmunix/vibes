/**
 * proxy.js – zero-dependency worker-based HTTP/WS forwarder
 */

const { parentPort, workerData } = require("worker_threads");

const http = require("http");
const https = require("https");

const { URL } = require("url");
const fs = require("fs");
const path = require("path");

/* ──────────────────────────── worker code ─────────────────────────────── */
const LISTEN_HOST = "localhost";
const LISTEN_PORT = workerData.port;
let rememberedOrigin = null; // e.g. "http://localhost:5173"

/* ---------- pre-configure rememberedOrigin from workerData ------- */
{
  const fixed = workerData?.targetOrigin;
  if (fixed) {
    try {
      rememberedOrigin = new URL(fixed).origin;
      parentPort?.postMessage(
        `[proxy-worker] fixed upstream: ${rememberedOrigin}`,
      );
    } catch {
      throw new Error(
        `Invalid target origin "${fixed}". Must be absolute http/https URL.`,
      );
    }
  }
}

/* ---------- optional resources for HTML injection ---------------------- */

let stacktraceJsContent = null;
let vibesShimContent = null;
let vibesComponentSelectorClientContent = null;
let vibesScreenshotClientContent = null;
let htmlToImageContent = null;
let vibesVisualEditorClientContent = null;
let vibesLogsContent = null;

try {
  const htmlToImagePath = path.join(
    __dirname,
    "..",
    "node_modules",
    "html-to-image",
    "dist",
    "html-to-image.js",
  );
  htmlToImageContent = fs.readFileSync(htmlToImagePath, "utf-8");
  parentPort?.postMessage(
    `[proxy-worker] html-to-image.js loaded from: ${htmlToImagePath}`,
  );
} catch (error) {
  parentPort?.postMessage(
    `[proxy-worker] Failed to read html-to-image.js: ${error.message}`,
  );
}

try {
  const stackTraceLibPath = path.join(
    __dirname,
    "..",
    "node_modules",
    "stacktrace-js",
    "dist",
    "stacktrace.min.js",
  );
  stacktraceJsContent = fs.readFileSync(stackTraceLibPath, "utf-8");
  parentPort?.postMessage("[proxy-worker] stacktrace.js loaded.");
} catch (error) {
  parentPort?.postMessage(
    `[proxy-worker] Failed to read stacktrace.js: ${error.message}`,
  );
}

try {
  const vibesShimPath = path.join(__dirname, "vibes-shim.js");
  vibesShimContent = fs.readFileSync(vibesShimPath, "utf-8");
  parentPort?.postMessage("[proxy-worker] vibes-shim.js loaded.");
} catch (error) {
  parentPort?.postMessage(
    `[proxy-worker] Failed to read vibes-shim.js: ${error.message}`,
  );
}

try {
  const vibesComponentSelectorClientPath = path.join(
    __dirname,
    "vibes-component-selector-client.js",
  );
  vibesComponentSelectorClientContent = fs.readFileSync(
    vibesComponentSelectorClientPath,
    "utf-8",
  );
  parentPort?.postMessage(
    "[proxy-worker] vibes-component-selector-client.js loaded.",
  );
} catch (error) {
  parentPort?.postMessage(
    `[proxy-worker] Failed to read vibes-component-selector-client.js: ${error.message}`,
  );
}

try {
  const vibesScreenshotClientPath = path.join(
    __dirname,
    "vibes-screenshot-client.js",
  );
  vibesScreenshotClientContent = fs.readFileSync(
    vibesScreenshotClientPath,
    "utf-8",
  );
  parentPort?.postMessage("[proxy-worker] vibes-screenshot-client.js loaded.");
} catch (error) {
  parentPort?.postMessage(
    `[proxy-worker] Failed to read vibes-screenshot-client.js: ${error.message}`,
  );
}

try {
  const vibesVisualEditorClientPath = path.join(
    __dirname,
    "vibes-visual-editor-client.js",
  );
  vibesVisualEditorClientContent = fs.readFileSync(
    vibesVisualEditorClientPath,
    "utf-8",
  );
  parentPort?.postMessage(
    "[proxy-worker] vibes-visual-editor-client.js loaded.",
  );
} catch (error) {
  parentPort?.postMessage(
    `[proxy-worker] Failed to read vibes-visual-editor-client.js: ${error.message}`,
  );
}

try {
  const vibesLogsPath = path.join(__dirname, "vibes_logs.js");
  vibesLogsContent = fs.readFileSync(vibesLogsPath, "utf-8");
  parentPort?.postMessage("[proxy-worker] vibes_logs.js loaded.");
} catch (error) {
  parentPort?.postMessage(
    `[proxy-worker] Failed to read vibes_logs.js: ${error.message}`,
  );
}

// Load Service Worker files
let vibesSwContent = null;
let vibesSwRegisterContent = null;

try {
  const vibesSwPath = path.join(__dirname, "vibes-sw.js");
  vibesSwContent = fs.readFileSync(vibesSwPath, "utf-8");
  parentPort?.postMessage("[proxy-worker] vibes-sw.js loaded.");
} catch (error) {
  parentPort?.postMessage(
    `[proxy-worker] Failed to read vibes-sw.js: ${error.message}`,
  );
}

try {
  const vibesSwRegisterPath = path.join(__dirname, "vibes-sw-register.js");
  vibesSwRegisterContent = fs.readFileSync(vibesSwRegisterPath, "utf-8");
  parentPort?.postMessage("[proxy-worker] vibes-sw-register.js loaded.");
} catch (error) {
  parentPort?.postMessage(
    `[proxy-worker] Failed to read vibes-sw-register.js: ${error.message}`,
  );
}

/* ---------------------- helper: need to inject? ------------------------ */
function needsInjection(pathname) {
  // Inject for routes without a file extension (e.g., "/foo", "/foo/bar", "/")
  const ext = path.extname(pathname).toLowerCase();
  return ext === "" || ext === ".html";
}

function injectHTML(buf) {
  let txt = buf.toString("utf8");
  // These are strings that were used since the first version of the vibes shim.
  // If the vibes shim is used from legacy apps which came pre-baked with the shim
  // as a vite plugin, then do not inject the shim twice to avoid weird behaviors.
  const legacyAppWithShim =
    txt.includes("window-error") && txt.includes("unhandled-rejection");

  const scripts = [];

  if (!legacyAppWithShim) {
    if (stacktraceJsContent) {
      scripts.push(`<script>${stacktraceJsContent}</script>`);
    } else {
      scripts.push(
        '<script>console.warn("[proxy-worker] stacktrace.js was not injected.");</script>',
      );
    }

    if (vibesShimContent) {
      scripts.push(`<script>${vibesShimContent}</script>`);
    } else {
      scripts.push(
        '<script>console.warn("[proxy-worker] vibes shim was not injected.");</script>',
      );
    }
  }
  if (vibesComponentSelectorClientContent) {
    scripts.push(`<script>${vibesComponentSelectorClientContent}</script>`);
  } else {
    scripts.push(
      '<script>console.warn("[proxy-worker] vibes component selector client was not injected.");</script>',
    );
  }
  if (htmlToImageContent) {
    scripts.push(`<script>${htmlToImageContent}</script>`);
    parentPort?.postMessage(
      "[proxy-worker] html-to-image script injected into HTML.",
    );
  } else {
    scripts.push(
      '<script>console.error("[proxy-worker] html-to-image was not injected - library not loaded.");</script>',
    );
    parentPort?.postMessage(
      "[proxy-worker] WARNING: html-to-image not injected!",
    );
  }
  if (vibesScreenshotClientContent) {
    scripts.push(`<script>${vibesScreenshotClientContent}</script>`);
  } else {
    scripts.push(
      '<script>console.warn("[proxy-worker] vibes screenshot client was not injected.");</script>',
    );
  }
  if (vibesVisualEditorClientContent) {
    scripts.push(`<script>${vibesVisualEditorClientContent}</script>`);
  } else {
    scripts.push(
      '<script>console.warn("[proxy-worker] vibes visual editor client was not injected.");</script>',
    );
  }
  if (vibesLogsContent) {
    scripts.push(`<script>${vibesLogsContent}</script>`);
  } else {
    scripts.push(
      '<script>console.warn("[proxy-worker] vibes_logs.js was not injected.");</script>',
    );
  }
  if (vibesSwRegisterContent) {
    scripts.push(`<script>${vibesSwRegisterContent}</script>`);
  } else {
    scripts.push(
      '<script>console.warn("[proxy-worker] vibes-sw-register.js was not injected.");</script>',
    );
  }
  const allScripts = scripts.join("\n");

  const headRegex = /<head[^>]*>/i;
  if (headRegex.test(txt)) {
    txt = txt.replace(headRegex, `$&\n${allScripts}`);
  } else {
    txt = allScripts + "\n" + txt;
    parentPort?.postMessage(
      "[proxy-worker] Warning: <head> tag not found – scripts prepended.",
    );
  }
  return Buffer.from(txt, "utf8");
}

/* ---------------- helper: build upstream URL from request -------------- */
function buildTargetURL(clientReq) {
  if (!rememberedOrigin) throw new Error("No upstream configured.");

  // Forward to the remembered origin keeping path & query
  return new URL(clientReq.url, rememberedOrigin);
}

/* ----------------------------------------------------------------------- */
/* 1. Plain HTTP request / response                                        */
/* ----------------------------------------------------------------------- */

const server = http.createServer((clientReq, clientRes) => {
  // Special handling for Service Worker file
  if (clientReq.url === "/vibes-sw.js") {
    if (vibesSwContent) {
      clientRes.writeHead(200, {
        "content-type": "application/javascript",
        "service-worker-allowed": "/",
        "cache-control": "no-cache",
      });
      clientRes.end(vibesSwContent);
      return;
    } else {
      clientRes.writeHead(404, { "content-type": "text/plain" });
      clientRes.end("Service Worker file not found");
      return;
    }
  }

  let target;
  try {
    target = buildTargetURL(clientReq);
  } catch (err) {
    clientRes.writeHead(400, { "content-type": "text/plain" });
    return void clientRes.end("Bad request: " + err.message);
  }

  const isTLS = target.protocol === "https:";
  const lib = isTLS ? https : http;

  /* Copy request headers but rewrite Host / Origin / Referer */
  const headers = { ...clientReq.headers, host: target.host };
  if (headers.origin) headers.origin = target.origin;
  if (headers.referer) {
    try {
      const ref = new URL(headers.referer);
      headers.referer = target.origin + ref.pathname + ref.search;
    } catch {
      delete headers.referer;
    }
  }
  if (needsInjection(target.pathname)) {
    // Request uncompressed content from upstream
    delete headers["accept-encoding"];
    // Avoid getting cached resources.
    delete headers["if-none-match"];
  }

  const upOpts = {
    protocol: target.protocol,
    hostname: target.hostname,
    port: target.port || (isTLS ? 443 : 80),
    path: target.pathname + target.search,
    method: clientReq.method,
    headers,
  };

  const MAX_RETRIES = 20;

  const attemptRequest = (retriesLeft) => {
    const upReq = lib.request(upOpts, (upRes) => {
      // If we used any retries, notify parent so the iframe can be refreshed
      const usedRetries = MAX_RETRIES - retriesLeft;
      if (usedRetries > 0) {
        parentPort?.postMessage("proxy-upstream-recovered");
      }

      upRes.on("error", (err) => {
        console.error("[proxy-worker] Upstream response error:", err.message);
        clientRes.destroy();
      });
      const wantsInjection = needsInjection(target.pathname);
      // Only inject when upstream indicates HTML content
      const contentTypeHeader = upRes.headers["content-type"];
      const contentType = Array.isArray(contentTypeHeader)
        ? contentTypeHeader[0]
        : contentTypeHeader || "";
      const isHtml =
        typeof contentType === "string" &&
        contentType.toLowerCase().includes("text/html");
      const inject = wantsInjection && isHtml;

      if (!inject) {
        clientRes.writeHead(upRes.statusCode, upRes.headers);
        return void upRes.pipe(clientRes);
      }

      const chunks = [];
      upRes.on("data", (c) => chunks.push(c));
      upRes.on("end", () => {
        if (clientRes.destroyed || clientRes.writableEnded) return;
        try {
          const merged = Buffer.concat(chunks);
          const patched = injectHTML(merged);

          const hdrs = {
            ...upRes.headers,
            "content-length": Buffer.byteLength(patched),
          };
          // If we injected content, it's no longer encoded in the original way
          delete hdrs["content-encoding"];
          // Also, remove ETag as content has changed
          delete hdrs["etag"];

          clientRes.writeHead(upRes.statusCode, hdrs);
          clientRes.end(patched);
        } catch (e) {
          clientRes.writeHead(500, { "content-type": "text/plain" });
          clientRes.end("Injection failed: " + e.message);
        }
      });
    });

    const isGetOrHead = clientReq.method === "GET" || clientReq.method === "HEAD";

    upReq.on("error", (e) => {
      // If the connection was refused and it's a safe method (GET/HEAD), retry.
      if (
        e.code === "ECONNREFUSED" &&
        retriesLeft > 0 &&
        isGetOrHead
      ) {
        // Wait 250ms and try again
        setTimeout(() => attemptRequest(retriesLeft - 1), 250);
        return;
      }

      clientRes.writeHead(502, { "content-type": "text/plain" });
      clientRes.end("Upstream error: " + e.message);
    });

    if (isGetOrHead) {
      // For GET/HEAD, we don't pipe the client body (usually empty), just end the request.
      upReq.end();
    } else {
      // For other methods (POST, etc), we must pipe the body.
      // Retrying is not safe/easy here because the stream is consumed.
      clientReq.pipe(upReq);
    }
  };

  // Start with MAX_RETRIES retries (approx 5 seconds)
  attemptRequest(MAX_RETRIES);

  clientReq.on("error", (e) => {
    console.error("[proxy-worker] Client request error:", e.message);
    // There isn't a single upReq to destroy here if we are between retries, 
    // but the closure mostly handles it or it will garbage collect.
  });

  clientRes.on("error", (e) => {
    console.error("[proxy-worker] Client response error:", e.message);
    // Similar to above, if we are in a retry loop, the current upReq (if any)
    // might need destroying, but we don't hold a reference to it outside attemptRequest.
    // It's acceptable for this simple proxy.
  });
});

/* ----------------------------------------------------------------------- */
/* 2. WebSocket / generic Upgrade tunnelling                               */
/* ----------------------------------------------------------------------- */

server.on("upgrade", (req, socket, _head) => {
  let target;
  try {
    target = buildTargetURL(req);
  } catch (err) {
    socket.write("HTTP/1.1 400 Bad Request\r\n\r\n" + err.message);
    return socket.destroy();
  }

  const isTLS = target.protocol === "https:";
  const headers = { ...req.headers, host: target.host };
  if (headers.origin) headers.origin = target.origin;

  const upReq = (isTLS ? https : http).request({
    protocol: target.protocol,
    hostname: target.hostname,
    port: target.port || (isTLS ? 443 : 80),
    path: target.pathname + target.search,
    method: "GET",
    headers,
  });

  upReq.on("upgrade", (upRes, upSocket, upHead) => {
    socket.write(
      "HTTP/1.1 101 Switching Protocols\r\n" +
      Object.entries(upRes.headers)
        .map(([k, v]) => `${k}: ${v}`)
        .join("\r\n") +
      "\r\n\r\n",
    );
    if (upHead && upHead.length) socket.write(upHead);

    socket.on("error", (err) => {
      console.error("[proxy-worker] Client socket error:", err.message);
      upSocket.destroy();
    });

    upSocket.on("error", (err) => {
      console.error("[proxy-worker] Upstream socket error:", err.message);
      socket.destroy();
    });

    upSocket.pipe(socket).pipe(upSocket);
  });

  upReq.on("error", () => socket.destroy());
  upReq.end();
});

/* ----------------------------------------------------------------------- */

server.listen(LISTEN_PORT, LISTEN_HOST, () => {
  parentPort?.postMessage(
    `proxy-server-start url=http://${LISTEN_HOST}:${LISTEN_PORT}`,
  );
});
