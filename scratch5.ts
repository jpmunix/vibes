import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import { and, eq } from "drizzle-orm";
import * as remoteSchema from "./src/db/remote-schema";

const BUNNY_DB_URL = "libsql://01KJ783WM1SD8X465A3VPAGHG6-minube-vibes.lite.bunnydb.net/";
const BUNNY_DB_TOKEN = "eyJ0eXAiOiJKV1QiLCJhbGciOiJFZERTQSJ9.eyJwIjp7InJvIjpudWxsLCJydyI6eyJucyI6WyJtaW51YmUtdmliZXMiXSwidGFncyI6bnVsbH0sInJvYSI6bnVsbCwicndhIjpudWxsLCJkZGwiOm51bGx9LCJpYXQiOjE3NzE5MTc0MDl9.m-5EAVWjKG0kPM72fPFpeAg25seNnUY65gtSzTJlhnD697C1mmCRoXZWkmcreHoV9vTRw22supEVIp342D_2CA";

async function run() {
  const client = createClient({ url: BUNNY_DB_URL, authToken: BUNNY_DB_TOKEN });
  const db = drizzle(client, { schema: remoteSchema });
  
  const disabledPrompts = await db.query.prompts.findMany({
    where: and(
      eq(remoteSchema.prompts.userId, "295703a0-093e-4b1a-9d27-9b8c4e2a2b71"),
      eq(remoteSchema.prompts.enabled, 0)
    ),
    orderBy: (p, { asc }) => [asc(p.id)],
  });
  console.log("Disabled Rows Count:", disabledPrompts.length);
  disabledPrompts.forEach(p => console.log(`ID: ${p.id}, Enabled: ${p.enabled}, Title: ${p.title}`));
}
run().catch(console.error);
