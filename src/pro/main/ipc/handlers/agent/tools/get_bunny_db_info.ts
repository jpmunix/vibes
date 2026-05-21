import { z } from "zod";
import { ToolDefinition, AgentContext, escapeXmlContent } from "./types";

const getBunnyDbInfoSchema = z.object({
    tableName: z
        .string()
        .optional()
        .describe(
            "Optional table name to get schema for. If omitted, lists all tables.",
        ),
});

export const getBunnyDbInfoTool: ToolDefinition<
    z.infer<typeof getBunnyDbInfoSchema>
> = {
    name: "get_bunny_db_info",
    description:
        "Get Bunny.net database info: list tables or get schema for a specific table. The database uses libSQL (SQLite-compatible). Use this to discover what tables and columns exist.",
    inputSchema: getBunnyDbInfoSchema,
    defaultConsent: "always",
    isEnabled: (ctx) =>
        !!(ctx.bunnyConfig && ctx.bunnyConfig.databases.length > 0),

    getConsentPreview: (args) =>
        args.tableName
            ? `Get schema for table "${args.tableName}"`
            : "List all tables",

    execute: async (args, ctx: AgentContext) => {
        if (!ctx.bunnyConfig || ctx.bunnyConfig.databases.length === 0) {
            throw new Error("Bunny.net database is not configured for this app");
        }

        const db = ctx.bunnyConfig.databases[0];

        ctx.onXmlStream(
            `<vibes-bunny-db-info${args.tableName ? ` table="${args.tableName}"` : ""}></vibes-bunny-db-info>`,
        );

        // Dynamic import to avoid bundling issues if @libsql/client is not installed
        let createClient: any;
        try {
            const libsql = await import("@libsql/client");
            createClient = libsql.createClient;
        } catch {
            const result = `@libsql/client is not installed in the main process. Database info:\n- Name: ${db.name}\n- URL: ${db.databaseUrl}\n\nTo query the database, the user's app should use @libsql/client directly.`;
            ctx.onXmlComplete(
                `<vibes-bunny-db-info>${escapeXmlContent(result)}</vibes-bunny-db-info>`,
            );
            return result;
        }

        const client = createClient({
            url: db.databaseUrl,
            authToken: db.fullAccessToken,
        });

        let result: string;

        try {
            if (args.tableName) {
                // Get schema for a specific table
                const pragma = await client.execute(
                    `PRAGMA table_info("${args.tableName.replace(/"/g, '""')}")`,
                );
                const columns = pragma.rows.map((row: any) => ({
                    name: row.name,
                    type: row.type,
                    notnull: row.notnull,
                    pk: row.pk,
                    dflt_value: row.dflt_value,
                }));

                result = `# Table: ${args.tableName}\n\n## Columns\n${JSON.stringify(columns, null, 2)}`;
            } else {
                // List all tables
                const tables = await client.execute(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
                );
                const tableNames = tables.rows.map((row: any) => row.name);

                result = `# Bunny Database: ${db.name}\n\n## Tables\n${JSON.stringify(tableNames)}`;
            }
        } finally {
            client.close();
        }

        ctx.onXmlComplete(
            `<vibes-bunny-db-info${args.tableName ? ` table="${args.tableName}"` : ""}>\n${escapeXmlContent(result)}\n</vibes-bunny-db-info>`,
        );

        return result;
    },
};
