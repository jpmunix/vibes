import { useState, useEffect } from "react";
import { useAppVersion } from "./useAppVersion";
import { ipc } from "@/ipc/types";

const DISMISSED_KEY = "update-dismissed-version";
const CDN_BASE = "https://minube-vibes.b-cdn.net";

export function useUpdateChecker() {
    const appVersion = useAppVersion();
    const [updateVersion, setUpdateVersion] = useState<string | null>(null);
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        if (!appVersion) return;

        // Fetch via main process to avoid CORS restrictions in the renderer
        ipc.system.checkRemoteVersion().then((remoteVersion) => {
            if (!remoteVersion) return;
            if (remoteVersion === appVersion) return;

            const dismissed = localStorage.getItem(DISMISSED_KEY);
            if (dismissed === remoteVersion) return;

            setUpdateVersion(remoteVersion);
            setIsOpen(true);
        });
    }, [appVersion]);

    const dismiss = (remember: boolean) => {
        if (remember && updateVersion) {
            localStorage.setItem(DISMISSED_KEY, updateVersion);
        }
        setIsOpen(false);
    };

    const download = async () => {
        // Store as dismissed so the notification doesn't reappear while
        // the user is still on the old version (they may install later)
        if (updateVersion) {
            localStorage.setItem(DISMISSED_KEY, updateVersion);
        }
        const platform = await ipc.system.getSystemPlatform();
        const url =
            platform === "darwin"
                ? `${CDN_BASE}/mac/${updateVersion}.zip`
                : `${CDN_BASE}/linux/${updateVersion}.deb`;
        ipc.system.openExternalUrl(url);
        setIsOpen(false);
    };

    return { updateVersion, isOpen, dismiss, download };
}
