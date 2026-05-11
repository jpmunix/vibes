/**
 * App Execution Engine
 *
 * Extracted from app_handlers.ts — handles running, stopping, and monitoring
 * user applications (both local Node.js and Docker modes).
 */
import { BrowserWindow } from "electron";
import { ChildProcess, spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import fs from "node:fs";
import { promises as fsPromises } from "node:fs";
import util from "util";
import { Worker } from "worker_threads";
import fixPath from "fix-path";
import killPort from "kill-port";
import log from "electron-log";
import treeKill from "tree-kill";

import { AppOutput } from "../types/misc";
import { safeSend } from "../utils/safe_sender";
import {
  runningApps,
  processCounter,
  removeAppIfCurrentProcess,
} from "../utils/process_manager";
import { readSettings } from "../../main/settings";
import { addLog } from "../../lib/log_store";
import { startProxy } from "../utils/start_proxy_server";
import { getAppPort, getProxyPort, findFreeAppPort } from "../../../shared/ports";

const logger = log.scope("app_execution");

// ─── LogBuffer ────────────────────────────────────────────────────────
// Batches log updates to ALL renderer windows for performance.

class LogBuffer {
  private buffers = new Map<number, AppOutput[]>();
  private timeouts = new Map<number, NodeJS.Timeout>();
  private readonly FLUSH_INTERVAL_MS = 200;
  private readonly MAX_BATCH_SIZE = 100;

  add(appId: number, output: AppOutput) {
    if (!this.buffers.has(appId)) {
      this.buffers.set(appId, []);
    }

    const buffer = this.buffers.get(appId)!;
    buffer.push(output);

    if (buffer.length >= this.MAX_BATCH_SIZE) {
      this.flush(appId);
    } else if (!this.timeouts.has(appId)) {
      const timeout = setTimeout(() => this.flush(appId), this.FLUSH_INTERVAL_MS);
      this.timeouts.set(appId, timeout);
    }
  }

  flush(appId: number) {
    const buffer = this.buffers.get(appId);
    if (!buffer || buffer.length === 0) return;

    // Clear timeout if exists
    if (this.timeouts.has(appId)) {
      clearTimeout(this.timeouts.get(appId)!);
      this.timeouts.delete(appId);
    }

    // Send batch
    const logs = [...buffer];
    this.buffers.set(appId, []);

    // Broadcast to ALL open windows so console windows also receive logs
    const payload = { appId, logs };
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed() && win.webContents) {
        safeSend(win.webContents, "app:logs-batch", payload);
      }
    }
  }
}

export const logBuffer = new LogBuffer();

// ─── Module-level state ──────────────────────────────────────────────

let proxyWorker: Worker | null = null;

/** Track proxy URLs per app to enable re-emission when the app is already running */
export const proxyUrlByApp = new Map<number, { proxyUrl: string; originalUrl: string }>();

/** Track apps that have already attempted auto-recovery for missing modules */
export const autoRecoveryAttempted = new Set<number>();

/** Track the actual port assigned to each app (may differ from getAppPort if port was busy) */
export const actualPortByApp = new Map<number, number>();

// Needed, otherwise electron in MacOS/Linux will not be able to find node/pnpm.
fixPath();

// ─── Port / process helpers ─────────────────────────────────────────

export async function killProcessOnPort(port: number): Promise<void> {
  try {
    await killPort(port, "tcp");
  } catch {
    // Ignore if nothing was running on that port
  }
}

export async function checkPortOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(200);
    socket.on("connect", () => { socket.destroy(); resolve(true); });
    socket.on("timeout", () => { socket.destroy(); resolve(false); });
    socket.on("error", () => { socket.destroy(); resolve(false); });
    socket.connect(port, "127.0.0.1");
  });
}

/** Stop any Docker containers publishing a given host port */
export async function stopDockerContainersOnPort(port: number): Promise<void> {
  try {
    const list = spawn("docker", ["ps", "--filter", `publish=${port}`, "-q"], {
      stdio: "pipe",
    });

    let stdout = "";
    list.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    await new Promise<void>((resolve) => {
      list.on("close", () => resolve());
      list.on("error", () => resolve());
    });

    const containerIds = stdout
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    if (containerIds.length === 0) return;

    await Promise.all(
      containerIds.map(
        (id) =>
          new Promise<void>((resolve) => {
            const stop = spawn("docker", ["stop", id], { stdio: "pipe" });
            stop.on("close", () => resolve());
            stop.on("error", () => resolve());
          }),
      ),
    );
  } catch (e) {
    logger.warn(`Failed stopping Docker containers on port ${port}: ${e}`);
  }
}

