// startProxy.js – helper to launch proxy.js as a worker

import { Worker } from "worker_threads";
import path from "path";
import { findAvailablePort } from "./port_utils";
import log from "electron-log";

const logger = log.scope("start_proxy_server");

export async function startProxy(
  targetOrigin: string,
  opts: {
    port?: number;
    // env?: Record<string, string>;
    onStarted?: (proxyUrl: string) => void;
    onUpstreamRecovered?: () => void;
  } = {},
) {
  if (!/^https?:\/\//.test(targetOrigin))
    throw new Error("startProxy: targetOrigin must be absolute http/https URL");

  let port = opts.port;
  if (!port) {
    port = await findAvailablePort(50_000, 60_000);
    logger.info("Found available port", port);
  } else {
    logger.info("Using specific port", port);
  }
  const {
    // host = "localhost",
    // env = {}, // additional env vars to pass to the worker
    onStarted,
    onUpstreamRecovered,
  } = opts;

  const worker = new Worker(
    path.resolve(__dirname, "..", "..", "worker", "proxy_server.js"),
    {
      workerData: {
        targetOrigin,
        port,
      },
    },
  );

  worker.on("message", (m) => {
    logger.info("[proxy]", m);
    if (typeof m === "string" && m.startsWith("proxy-server-start url=")) {
      const url = m.substring("proxy-server-start url=".length);
      onStarted?.(url);
    }
    if (m === "proxy-upstream-recovered") {
      onUpstreamRecovered?.();
    }
  });
  worker.on("error", (e) => logger.error("[proxy] error:", e));
  worker.on("exit", (c) => logger.info("[proxy] exit", c));

  return worker; // let the caller keep a handle if desired
}
