import { z } from "zod";
import { ToolDefinition, AgentContext, escapeXmlContent } from "./types";

const getBunnyStorageInfoSchema = z.object({
    path: z
        .string()
        .optional()
        .describe(
            "Optional directory path to list. Defaults to root '/' of the storage zone.",
        ),
});

export const getBunnyStorageInfoTool: ToolDefinition<
    z.infer<typeof getBunnyStorageInfoSchema>
> = {
    name: "get_bunny_storage_info",
    description:
        "List files and directories in a Bunny.net Storage Zone. Returns file names, sizes, types, and dates. Use this to discover what files are stored.",
    inputSchema: getBunnyStorageInfoSchema,
    defaultConsent: "always",
    isEnabled: (ctx) =>
        !!(ctx.bunnyConfig && ctx.bunnyConfig.storageZones.length > 0),

    getConsentPreview: (args) =>
        args.path
            ? `List files in "${args.path}"`
            : "List files in storage root",

    execute: async (args, ctx: AgentContext) => {
        if (!ctx.bunnyConfig || ctx.bunnyConfig.storageZones.length === 0) {
            throw new Error("Bunny.net storage is not configured for this app");
        }

        const sz = ctx.bunnyConfig.storageZones[0];
        const dirPath = args.path || "/";

        ctx.onXmlStream(
            `<vibes-bunny-storage-info path="${dirPath}"></vibes-bunny-storage-info>`,
        );

        // Use the Bunny.net Storage HTTP API directly (no SDK dependency needed)
        const url = `https://${sz.hostname}/${sz.username}/${dirPath}`.replace(
            /\/+/g,
            "/",
        ).replace("https:/", "https://");

        const response = await fetch(url, {
            headers: {
                AccessKey: sz.password,
                Accept: "application/json",
            },
        });

        if (!response.ok) {
            const errorText = await response.text().catch(() => "Unknown error");
            throw new Error(
                `Bunny Storage API error (${response.status}): ${errorText}`,
            );
        }

        const files = (await response.json()) as Array<{
            Guid: string;
            ObjectName: string;
            Path: string;
            Length: number;
            ContentType: string;
            DateCreated: string;
            LastChanged: string;
            IsDirectory: boolean;
        }>;

        const formatted = files.map((f) => ({
            name: f.ObjectName,
            size: f.IsDirectory ? "-" : `${f.Length} bytes`,
            type: f.IsDirectory ? "directory" : (f.ContentType || "file"),
            modified: f.LastChanged,
        }));

        const result = `# Bunny Storage: ${sz.name}\n## Path: ${dirPath}\n\n${formatted.length === 0 ? "(empty)" : JSON.stringify(formatted, null, 2)}`;

        ctx.onXmlComplete(
            `<vibes-bunny-storage-info path="${dirPath}">\n${escapeXmlContent(result)}\n</vibes-bunny-storage-info>`,
        );

        return result;
    },
};
