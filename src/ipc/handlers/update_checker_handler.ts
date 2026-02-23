import log from "electron-log";
import { createLoggedHandler } from "./safe_handle";
import { net } from "electron";

const RELEASE_URL = "https://minube-vibes.b-cdn.net/release.txt";

const logger = log.scope("update_checker_handlers");
const handle = createLoggedHandler(logger);

export function registerUpdateCheckerHandlers() {
    handle("system:check-remote-version", async () => {
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
