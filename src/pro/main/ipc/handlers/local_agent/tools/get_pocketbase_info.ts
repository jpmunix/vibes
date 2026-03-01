import { z } from "zod";
import { ToolDefinition, AgentContext, escapeXmlContent } from "./types";

const getPocketbaseInfoSchema = z.object({});

export const getPocketbaseInfoTool: ToolDefinition<
    z.infer<typeof getPocketbaseInfoSchema>
> = {
    name: "get_pocketbase_info",
    description:
        "Get PocketBase database collections and schema. The app must be configured with PocketBase first. Use this to discover what collections and fields exist.",
    inputSchema: getPocketbaseInfoSchema,
    defaultConsent: "always",
    isEnabled: (ctx) => !!ctx.pocketbaseConfig,

    getConsentPreview: () => "Get PocketBase collections schema",

    execute: async (_args, ctx: AgentContext) => {
        if (!ctx.pocketbaseConfig) {
            throw new Error("PocketBase is not configured for this app");
        }

        ctx.onXmlStream(`<dyad-pocketbase-info></dyad-pocketbase-info>`);

        let PocketBase: any;
        try {
            PocketBase = (await import("pocketbase")).default;
        } catch {
            const result = `pocketbase is not installed in the main process. Configuration:\n- URL: ${ctx.pocketbaseConfig.url}\n- Admin Email: ${ctx.pocketbaseConfig.adminEmail}\n\nTo interact with PocketBase, the user's app should use the 'pocketbase' npm package.`;
            ctx.onXmlComplete(
                `<dyad-pocketbase-info>\n${escapeXmlContent(result)}\n</dyad-pocketbase-info>`
            );
            return result;
        }

        let result: string;
        try {
            const pb = new PocketBase(ctx.pocketbaseConfig.url);
            await pb.collection('_superusers').authWithPassword(ctx.pocketbaseConfig.adminEmail, ctx.pocketbaseConfig.adminPassword);

            const cols = await pb.collections.getFullList({ sort: '-created' });

            const collections = cols.map((c: any) => ({
                id: c.id,
                name: c.name,
                type: c.type,
                system: !!c.system,
                fields: (c.fields || c.schema || []).map((f: any) => ({
                    name: f.name,
                    type: f.type,
                    required: !!f.required,
                    options: f.type === 'file' ? { maxFiles: f.maxFiles || f.options?.maxFiles } : undefined
                }))
            }));

            result = `# PocketBase Collections\n\n${JSON.stringify(collections, null, 2)}\n\n## Note on Storage\nPocketBase storage is tied to collections. Fields of type "file" store uploaded files. Access them via: \`${ctx.pocketbaseConfig.url}/api/files/COLLECTION_ID_OR_NAME/RECORD_ID/FILENAME\`.`;
        } catch (err: any) {
            result = `Error reading PocketBase collections: ${err.message}`;
        }

        ctx.onXmlComplete(
            `<dyad-pocketbase-info>\n${escapeXmlContent(result)}\n</dyad-pocketbase-info>`
        );

        return result;
    },
};
