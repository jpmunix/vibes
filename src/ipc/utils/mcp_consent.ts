import { IpcMainInvokeEvent } from "electron";

export async function requireMcpToolConsent(
    event: IpcMainInvokeEvent,
    params: {
        serverId: number;
        serverName: string | null;
        toolName: string;
        toolDescription?: string | null;
        inputPreview: string;
    }
): Promise<boolean> {
    // Vibes Local Agent auto-consents tools execution.
    return true;
}
