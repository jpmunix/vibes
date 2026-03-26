import log from "electron-log";
import { createTypedHandler } from "./base";
import { systemContracts } from "../types/system";
import { net } from "electron";

const RELEASE_URL = "https://minube-vibes.b-cdn.net/release.txt";

const logger = log.scope("update_checker_handlers");

export function registerUpdateCheckerHandlers() {
    createTypedHandler(systemContracts.checkRemoteVersion, async () => {
        try {
            const response = await net.fetch(RELEASE_URL, { cache: "no-store" });
            if (!response.ok) return null;
            const text = (await response.text()).trim();
            return text || null;
        } catch (err) {
            logger.warn("Failed to check remote version:", err);
            return null;
        }
    });
}
