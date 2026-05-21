import fs from "node:fs";
import path from "node:path";
import log from "electron-log";
import { getUserDataPath } from "../paths/paths";
import { UserSettings } from "../lib/schemas";

const logger = log.scope("runtime");

export interface RuntimeState {
  windowState?: UserSettings["windowState"];
  secondaryWindowStates?: UserSettings["secondaryWindowStates"];
  isRunning?: boolean;
  lastKnownPerformance?: UserSettings["lastKnownPerformance"];
  hasRunBefore?: boolean;
  isTestMode?: boolean;
}

const RUNTIME_FILE = "runtime-state.json";

function getRuntimePath(): string {
  return path.join(getUserDataPath(), RUNTIME_FILE);
}

export function readRuntimeState(): RuntimeState {
  try {
    const filePath = getRuntimePath();
    if (!fs.existsSync(filePath)) {
      // Fallback: migrate from legacy user-settings.json
      const legacyPath = path.join(getUserDataPath(), "user-settings.json");
      if (fs.existsSync(legacyPath)) {
        const legacy = JSON.parse(fs.readFileSync(legacyPath, "utf-8"));
        const runtime: RuntimeState = {
          windowState: legacy.windowState,
          secondaryWindowStates: legacy.secondaryWindowStates,
          isRunning: legacy.isRunning,
          lastKnownPerformance: legacy.lastKnownPerformance,
          hasRunBefore: legacy.hasRunBefore,
          isTestMode: legacy.isTestMode,
        };
        writeRuntimeState(runtime);
        return runtime;
      }
      return {};
    }
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as RuntimeState;
  } catch {
    return {};
  }
}

export function writeRuntimeState(data: Partial<RuntimeState>): void {
  try {
    const current = readRuntimeState();
    const merged = { ...current, ...data };
    fs.writeFileSync(getRuntimePath(), JSON.stringify(merged, null, 2));
  } catch (err) {
    logger.error("Failed to write runtime state:", err);
  }
}

export function clearRuntimeState(): void {
  try {
    const p = getRuntimePath();
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch {
    // ignore
  }
}
