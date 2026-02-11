import { readSettings, writeSettings } from "../main/settings";
import log from "electron-log";
import { IS_TEST_BUILD } from "../ipc/utils/test_utils";
import { withLock } from "../ipc/utils/lock_utils";

const logger = log.scope("firebase_management_client");

function isTokenExpired(expiresIn?: number): boolean {
    if (!expiresIn) return true;

    const settings = readSettings();
    const tokenTimestamp = settings.firebase?.tokenTimestamp || 0;
    const currentTime = Math.floor(Date.now() / 1000);

    return currentTime >= tokenTimestamp + expiresIn - 300;
}

export async function refreshFirebaseToken(): Promise<void> {
    const settings = readSettings();
    const refreshToken = settings.firebase?.refreshToken?.value;

    if (!isTokenExpired(settings.firebase?.expiresIn)) {
        return;
    }

    if (!refreshToken) {
        throw new Error("Firebase refresh token not found. Please authenticate first.");
    }

    try {
        // Note: This URL depends on how you host your OAuth bridge
        const response = await fetch(
            "https://oauth.dyad.sh/api/integrations/firebase/refresh",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ refreshToken }),
            },
        );

        if (!response.ok) {
            throw new Error(`Token refresh failed: ${response.statusText}`);
        }

        const {
            accessToken,
            refreshToken: newRefreshToken,
            expiresIn,
        } = await response.json();

        writeSettings({
            firebase: {
                accessToken: {
                    value: accessToken,
                },
                refreshToken: {
                    value: newRefreshToken,
                },
                expiresIn,
                tokenTimestamp: Math.floor(Date.now() / 1000),
            },
        });
    } catch (error) {
        logger.error("Error refreshing Firebase token:", error);
        throw error;
    }
}

export async function getFirebaseAccessToken(): Promise<string> {
    if (IS_TEST_BUILD) {
        return "fake-firebase-token";
    }

    const settings = readSettings();
    const firebaseAccessToken = settings.firebase?.accessToken?.value;
    const expiresIn = settings.firebase?.expiresIn;

    if (!firebaseAccessToken) {
        throw new Error("Firebase access token not found. Please authenticate first.");
    }

    if (isTokenExpired(expiresIn)) {
        await withLock("refresh-firebase-token", refreshFirebaseToken);
        const updatedSettings = readSettings();
        const newAccessToken = updatedSettings.firebase?.accessToken?.value;

        if (!newAccessToken) {
            throw new Error("Failed to refresh Firebase access token");
        }

        return newAccessToken;
    }

    return firebaseAccessToken;
}

export async function listFirebaseProjects() {
    const token = await getFirebaseAccessToken();
    const response = await fetch("https://firebase.googleapis.com/v1beta1/projects", {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    });

    if (!response.ok) {
        throw new Error(`Failed to list Firebase projects: ${response.statusText}`);
    }

    const data = await response.json();
    return data.results || [];
}

export async function getFirebaseProjectWebConfig(projectId: string) {
    const token = await getFirebaseAccessToken();

    // 1. List web apps for this project
    const appsResponse = await fetch(`https://firebase.googleapis.com/v1beta1/projects/${projectId}/webApps`, {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    });

    if (!appsResponse.ok) {
        throw new Error(`Failed to list Firebase web apps: ${appsResponse.statusText}`);
    }

    const appsData = await appsResponse.json();
    let webApp = appsData.apps?.[0];

    // 2. If no web app exists, create one (Optional, but useful for "native" feel)
    if (!webApp) {
        const createResponse = await fetch(`https://firebase.googleapis.com/v1beta1/projects/${projectId}/webApps`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                displayName: "Minube Vibes App",
            }),
        });

        if (createResponse.ok) {
            webApp = await createResponse.json();
        } else {
            throw new Error(`Failed to create Firebase web app: ${createResponse.statusText}`);
        }
    }

    // 3. Get the config for the web app
    const configResponse = await fetch(`https://firebase.googleapis.com/v1beta1/projects/${projectId}/webApps/${webApp.appId}/config`, {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    });

    if (!configResponse.ok) {
        throw new Error(`Failed to get Firebase web app config: ${configResponse.statusText}`);
    }

    return await configResponse.json();
}
