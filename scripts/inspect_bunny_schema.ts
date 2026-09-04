import { createClient, type Client } from "@libsql/client";
import { writeFile } from "node:fs/promises";

async function main(): Promise<void> {
  const url = process.env.BUNNY_DB_URL;
  const authToken = process.env.BUNNY_DB_TOKEN;
  const outputPath = process.env.BUNNY_SCHEMA_OUTPUT ?? "./bunny-schema-inspection.json";

  if (!url) throw new Error("Falta BUNNY_DB_URL");
  if (!authToken) throw new Error("Falta BUNNY_DB_TOKEN");

  const client: Client = createClient({ url, authToken });
  const rows = async (sql: string) => {
    const result = await client.execute(sql);
    return result.rows;
  };
  const quoteIdentifier = (value: string): string => `"${value.replaceAll("\"", "\"\"")}"`;

  try {
    const tables = await rows(`
      SELECT name, sql
      FROM sqlite_master
      WHERE type = 'table'
      ORDER BY name
    `);

    const userTables = tables
      .map((row) => String(row.name))
      .filter((name) => !name.startsWith("sqlite_"));

    const schema: Record<string, unknown> = {};
    for (const table of userTables) {
      const identifier = quoteIdentifier(table);
      schema[table] = {
        columns: await rows(`PRAGMA table_info(${identifier})`),
        indexes: await rows(`PRAGMA index_list(${identifier})`),
        foreignKeys: await rows(`PRAGMA foreign_key_list(${identifier})`),
        createSql: tables.find((row) => String(row.name) === table)?.sql ?? null,
      };
    }

    const counts: Record<string, number | string> = {};
    for (const table of userTables) {
      try {
        const result = await rows(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(table)}`);
        counts[table] = Number(result[0]?.count ?? 0);
      } catch (error) {
        counts[table] = error instanceof Error ? `ERROR: ${error.message}` : String(error);
      }
    }

    const sampleTables = [
      "prompt_defaults",
      "language_model_providers",
      "custom_themes",
      "sessions",
      "todo_sections",
      "chat_logs",
      "name",
      "prompts_categories",
      "mcp_servers",
    ];
    const samples: Record<string, unknown[]> = {};
    for (const table of sampleTables) {
      if (userTables.includes(table)) {
        samples[table] = await rows(`SELECT * FROM ${quoteIdentifier(table)} LIMIT 5`);
      }
    }

    const result = {
      inspectedAt: new Date().toISOString(),
      databaseUrl: url.replace(/(libsql:\/\/)[^/]+/, "$1<redacted>"),
      tables: userTables,
      schema,
      counts,
      samples,
    };

    await writeFile(outputPath, JSON.stringify(result, null, 2) + "\n", "utf8");

    console.log(`Inspección completada: ${outputPath}`);
    console.log(`Tablas de usuario: ${userTables.length}`);
    console.log(`Tablas: ${userTables.join(", ")}`);
    console.log("Conteos:");
    for (const [table, count] of Object.entries(counts)) console.log(`  ${table}: ${count}`);
  } finally {
    client.close();
  }
}

void main().catch((error: unknown) => {
  console.error("Inspección fallida:", error);
  process.exitCode = 1;
});
