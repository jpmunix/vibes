import { createTypedHandler } from "./base";
import { miscContracts } from "../types/misc";
import { getLogs } from "../../lib/log_store";
import log from "electron-log";

const logger = log.scope("console_handlers");

export function registerConsoleHandlers() {
    createTypedHandler(miscContracts.getConsoleLogs, async (_, { appId }) => {
        logger.debug(`Fetching console logs for app ${appId}`);
        const logs = getLogs(appId);
        // Convert to AppOutput format if needed, but LogStore stores ConsoleEntry which matches contract
        return logs;
    });

    logger.info("Registered console handlers");
}
