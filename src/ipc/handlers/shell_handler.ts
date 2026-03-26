import { shell } from "electron";
import log from "electron-log";
import { createTypedHandler } from "./base";
import { systemContracts } from "../types/system";

const logger = log.scope("shell_handlers");

export function registerShellHandlers() {
  createTypedHandler(systemContracts.openExternalUrl, async (_event, url) => {
    if (!url) {
      throw new Error("No URL provided.");
    }
    if (!url.startsWith("http://") && !url.startsWith("https://") && !url.startsWith("mailto:")) {
      throw new Error("Attempted to open invalid or non-http URL: " + url);
    }
    await shell.openExternal(url);
    logger.debug("Opened external URL:", url);
  });

  createTypedHandler(systemContracts.showItemInFolder, async (_event, fullPath) => {
    // Validate that a path was provided
    if (!fullPath) {
      throw new Error("No file path provided.");
    }

    shell.showItemInFolder(fullPath);
    logger.debug("Showed item in folder:", fullPath);
  });
}