export async function cleanUpPort(port: number) {
  const settings = readSettings();
  if (settings.runtimeMode2 === "docker") {
    await stopDockerContainersOnPort(port);
  } else {
    await killProcessOnPort(port);
  }
}

// ─── Command builders ───────────────────────────────────────────────

export async function getDefaultCommand(appId: number): Promise<string> {
  const port = await findFreeAppPort(appId);
  return `npm install --legacy-peer-deps && npm run dev -- --port ${port}`;
}

export async function getCommand({
  appId,
  installCommand,
  startCommand,
}: {
  appId: number;
  installCommand?: string | null;
  startCommand?: string | null;
}) {
  const port = await findFreeAppPort(appId);
  // Store the actual port for polling-based readiness detection
  actualPortByApp.set(appId, port);
  const install = (installCommand?.trim() || "npm install --legacy-peer-deps").replace(/\{port\}/g, String(port));
  const start = (startCommand?.trim() || `npm run dev -- --port ${port}`).replace(/\{port\}/g, String(port));
  return `${install} && ${start}`;
}

// ─── App execution ──────────────────────────────────────────────────

export async function executeApp({
  appPath,
  appId,
  event,
  isNeon,
  installCommand,
  startCommand,
}: {
  appPath: string;
  appId: number;
  event: Electron.IpcMainInvokeEvent;
  isNeon: boolean;
  installCommand?: string | null;
  startCommand?: string | null;
}): Promise<void> {
  if (proxyWorker) {
    proxyWorker.terminate();
    proxyWorker = null;
  }
  const settings = readSettings();
  const runtimeMode = settings.runtimeMode2 ?? "host";

  if (runtimeMode === "docker") {
    await executeAppInDocker({
      appPath, appId, event, isNeon, installCommand, startCommand,
    });
  } else {
    await executeAppLocalNode({
      appPath, appId, event, isNeon, installCommand, startCommand,
    });
  }
}

async function executeAppLocalNode({
  appPath,
  appId,
  event,
  isNeon,
  installCommand,
  startCommand,
}: {
  appPath: string;
  appId: number;
  event: Electron.IpcMainInvokeEvent;
  isNeon: boolean;
  installCommand?: string | null;
  startCommand?: string | null;
}): Promise<void> {
  const command = await getCommand({ appId, installCommand, startCommand });
  const spawnedProcess = spawn(command, [], {
    cwd: appPath,
    shell: true,
    stdio: "pipe",
    detached: false,
    env: {
      ...process.env,
      // Prevent dev servers (Vite, Next.js, CRA) from opening the system browser.
      // Vibes has its own preview panel — external browser windows are unwanted.
      BROWSER: "none",
    },
  });

  if (!spawnedProcess.pid) {
    let errorOutput = "";
    let spawnErr: any | null = null;
    spawnedProcess.stderr?.on("data", (data) => (errorOutput += data.toString()));
    await new Promise<void>((resolve) => {
      spawnedProcess.once("error", (err) => { spawnErr = err; resolve(); });
    });

    const details = [
      spawnErr?.message ? `message=${spawnErr.message}` : null,
      spawnErr?.code ? `code=${spawnErr.code}` : null,
      spawnErr?.errno ? `errno=${spawnErr.errno}` : null,
      spawnErr?.syscall ? `syscall=${spawnErr.syscall}` : null,
      spawnErr?.path ? `path=${spawnErr.path}` : null,
      spawnErr?.spawnargs ? `spawnargs=${JSON.stringify(spawnErr.spawnargs)}` : null,
    ].filter(Boolean).join(", ");

    logger.error(
      `Failed to spawn process for app ${appId}. Command="${command}", CWD="${appPath}", ${details}\nSTDERR:\n${errorOutput || "(empty)"}`,
    );

    throw new Error(
      `Failed to spawn process for app ${appId}.\nError output:\n${errorOutput || "(empty)"}\nDetails: ${details || "n/a"}`,
    );
  }

  const currentProcessId = processCounter.increment();
  runningApps.set(appId, {
    process: spawnedProcess,
    processId: currentProcessId,
    isDocker: false,
  });

  listenToProcess({
    process: spawnedProcess, appId, isNeon, event, appPath, installCommand, startCommand,
  });
}

