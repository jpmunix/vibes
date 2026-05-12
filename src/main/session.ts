import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import log from "electron-log";
import { getUserDataPath } from "../paths/paths";

const logger = log.scope("session");

export interface SessionData {
  userId: string;
  sessionToken: string;
}

const SESSION_FILE = "session.json";

function getSessionPath(): string {
  // If app is not ready yet, we might need a fallback, but getUserDataPath handles it
  return path.join(getUserDataPath(), SESSION_FILE);
}

/** Read session synchronously — designed for splash-time usage */
export function readSession(): SessionData | null {
  try {
    const filePath = getSessionPath();
    if (!fs.existsSync(filePath)) {
      // Fallback: migrate from legacy user-settings.json
      const legacyPath = path.join(getUserDataPath(), "user-settings.json");
      if (fs.existsSync(legacyPath)) {
        const legacy = JSON.parse(fs.readFileSync(legacyPath, "utf-8"));
        if (legacy.userId && legacy.sessionToken?.value) {
          const session = { userId: legacy.userId, sessionToken: legacy.sessionToken.value };
          writeSession(session);
          return session;
        }
      }
      return null;
    }
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    if (!raw.userId || !raw.sessionToken) return null;
    return raw as SessionData;
  } catch {
    return null;
  }
}

/** Write session (called from auth handlers on login/verify) */
export function writeSession(data: SessionData): void {
  try {
    fs.writeFileSync(getSessionPath(), JSON.stringify(data, null, 2));
  } catch (err) {
    logger.error("Failed to write session:", err);
  }
}

/** Clear session (called on logout) */
export function clearSession(): void {
  try {
    const p = getSessionPath();
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch {
    // ignore
  }
}
