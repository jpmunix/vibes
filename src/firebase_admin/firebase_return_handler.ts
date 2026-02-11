import { writeSettings } from "../main/settings";
import { FIREBASE_AUTH_CONFIG } from "../shared/firebase_auth_config";
import log from "electron-log";

export async function handleFirebaseOAuthReturn({
    code,
}: {
    code: string;
}) {
    try {
        const body: Record<string, string> = {
            code,
            client_id: FIREBASE_AUTH_CONFIG.clientId,
            redirect_uri: FIREBASE_AUTH_CONFIG.redirectUri,
            grant_type: "authorization_code",
        };

        const response = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams(body),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Failed to exchange Google OAuth code: ${JSON.stringify(errorData)}`);
        }

        const data = await response.json();

        writeSettings({
            firebase: {
                accessToken: {
                    value: data.access_token,
                },
                refreshToken: {
                    value: data.refresh_token,
                },
                expiresIn: data.expires_in,
                tokenTimestamp: Math.floor(Date.now() / 1000),
            },
        });
    } catch (error) {
        log.error("Error in handleFirebaseOAuthReturn:", error);
        throw error;
    }
}
