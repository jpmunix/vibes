import { BrowserWindow, clipboard, dialog } from "electron";
import { platform, arch } from "os";
import { readSettings } from "../../main/settings";
import { createTypedHandler } from "./base";
import { systemContracts } from "../types/system";
import { miscContracts } from "../types/misc";
import type { SystemDebugInfo } from "../types/system";

import log from "electron-log";
import path from "path";
import fs from "fs";
import { runShellCommand } from "../utils/runShellCommand";
import { extractCodebase } from "../../utils/codebase";
import { getRemoteDb } from "../../db/remote";
import * as remoteSchema from "../../db/remote-schema";
import { and, eq } from "drizzle-orm";
import { getVibesAppPath } from "../../paths/paths";
import { LargeLanguageModel } from "@/lib/schemas";
import { validateChatContext } from "../utils/context_paths_utils";

const logger = log.scope("debug_handlers");

// Shared function to get system debug info
async function getSystemDebugInfo({
  linesOfLogs,
  level,
}: {
  linesOfLogs: number;
  level: "warn" | "info";
}): Promise<SystemDebugInfo> {
  logger.info("Getting system debug info");

  // Get Node.js version
  let nodeVersion: string | null = null;
  let pnpmVersion: string | null = null;
  let nodePath: string | null = null;
  try {
    nodeVersion = await runShellCommand("node --version");
  } catch (err) {
    logger.error("Failed to get Node.js version:", err);
  }

  try {
    if (platform() === "win32") {
      nodePath = await runShellCommand("where.exe node");
    } else {
      nodePath = await runShellCommand("which node");
    }
  } catch (err) {
    logger.error("Failed to get node path:", err);
  }

  // Get Vibes version from package.json
  const packageJsonPath = path.resolve(__dirname, "..", "..", "package.json");
  let vibesVersion = "unknown";
  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    vibesVersion = packageJson.version;
  } catch (err) {
    logger.error("Failed to read package.json:", err);
  }

  // Get telemetry info from settings
  const settings = readSettings();
  const telemetryId = settings.telemetryUserId || "unknown";

  // Get logs from electron-log
  let logs = "";
  try {
    const logPath = log.transports.file.getFile().path;
    if (fs.existsSync(logPath)) {
      const logContent = fs.readFileSync(logPath, "utf8");

      const logLines = logContent.split("\n").filter((line) => {
        if (level === "info") {
          return true;
        }
        // Example line:
        // [2025-06-09 13:55:05.209] [debug] (runShellCommand) Command "which node" succeeded with code 0: /usr/local/bin/node
        const logLevelRegex = /\[.*?\] \[(\w+)\]/;
        const match = line.match(logLevelRegex);
        if (!match) {
          // Include non-matching lines (like stack traces) when filtering for warnings
          return true;
        }
        const logLevel = match[1];
        if (level === "warn") {
          return logLevel === "warn" || logLevel === "error";
        }
        return true;
      });

      logs = logLines.slice(-linesOfLogs).join("\n");
    }
  } catch (err) {
    logger.error("Failed to read log file:", err);
    logs = `Error reading logs: ${err}`;
  }

  return {
    nodeVersion,
    nodePath,
    telemetryId,
    selectedLanguageModel:
      serializeModelForDebug(settings.selectedModel) || "unknown",
    telemetryConsent: settings.telemetryConsent || "unknown",
    telemetryUrl: "https://us.i.posthog.com", // Hardcoded from renderer.tsx
    vibesVersion,
    platform: process.platform,
    architecture: arch(),
    logs,
  };
}

export function registerDebugHandlers() {
  createTypedHandler(systemContracts.getSystemDebugInfo, async () => {
    logger.info("IPC: get-system-debug-info called");
    return getSystemDebugInfo({
      linesOfLogs: 20,
      level: "warn",
    });
  });

  createTypedHandler(miscContracts.getChatLogs, async (_, chatId, context) => {
    logger.info(`IPC: get-chat-logs called for chat ${chatId}`);
    if (!context.userId) throw new Error("Unauthorized");

    try {
      // We can retrieve a lot more lines here because we're not limited by the
      // GitHub issue URL length limit.
      const debugInfo = await getSystemDebugInfo({
        linesOfLogs: 1_000,
        level: "info",
      });

      // Get chat data from remote database
      const db = getRemoteDb();
      const chatRecord = await db.query.chats.findFirst({
        where: and(eq(remoteSchema.chats.id, chatId), eq(remoteSchema.chats.userId, context.userId)),
        with: {
          messages: {
            orderBy: (messages, { asc }) => [asc(messages.createdAt)],
          },
        },
      });

      if (!chatRecord) {
        throw new Error(`Chat with ID ${chatId} not found`);
      }

      // Format the chat to match the Chat interface
      const chat = {
        id: chatRecord.id,
        title: chatRecord.title || "Untitled Chat",
        messages: chatRecord.messages.map((msg) => ({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          approvalState: msg.approvalState,
        })),
      };

      // Get app data from remote database
      const app = await db.query.apps.findFirst({
        where: and(eq(remoteSchema.apps.id, chatRecord.appId), eq(remoteSchema.apps.userId, context.userId)),
      });

      if (!app) {
        throw new Error(`App with ID ${chatRecord.appId} not found`);
      }

      // Extract codebase
      const appPath = getVibesAppPath(app.path);
      const codebase = (
        await extractCodebase({
          appPath,
          chatContext: validateChatContext(app.chatContext),
        })
      ).formattedOutput;

      return {
        debugInfo,
        chat,
        codebase,
      };
    } catch (error) {
      logger.error(`Error in get-chat-logs:`, error);
      throw error;
    }
  });

  logger.info("Registered debug IPC handlers");

  createTypedHandler(systemContracts.takeScreenshot, async (_, params) => {
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    if (!win) throw new Error("No window to capture");

    // Capture the window's current contents
    // Electron's capturePage accepts a rect {x, y, width, height}
    const image = params?.rect
      ? await win.capturePage(params.rect)
      : await win.capturePage();

    // Validate image
    if (!image || image.isEmpty()) {
      throw new Error("Failed to capture screenshot");
    }
    // Write the image to the clipboard (still useful for manual paste)
    clipboard.writeImage(image);

    // Return data URL for the UI to use
    return image.toDataURL();
  });

  createTypedHandler(systemContracts.saveTextToFile, async (_, params) => {
    const { content, defaultName, filters } = params;

    const result = await dialog.showSaveDialog({
      defaultPath: defaultName,
      filters: filters,
    });

    if (result.canceled || !result.filePath) {
      return { filePath: null, canceled: true };
    }

    try {
      fs.writeFileSync(result.filePath, content, "utf8");
      return { filePath: result.filePath, canceled: false };
    } catch (error) {
      log.error("Failed to save text to file:", error);
      throw error;
    }
  });
}

function serializeModelForDebug(model: LargeLanguageModel): string {
  return `${model.provider}:${model.name} | customId: ${model.customModelId}`;
}
