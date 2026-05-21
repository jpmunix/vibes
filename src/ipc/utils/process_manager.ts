import { ChildProcess, spawn } from "node:child_process";
import treeKill from "tree-kill";
import log from "electron-log";

const logger = log.scope("process_manager");

// Define a type for the value stored in runningApps
export interface RunningAppInfo {
  process: ChildProcess;
  processId: number;
  isDocker: boolean;
  containerName?: string;
}

// Store running app processes
export const runningApps = new Map<number, RunningAppInfo>();
// Global counter for process IDs
let processCounterValue = 0;

// Getter and setter for processCounter to allow modification from outside
export const processCounter = {
  get value(): number {
    return processCounterValue;
  },
  set value(newValue: number) {
    processCounterValue = newValue;
  },
  increment(): number {
    return ++processCounterValue;
  },
};

/**
 * Kills a running process with its child processes
 * @param process The child process to kill
 * @param pid The process ID
 * @returns A promise that resolves when the process is closed or timeout
 */
export function killProcess(process: ChildProcess): Promise<void> {
  return new Promise<void>((resolve) => {
    // Add timeout to prevent hanging
    const timeout = setTimeout(() => {
      console.warn(
        `Timeout waiting for process (PID: ${process.pid}) to close. Force killing may be needed.`,
      );
      resolve();
    }, 5000); // 5-second timeout

    process.on("close", (code, signal) => {
      clearTimeout(timeout);
      console.log(
        `Received 'close' event for process (PID: ${process.pid}) with code ${code}, signal ${signal}.`,
      );
      resolve();
    });

    // Handle potential errors during kill/close sequence
    process.on("error", (err) => {
      clearTimeout(timeout);
      console.error(
        `Error during stop sequence for process (PID: ${process.pid}): ${err.message}`,
      );
      resolve();
    });

    // Ensure PID exists before attempting to kill
    if (process.pid) {
      // Use tree-kill to terminate the entire process tree
      console.log(
        `Attempting to tree-kill process tree starting at PID ${process.pid}.`,
      );
      treeKill(process.pid, "SIGTERM", (err: Error | undefined) => {
        if (err) {
          console.warn(
            `tree-kill error for PID ${process.pid}: ${err.message}`,
          );
        } else {
          console.log(
            `tree-kill signal sent successfully to PID ${process.pid}.`,
          );
        }
      });
    } else {
      console.warn(`Cannot tree-kill process: PID is undefined.`);
    }
  });
}

/**
 * Gracefully stops a Docker container by name. Resolves even if the container doesn't exist.
 */
export function stopDockerContainer(containerName: string): Promise<void> {
  return new Promise<void>((resolve) => {
    const stop = spawn("docker", ["stop", containerName], { stdio: "pipe" });
    stop.on("close", () => resolve());
    stop.on("error", () => resolve());
  });
}

/**
 * Removes Docker named volumes used for an app's dependencies.
 * Best-effort: resolves even if volumes don't exist.
 */
export function removeDockerVolumesForApp(appId: number): Promise<void> {
  return new Promise<void>((resolve) => {
    const npmVolume = `vibes-npm-${appId}`;

    const rm = spawn("docker", ["volume", "rm", "-f", npmVolume], {
      stdio: "pipe",
    });
    rm.on("close", () => resolve());
    rm.on("error", () => resolve());
  });
}

/**
 * Stops an app based on its RunningAppInfo (container vs host) and removes it from the running map.
 */
export async function stopAppByInfo(
  appId: number,
  appInfo: RunningAppInfo,
): Promise<void> {
  if (appInfo.isDocker) {
    const containerName = appInfo.containerName || `vibes-app-${appId}`;
    await stopDockerContainer(containerName);
  } else {
    await killProcess(appInfo.process);
  }
  runningApps.delete(appId);
}

/**
 * Removes an app from the running apps map if it's the current process
 * @param appId The app ID
 * @param process The process to check against
 */
export function removeAppIfCurrentProcess(
  appId: number,
  process: ChildProcess,
): void {
  const currentAppInfo = runningApps.get(appId);
  if (currentAppInfo && currentAppInfo.process === process) {
    runningApps.delete(appId);
    console.log(
      `Removed app ${appId} (processId ${currentAppInfo.processId}) from running map. Current size: ${runningApps.size}`,
    );
  } else {
    console.log(
      `App ${appId} process was already removed or replaced in running map. Ignoring.`,
    );
  }
}

/**
 * Stop ALL running app processes. Called during app quit / restart
 * so that dev servers started from Vibes don't become orphans.
 *
 * This is best-effort: tree-kill is fire-and-forget because the Electron
 * event loop may terminate before the async callbacks fire.
 */
export function stopAllRunningApps(): void {
  if (runningApps.size === 0) return;

  logger.info(
    `[Shutdown] Stopping ${runningApps.size} running app(s)...`,
  );

  for (const [appId, appInfo] of runningApps.entries()) {
    try {
      if (appInfo.isDocker) {
        // Fire-and-forget docker stop
        const containerName = appInfo.containerName || `vibes-app-${appId}`;
        spawn("docker", ["stop", containerName], { stdio: "ignore" });
        logger.info(`[Shutdown] Sent docker stop to ${containerName}`);
      } else if (appInfo.process?.pid) {
        // Synchronous tree-kill — best-effort, can't await during will-quit
        treeKill(appInfo.process.pid, "SIGTERM", (err) => {
          if (err) {
            logger.warn(
              `[Shutdown] tree-kill error for app ${appId} (PID ${appInfo.process?.pid}): ${err.message}`,
            );
          }
        });
        logger.info(
          `[Shutdown] Sent SIGTERM to app ${appId} (PID ${appInfo.process.pid})`,
        );
      }
    } catch (err: any) {
      logger.warn(`[Shutdown] Error stopping app ${appId}: ${err.message}`);
    }
  }

  // Clear the map — processes are being killed, don't track them anymore
  runningApps.clear();
}