function listenToProcess({
  process: spawnedProcess,
  appId,
  isNeon,
  event,
  appPath,
  installCommand,
  startCommand,
}: {
  process: ChildProcess;
  appId: number;
  isNeon: boolean;
  event: Electron.IpcMainInvokeEvent;
  appPath: string;
  installCommand?: string | null;
  startCommand?: string | null;
}) {
  let stderrBuffer = "";
  let proxyStarted = false;

  const startProxyForApp = async (targetUrl: string) => {
    if (proxyStarted) return;
    proxyStarted = true;

    const proxyPort = getProxyPort(appId);

    if (proxyWorker) {
      logger.info(`Terminating existing proxy worker for app ${appId}`);
      await proxyWorker.terminate();
      proxyWorker = null;
    }

    try {
      proxyWorker = await startProxy(targetUrl, {
        port: proxyPort,
        onStarted: (proxyUrl) => {
          proxyUrlByApp.set(appId, { proxyUrl, originalUrl: targetUrl });
          safeSend(event.sender, "app:output", {
            type: "stdout",
            message: `[vibes-proxy-server]started=[${proxyUrl}] original=[${targetUrl}]`,
            appId,
          });
        },
        onUpstreamRecovered: () => {
          logger.info(`[proxy] Upstream recovered after retries for app ${appId}, signaling iframe refresh`);
          safeSend(event.sender, "app:output", {
            type: "stdout",
            message: `[vibes-proxy-server]upstream-recovered`,
            appId,
          });
        },
      });
    } catch (err) {
      logger.error(`Failed to start proxy for app ${appId}:`, err);
    }
  };

  // Poll for port open status
  const pollingInterval = setInterval(async () => {
    if (proxyStarted) { clearInterval(pollingInterval); return; }
    if (runningApps.get(appId)?.process?.pid !== spawnedProcess.pid) {
      clearInterval(pollingInterval); return;
    }
    const appPort = actualPortByApp.get(appId) ?? getAppPort(appId);
    const isOpen = await checkPortOpen(appPort);
    if (isOpen && !proxyStarted) {
      logger.info(`[App ${appId}] Port ${appPort} detected open via polling. Assuming app is ready.`);
      clearInterval(pollingInterval);
      await startProxyForApp(`http://localhost:${appPort}`);
    }
  }, 3000);

  // Log output
  spawnedProcess.stdout?.on("data", async (data) => {
    const message = util.stripVTControlCharacters(data.toString());
    logger.debug(`App ${appId} (PID: ${spawnedProcess.pid}) stdout: ${message}`);

    addLog({ level: "info", type: "server", message, timestamp: Date.now(), appId });

    if (isNeon && message.includes("created or renamed from another")) {
      spawnedProcess.stdin?.write(`\r\n`);
      logger.info(`App ${appId} (PID: ${spawnedProcess.pid}) wrote enter to stdin to automatically respond to drizzle push input`);
    }

    const inputRequestPattern = /\s*›\s*\([yY]\/[nN]\)\s*$/;
    const isInputRequest = inputRequestPattern.test(message);
    if (isInputRequest) {
      safeSend(event.sender, "app:output", { type: "input-requested", message, appId });
    } else {
      logBuffer.add(appId, { type: "stdout", message, appId, timestamp: Date.now() });
      const urlMatch = message.match(/(https?:\/\/localhost:\d+\/?)/);
      if (urlMatch) {
        await startProxyForApp(urlMatch[1]);
      }
    }
  });

  spawnedProcess.stderr?.on("data", async (data) => {
    const message = util.stripVTControlCharacters(data.toString());
    stderrBuffer += message;
    logger.error(`App ${appId} (PID: ${spawnedProcess.pid}) stderr: ${message}`);
    addLog({ level: "error", type: "server", message, timestamp: Date.now(), appId });
    logBuffer.add(appId, { type: "stderr", message, appId, timestamp: Date.now() });
  });

  spawnedProcess.on("close", (code, signal) => {
    clearInterval(pollingInterval);
    logger.log(`App ${appId} (PID: ${spawnedProcess.pid}) process closed with code ${code}, signal ${signal}.`);
    removeAppIfCurrentProcess(appId, spawnedProcess);

    const stopMessage = code === 0 || code === null
      ? `[vibes] Servidor detenido${signal ? ` (señal: ${signal})` : ""}`
      : `[vibes] Servidor detenido con código de salida ${code}${signal ? `, señal: ${signal}` : ""}`;
    const stopEntry = {
      level: (code === 0 || code === null ? "info" : "error") as "info" | "error",
      type: "server" as const,
      message: stopMessage,
      timestamp: Date.now(),
      appId,
    };
    addLog(stopEntry);
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed() && win.webContents) {
        safeSend(win.webContents, "app:logs-batch", {
          appId,
          logs: [{ type: "stderr" as const, message: stopMessage, appId, timestamp: Date.now() }],
        });
      }
    }

    if (code !== 0 && code !== null && !autoRecoveryAttempted.has(appId)) {
      const missingModulePattern = /Cannot find module|MODULE_NOT_FOUND/;
      const nextServerRunningPattern = /Another next dev server is already running.*?Run kill (\d+) to stop it/is;
      const portConflictMatch = stderrBuffer.match(nextServerRunningPattern);

      if (portConflictMatch) {
        const pidToKill = parseInt(portConflictMatch[1], 10);
        logger.info(`[AutoRecovery] App ${appId} crashed due to port conflict. Attempting to tree-kill PID ${pidToKill}...`);
        autoRecoveryAttempted.add(appId);
        safeSend(event.sender, "app:output", {
          type: "stderr",
          message: `[vibes] Servidor previo detectado. Cerrando proceso ${pidToKill} automáticamente e intentando de nuevo...`,
          appId,
        });

        treeKill(pidToKill, "SIGKILL", (err) => {
          if (err) {
            logger.warn(`[AutoRecovery] Failed to kill process ${pidToKill}:`, err);
          } else {
            logger.info(`[AutoRecovery] Successfully killed process ${pidToKill}. Restarting app...`);
          }
          setTimeout(() => {
            executeApp({ appPath, appId, event, isNeon, installCommand, startCommand }).catch((e) => {
              logger.error(`[AutoRecovery] Failed to recover app ${appId} after killing port conflict:`, e);
            });
          }, 1000);
        });
      } else if (missingModulePattern.test(stderrBuffer)) {
        logger.info(`[AutoRecovery] App ${appId} crashed with missing module error. Attempting auto-recovery...`);
        autoRecoveryAttempted.add(appId);
        safeSend(event.sender, "app:output", {
          type: "stderr",
          message: "[vibes] Módulo faltante detectado. Reinstalando dependencias automáticamente...",
          appId,
        });
        handleMissingModuleRecovery({ appId, appPath, event, isNeon, installCommand, startCommand });
      }
    }
  });

  spawnedProcess.on("error", (err) => {
    clearInterval(pollingInterval);
    logger.error(`Error in app ${appId} (PID: ${spawnedProcess.pid}) process: ${err.message}`);
    removeAppIfCurrentProcess(appId, spawnedProcess);
  });
}

