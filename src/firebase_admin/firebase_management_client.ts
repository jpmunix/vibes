import { readSettings, writeSettings } from "../main/settings";
import log from "electron-log";
import { IS_TEST_BUILD } from "../ipc/utils/test_utils";
import { withLock } from "../ipc/utils/lock_utils";
import { FIREBASE_AUTH_CONFIG } from "../shared/firebase_auth_config";

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
        const response = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
                client_id: FIREBASE_AUTH_CONFIG.clientId,
                refresh_token: refreshToken,
                grant_type: "refresh_token",
            }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Token refresh failed: ${JSON.stringify(errorData)}`);
        }

        const data = await response.json();

        writeSettings({
            firebase: {
                accessToken: {
                    value: data.access_token,
                },
                refreshToken: {
                    value: data.refresh_token || refreshToken, // Google might not return a new refresh token
                },
                expiresIn: data.expires_in,
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

/**
 * Retries a fetch call with exponential backoff
 */
async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 5, initialDelay = 2000): Promise<Response> {
    let lastError: Error | null = null;
    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await fetch(url, options);
            if (response.ok) return response;

            // If it's a 404, the project might still be propagating
            if (response.status === 404 || response.status === 403) {
                const delay = initialDelay * Math.pow(2, i);
                logger.info(`Source not ready (Status ${response.status}), retrying in ${delay}ms... (Attempt ${i + 1}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }
            return response; // Return other errors immediately
        } catch (error: any) {
            lastError = error;
            const delay = initialDelay * Math.pow(2, i);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    throw lastError || new Error(`Failed after ${maxRetries} retries`);
}

export async function listFirebaseWebApps(projectId: string) {
    const token = await getFirebaseAccessToken();
    const response = await fetchWithRetry(`https://firebase.googleapis.com/v1beta1/projects/${projectId}/webApps`, {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    });

    if (!response.ok) {
        throw new Error(`Failed to list Firebase web apps: ${response.statusText}`);
    }

    const data = await response.json();
    return data.apps || [];
}

export async function createFirebaseWebApp(projectId: string, displayName: string) {
    const token = await getFirebaseAccessToken();
    const response = await fetch(`https://firebase.googleapis.com/v1beta1/projects/${projectId}/webApps`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            displayName: displayName,
        }),
    });

    if (!response.ok) {
        const errBody = await response.json();
        throw new Error(`Failed to create Firebase web app: ${errBody.error?.message || response.statusText}`);
    }

    return await response.json();
}

export async function getFirebaseProjectWebConfig(projectId: string, appId?: string, displayName?: string) {
    const token = await getFirebaseAccessToken();

    let targetAppId = appId;

    if (!targetAppId) {
        // 1. List web apps for this project (with retry because new projects take time to propagate)
        const appsResponse = await fetchWithRetry(`https://firebase.googleapis.com/v1beta1/projects/${projectId}/webApps`, {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });

        if (!appsResponse.ok) {
            throw new Error(`Failed to list Firebase web apps: ${appsResponse.statusText} (${appsResponse.status})`);
        }

        const appsData = await appsResponse.json();
        let webApp = appsData.apps?.[0];

        // 2. If no web app exists, create one
        if (!webApp) {
            logger.info(`No web app found for ${projectId}, creating one...`);
            const createResponse = await fetch(`https://firebase.googleapis.com/v1beta1/projects/${projectId}/webApps`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    displayName: displayName || "Minube Vibes App",
                }),
            });

            if (!createResponse.ok) {
                const errBody = await createResponse.json();
                throw new Error(`Failed to initiate Firebase web app creation: ${errBody.error?.message || createResponse.statusText}`);
            }

            // Poll for the app to be available (it can take up to 20-30 seconds in fresh projects)
            logger.info(`Web app creation initiated for ${projectId}. Polling for availability...`);
            let attempts = 0;
            const maxAttempts = 10;
            const delayMs = 3000;

            while (attempts < maxAttempts) {
                attempts++;
                logger.info(`Polling for web app in ${projectId} (Attempt ${attempts}/${maxAttempts})...`);

                await new Promise(resolve => setTimeout(resolve, delayMs));

                try {
                    const pollFetch = await fetch(`https://firebase.googleapis.com/v1beta1/projects/${projectId}/webApps`, {
                        headers: { Authorization: `Bearer ${token}` }
                    });

                    if (pollFetch.ok) {
                        const pollData = await pollFetch.json();
                        webApp = pollData.apps?.[0];
                        if (webApp) {
                            logger.info(`Web app found for ${projectId} after ${attempts} attempts!`);
                            break;
                        }
                    }
                } catch (e) {
                    logger.warn(`Polling error (attempt ${attempts}):`, e);
                }
            }

            if (!webApp) {
                throw new Error("El proyecto de Firebase se ha creado, pero Google todavía no ha terminado de configurar la App web. Por favor, espera un minuto y vuelve a intentarlo seleccionando el proyecto de la lista.");
            }
        }
        targetAppId = webApp.appId;
    }

    if (!targetAppId) {
        throw new Error("No web app ID provided or found for this project.");
    }

    // 3. Get the config for the web app
    const encodedProjectId = encodeURIComponent(projectId);
    const encodedAppId = encodeURIComponent(targetAppId);
    const configUrl = `https://firebase.googleapis.com/v1beta1/projects/${encodedProjectId}/webApps/${encodedAppId}/config`;

    logger.info(`Fetching web app config from: ${configUrl}`);

    const configResponse = await fetch(configUrl, {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    });

    if (!configResponse.ok) {
        const errorText = await configResponse.text();
        logger.error(`Failed to get Firebase web app config. Status: ${configResponse.status} ${configResponse.statusText}. Body: ${errorText}`);
        throw new Error(`Failed to get Firebase web app config: ${configResponse.statusText} (${configResponse.status})`);
    }

    return await configResponse.json();
}

export async function createFirebaseProject(projectId: string, displayName: string) {
    const token = await getFirebaseAccessToken();

    // 1. Create the GCP Project
    logger.info(`Creating GCP project: ${projectId} (${displayName})`);
    const gcpResponse = await fetch("https://cloudresourcemanager.googleapis.com/v1/projects", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            projectId,
            name: displayName,
        }),
    });

    if (!gcpResponse.ok) {
        const error = await gcpResponse.json();
        throw new Error(`Failed to create GCP project: ${error.error?.message || gcpResponse.statusText}`);
    }

    // Wait a bit for GCP project to be ready (it's async but usually fast for metadata)
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 2. Add Firebase to the project
    logger.info(`Adding Firebase to project: ${projectId}`);
    const firebaseResponse = await fetch(`https://firebase.googleapis.com/v1beta1/projects/${projectId}:addFirebase`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
    });

    if (!firebaseResponse.ok) {
        const error = await firebaseResponse.json();
        throw new Error(`Failed to add Firebase to project: ${error.error?.message || firebaseResponse.statusText}`);
    }

    // 3. Return the project info (structured as FirebaseProject)
    return {
        projectId,
        displayName,
        projectNumber: "", // Will be filled on next list
        resources: {},
    };
}
