import fs from "node:fs";
import path from "node:path";
import { getUserDataPath } from "@/paths/paths";
import log from "electron-log";

const logger = log.scope("token_stats_logger");

export type TokenStatEntry = {
  chatId?: number;
  debateId?: number;
  source?: "chat" | "debate";
  messageId: number;
  totalTokens: number;
  promptTokens?: number;
  completionTokens?: number;
  model?: string | null;
  timestamp: number;
  appId?: number | null;
  filesSent?: string[];
  toolsUsed?: string[];
};

function getStatsFilePath(): string {
  return path.join(getUserDataPath(), "token-stats.jsonl");
}

export function logTokenUsage(entry: TokenStatEntry) {
  try {
    const line = JSON.stringify({
      ...entry,
      timestamp: entry.timestamp ?? Date.now(),
    });
    fs.appendFileSync(getStatsFilePath(), line + "\n", "utf-8");
  } catch (error) {
    logger.error("Failed to log token usage", error);
  }
}

export function readTokenStats(limit = 200): TokenStatEntry[] {
  const filePath = getStatsFilePath();
  if (!fs.existsSync(filePath)) return [];
  try {
    const lines = fs.readFileSync(filePath, "utf-8").trim().split("\n");
    const parsed: TokenStatEntry[] = [];
    for (let i = lines.length - 1; i >= 0 && parsed.length < limit; i--) {
      const line = lines[i];
      try {
        const data = JSON.parse(line);
        parsed.push(data as TokenStatEntry);
      } catch {
        // Skip malformed lines
      }
    }
    return parsed;
  } catch (error) {
    logger.error("Failed to read token stats", error);
    return [];
  }
}
