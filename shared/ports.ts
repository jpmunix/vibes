/**
 * Calculate the preferred port for a given app based on its ID.
 * Uses a base port of 32100 and offsets by appId % 10_000.
 */
export function getAppPort(appId: number): number {
  return 32100 + (appId % 10_000);
}

export function getProxyPort(appId: number): number {
  return 42100 + (appId % 10_000);
}

/**
 * Find a free port starting from the preferred app port.
 * Walks up to `maxAttempts` ports forward if the preferred port is taken.
 * Requires Node.js `net` — only call from main process, not from renderer.
 */
export async function findFreeAppPort(
  appId: number,
  maxAttempts = 50,
): Promise<number> {
  const net = await import("node:net");
  const preferred = getAppPort(appId);

  for (let offset = 0; offset < maxAttempts; offset++) {
    const port = preferred + offset;
    const isFree = await new Promise<boolean>((resolve) => {
      const srv = net.createServer();
      srv.once("error", () => resolve(false));
      srv.once("listening", () => srv.close(() => resolve(true)));
      srv.listen(port, "127.0.0.1");
    });
    if (isFree) return port;
  }

  // Fallback: return a fully random port in the 32100-42099 range
  return 32100 + Math.floor(Math.random() * 10_000);
}
