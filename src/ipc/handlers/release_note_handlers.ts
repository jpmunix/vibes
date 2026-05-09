import log from "electron-log";
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { IS_TEST_BUILD } from "../utils/test_utils";
import { createTypedHandler } from "./base";
import { systemContracts } from "../types/system";

const logger = log.scope("release_note_handlers");

function getReleaseNotesPath() {
  // En desarrollo y build, el archivo estará en la carpeta assets relativa al root
  // app.getAppPath() nos da la ruta base.
  return path.join(app.getAppPath(), "assets", "RELEASE_NOTES.md");
}

export function registerReleaseNoteHandlers() {
  createTypedHandler(
    systemContracts.doesReleaseNoteExist,
    async (_, params) => {
      // For E2E tests, we don't want to check for release notes
      if (IS_TEST_BUILD) {
        return { exists: false };
      }

      try {
        const filePath = getReleaseNotesPath();
        if (!fs.existsSync(filePath)) {
          logger.debug(`Release note not found at: ${filePath}`);
          return { exists: false };
        }
        // Also check that the file has actual content (not empty/whitespace-only)
        const content = fs.readFileSync(filePath, "utf-8").trim();
        const hasContent = content.length > 0;
        logger.debug(`Checking for release note at: ${filePath}. Has content: ${hasContent}`);
        return { exists: hasContent };
      } catch (error) {
        logger.error(`Error checking for local release note:`, error);
        return { exists: false };
      }
    },
  );

  createTypedHandler(systemContracts.getReleaseNotesContent, async () => {
    try {
      const filePath = getReleaseNotesPath();
      if (!fs.existsSync(filePath)) {
        return "";
      }
      const content = fs.readFileSync(filePath, "utf-8").trim();
      return content;
    } catch (error) {
      logger.error(`Error reading release notes content:`, error);
      return "";
    }
  });

  logger.debug("Registered release note IPC handlers (local)");
}
