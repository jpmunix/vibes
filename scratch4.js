const { drizzle } = require("drizzle-orm/libsql");
const { createClient } = require("@libsql/client");
const { and, eq } = require("drizzle-orm");
const BUNNY_DB_URL = "libsql://01KJ783WM1SD8X465A3VPAGHG6-minube-vibes.lite.bunnydb.net/";
const BUNNY_DB_TOKEN = "eyJ0eXAiOiJKV1QiLCJhbGciOiJFZERTQSJ9.eyJwIjp7InJvIjpudWxsLCJydyI6eyJucyI6WyJtaW51YmUtdmliZXMiXSwidGFncyI6bnVsbH0sInJvYSI6bnVsbCwicndhIjpudWxsLCJkZGwiOm51bGx9LCJpYXQiOjE3NzE5MTc0MDl9.m-5EAVWjKG0kPM72fPFpeAg25seNnUY65gtSzTJlhnD697C1mmCRoXZWkmcreHoV9vTRw22supEVIp342D_2CA";
const remoteSchema = require("./src/db/remote-schema.js");

async function run() {
  const client = createClient({ url: BUNNY_DB_URL, authToken: BUNNY_DB_TOKEN });
  const db = drizzle(client, { schema: remoteSchema });
  
  // Try to replicate the exact findMany call
  const activePromptsRows = await db.query.prompts.findMany({
    where: and(
      eq(remoteSchema.prompts.userId, "295703a0-093e-4b1a-9d27-9b8c4e2a2b71"), // The user_id from scratch3
      eq(remoteSchema.prompts.enabled, 1)
    ),
    orderBy: (p, { asc }) => [asc(p.id)],
  });
  console.log("Filtered Rows Count:", activePromptsRows.length);
  
  // Print their enabled status
  activePromptsRows.forEach(p => console.log(`ID: ${p.id}, Enabled: ${p.enabled}, Title: ${p.title}`));
}
run().catch(console.error);
