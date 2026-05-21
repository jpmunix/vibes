const { createClient } = require("@libsql/client");
const BUNNY_DB_URL = "libsql://01KJ783WM1SD8X465A3VPAGHG6-minube-vibes.lite.bunnydb.net/";
const BUNNY_DB_TOKEN = "eyJ0eXAiOiJKV1QiLCJhbGciOiJFZERTQSJ9.eyJwIjp7InJvIjpudWxsLCJydyI6eyJucyI6WyJtaW51YmUtdmliZXMiXSwidGFncyI6bnVsbH0sInJvYSI6bnVsbCwicndhIjpudWxsLCJkZGwiOm51bGx9LCJpYXQiOjE3NzE5MTc0MDl9.m-5EAVWjKG0kPM72fPFpeAg25seNnUY65gtSzTJlhnD697C1mmCRoXZWkmcreHoV9vTRw22supEVIp342D_2CA";

async function run() {
  const client = createClient({ url: BUNNY_DB_URL, authToken: BUNNY_DB_TOKEN });
  
  // 1. Delete the specific system_id
  const res1 = await client.execute("DELETE FROM prompts WHERE system_id = 'ctx_caveman_mode'");
  console.log("Deleted ctx_caveman_mode rows:", res1.rowsAffected);
  
  // 2. Also search if the user manually pasted "MODO HOMBRE DE LAS CAVERNAS" into a custom prompt and delete that too
  const res2 = await client.execute("DELETE FROM prompts WHERE content LIKE '%MODO HOMBRE DE LAS CAVERNAS%'");
  console.log("Deleted any remaining prompts containing caveman text:", res2.rowsAffected);
}
run().catch(console.error);
