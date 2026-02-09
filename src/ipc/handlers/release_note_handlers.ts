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

function getDocumentationPath() {
  return path.join(app.getAppPath(), "assets", "DOCUMENTATION.md");
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
        const exists = fs.existsSync(filePath);
        logger.debug(`Checking for release note at: ${filePath}. Exists: ${exists}`);
        return { exists };
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
        return "# No hay notas de lanzamiento disponibles.";
      }
      const content = fs.readFileSync(filePath, "utf-8");
      return content;
    } catch (error) {
      logger.error(`Error reading release notes content:`, error);
      return "# Error al cargar las notas de lanzamiento.";
    }
  });

  createTypedHandler(systemContracts.getDocumentationContent, async () => {
    try {
      const filePath = getDocumentationPath();
      if (!fs.existsSync(filePath)) {
        return "# Documentación\n\nNo se encontró el archivo de documentación.";
      }
      const content = fs.readFileSync(filePath, "utf-8");
      return content;
    } catch (error) {
      logger.error(`Error reading documentation content:`, error);
      return "# Error al cargar la documentación.";
    }
  });

  logger.debug("Registered release note and documentation IPC handlers (local)");
}