// ─── Auto-recovery ──────────────────────────────────────────────────

async function handleMissingModuleRecovery({
  appId,
  appPath,
  event,
  isNeon,
  installCommand,
  startCommand,
}: {
  appId: number;
  appPath: string;
  event: Electron.IpcMainInvokeEvent;
  isNeon: boolean;
  installCommand?: string | null;
  startCommand?: string | null;
}) {
  try {
    const nodeModulesPath = path.join(appPath, "node_modules");
    if (fs.existsSync(nodeModulesPath)) {
      logger.info(`[AutoRecovery] Removing node_modules for app ${appId} at ${nodeModulesPath}`);
      await fsPromises.rm(nodeModulesPath, { recursive: true, force: true });
      logger.info(`[AutoRecovery] Successfully removed node_modules for app ${appId}`);
    }

    await cleanUpPort(getAppPort(appId));

    logger.info(`[AutoRecovery] Re-executing app ${appId}...`);
    await executeApp({ appPath, appId, event, isNeon, installCommand, startCommand });
  } catch (error) {
    logger.error(`[AutoRecovery] Failed to recover app ${appId}:`, error);
    safeSend(event.sender, "app:output", {
      type: "stderr",
      message: `[vibes] Error durante la recuperación automática: ${error}`,
      appId,
    });
  }
}

// ─── Docker execution ───────────────────────────────────────────────

