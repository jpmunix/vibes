import { writeSettings } from "../main/settings";

export function handleFirebaseOAuthReturn({
    token,
    refreshToken,
    expiresIn,
}: {
    token: string;
    refreshToken: string;
    expiresIn: number;
}) {
    writeSettings({
        firebase: {
            accessToken: {
                value: token,
            },
            refreshToken: {
                value: refreshToken,
            },
            expiresIn,
            tokenTimestamp: Math.floor(Date.now() / 1000),
        },
    });
}
