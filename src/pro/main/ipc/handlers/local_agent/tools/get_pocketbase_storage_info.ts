import { z } from "zod";
import { ToolDefinition, AgentContext, escapeXmlContent } from "./types";

const getPocketbaseStorageInfoSchema = z.object({
    collectionName: z
        .string()
        .optional()
        .describe(
            "Optional collection name to list records and their files. If omitted, lists all collections with file fields.",
        ),
});

export const getPocketbaseStorageInfoTool: ToolDefinition<
    z.infer<typeof getPocketbaseStorageInfoSchema>
> = {
    name: "get_pocketbase_storage_info",
    description:
        "List collections with file fields or list records and files within a specific PocketBase collection. Use this to discover and manage files in PocketBase storage.",
    inputSchema: getPocketbaseStorageInfoSchema,
    defaultConsent: "always",
    isEnabled: (ctx) => !!ctx.pocketbaseConfig,

    getConsentPreview: (args) =>
        args.collectionName
            ? `List files in PocketBase collection "${args.collectionName}"`
            : "List PocketBase collections with file fields",

    execute: async (args, ctx: AgentContext) => {
        if (!ctx.pocketbaseConfig) {
            throw new Error("PocketBase is not configured for this app");
        }

        const infoTag = args.collectionName
            ? `<vibes-pocketbase-storage-info collection="${args.collectionName}"></vibes-pocketbase-storage-info>`
            : `<vibes-pocketbase-storage-info></vibes-pocketbase-storage-info>`;

        ctx.onXmlStream(infoTag);

        let PocketBase: any;
        try {
            PocketBase = (await import("pocketbase")).default;
        } catch {
            const result = `pocketbase is not installed in the main process. Configuration:\n- URL: ${ctx.pocketbaseConfig.url}\n\nTo interact with PocketBase Storage, the user's app should use the 'pocketbase' npm package.`;
            ctx.onXmlComplete(
                `<vibes-pocketbase-storage-info>\n${escapeXmlContent(result)}\n</vibes-pocketbase-storage-info>`
            );
            return result;
        }

        let result: string;
        try {
            const pb = new PocketBase(ctx.pocketbaseConfig.url);
            await pb.collection('_superusers').authWithPassword(ctx.pocketbaseConfig.adminEmail, ctx.pocketbaseConfig.adminPassword);

            if (!args.collectionName) {
                // Discovery mode: find all collections with file fields
                const cols = await pb.collections.getFullList();
                const collectionsWithFiles = cols.filter((c: any) =>
                    (c.fields || c.schema || []).some((f: any) => f.type === 'file')
                ).map((c: any) => ({
                    id: c.id,
                    name: c.name,
                    fileFields: (c.fields || c.schema || []).filter((f: any) => f.type === 'file').map((f: any) => f.name)
                }));

                result = `# PocketBase Storage Discovery\n\nThe following collections have file fields:\n\n${JSON.stringify(collectionsWithFiles, null, 2)}\n\nUse this tool again with a collection name to list files.`;
            } else {
                // List mode: list records and their files
                const records = await pb.collection(args.collectionName).getList(1, 50, { sort: '-created' });
                const col = await pb.collections.getOne(args.collectionName);
                const fileFields = (col.fields || col.schema || []).filter((f: any) => f.type === 'file').map((f: any) => f.name);

                const recordFiles = records.items.map((r: any) => {
                    const files: Record<string, string[]> = {};
                    fileFields.forEach((field: string) => {
                        const val = r[field];
                        files[field] = Array.isArray(val) ? val : (val ? [val] : []);
                    });
                    return {
                        recordId: r.id,
                        ...files
                    };
                });

                result = `# PocketBase Files: ${args.collectionName}\n\n${JSON.stringify(recordFiles, null, 2)}\n\n## File URL Pattern\n${ctx.pocketbaseConfig.url}/api/files/${args.collectionName}/RECORD_ID/FILENAME`;
            }
        } catch (err: any) {
            result = `Error reading PocketBase storage: ${err.message}`;
        }

        ctx.onXmlComplete(
            `<vibes-pocketbase-storage-info>\n${escapeXmlContent(result)}\n</vibes-pocketbase-storage-info>`
        );

        return result;
    },
};