async function executeAppInDocker({
  appPath,
  appId,
  event,
  isNeon,
  installCommand,
  startCommand,
}: {
  appPath: string;
  appId: number;
  event: Electron.IpcMainInvokeEvent;
  isNeon: boolean;
  installCommand?: string | null;
  startCommand?: string | null;
}): Promise<void> {
  const containerName = `vibes-app-${appId}`;

  // Check if Docker is available
  try {
    await new Promise<void>((resolve, reject) => {
      const checkDocker = spawn("docker", ["--version"], { stdio: "pipe" });
      checkDocker.on("close", (code) => { code === 0 ? resolve() : reject(new Error("Docker is not available")); });
      checkDocker.on("error", () => { reject(new Error("Docker is not available")); });
    });
  } catch {
    throw new Error("Docker is required but not available. Please install Docker Desktop and ensure it's running.");
  }

  // Stop and remove any existing container
  try {
    await new Promise<void>((resolve) => {
      const stopContainer = spawn("docker", ["stop", containerName], { stdio: "pipe" });
      stopContainer.on("close", () => {
        const removeContainer = spawn("docker", ["rm", containerName], { stdio: "pipe" });
        removeContainer.on("close", () => resolve());
        removeContainer.on("error", () => resolve());
      });
      stopContainer.on("error", () => resolve());
    });
  } catch (error) {
    logger.info(`Docker container ${containerName} not found. Ignoring error: ${error}`);
  }

  // Create Dockerfile if it doesn't exist
  const dockerfilePath = path.join(appPath, "Dockerfile.vibes");
  if (!fs.existsSync(dockerfilePath)) {
    const dockerfileContent = `FROM node:22-alpine\n`;
    try {
      await fsPromises.writeFile(dockerfilePath, dockerfileContent, "utf-8");
    } catch (error) {
      logger.error(`Failed to create Dockerfile for app ${appId}:`, error);
      throw new Error(`Failed to create Dockerfile: ${error}`);
    }
  }

  // Build Docker image
  const buildProcess = spawn(
    "docker",
    ["build", "-f", "Dockerfile.vibes", "-t", `vibes-app-${appId}`, "."],
    { cwd: appPath, stdio: "pipe" },
  );

  let buildError = "";
  buildProcess.stderr?.on("data", (data) => { buildError += data.toString(); });

  await new Promise<void>((resolve, reject) => {
    buildProcess.on("close", (code) => { code === 0 ? resolve() : reject(new Error(`Docker build failed: ${buildError}`)); });
    buildProcess.on("error", (err) => { reject(new Error(`Docker build process error: ${err.message}`)); });
  });

  // Run Docker container
  const port = await findFreeAppPort(appId);
  const process = spawn(
    "docker",
    [
      "run", "--rm", "--name", containerName,
      "-p", `${port}:${port}`,
      "-v", `${appPath}:/app`,
      "-v", `vibes-npm-${appId}:/root/.npm`,
      "-w", "/app",
      `vibes-app-${appId}`,
      "sh", "-c", await getCommand({ appId, installCommand, startCommand }),
    ],
    { stdio: "pipe", detached: false },
  );

  if (!process.pid) {
    let errorOutput = "";
    let spawnErr: any = null;
    process.stderr?.on("data", (data) => (errorOutput += data.toString()));
    await new Promise<void>((resolve) => {
      process.once("error", (err) => { spawnErr = err; resolve(); });
    });

    const details = [
      spawnErr?.message ? `message=${spawnErr.message}` : null,
      spawnErr?.code ? `code=${spawnErr.code}` : null,
      spawnErr?.errno ? `errno=${spawnErr.errno}` : null,
      spawnErr?.syscall ? `syscall=${spawnErr.syscall}` : null,
      spawnErr?.path ? `path=${spawnErr.path}` : null,
      spawnErr?.spawnargs ? `spawnargs=${JSON.stringify(spawnErr.spawnargs)}` : null,
    ].filter(Boolean).join(", ");

    logger.error(`Failed to spawn Docker container for app ${appId}. ${details}\nSTDERR:\n${errorOutput || "(empty)"}`);
    throw new Error(
      `Failed to spawn Docker container for app ${appId}.\nDetails: ${details || "n/a"}\nSTDERR:\n${errorOutput || "(empty)"}`,
    );
  }

  const currentProcessId = processCounter.increment();
  runningApps.set(appId, {
    process,
    processId: currentProcessId,
    isDocker: true,
    containerName,
  });

  listenToProcess({ process, appId, isNeon, event, appPath, installCommand, startCommand });
}

// ─── Directory copy helper ──────────────────────────────────────────

export async function copyDir(
  source: string,
  destination: string,
  filter?: (source: string) => boolean,
  options?: { excludeNodeModules?: boolean },
) {
  await fsPromises.cp(source, destination, {
    recursive: true,
    filter: (src: string) => {
      if (options?.excludeNodeModules && path.basename(src) === "node_modules") {
        return false;
      }
      if (filter) {
        return filter(src);
      }
      return true;
    },
  });
}
