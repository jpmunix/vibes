const { createClient } = require("@libsql/client");
const BUNNY_DB_URL = "libsql://01KJ783WM1SD8X465A3VPAGHG6-minube-vibes.lite.bunnydb.net/";
const BUNNY_DB_TOKEN = "eyJ0eXAiOiJKV1QiLCJhbGciOiJFZERTQSJ9.eyJwIjp7InJvIjpudWxsLCJydyI6eyJucyI6WyJtaW51YmUtdmliZXMiXSwidGFncyI6bnVsbH0sInJvYSI6bnVsbCwicndhIjpudWxsLCJkZGwiOm51bGx9LCJpYXQiOjE3NzE5MTc0MDl9.m-5EAVWjKG0kPM72fPFpeAg25seNnUY65gtSzTJlhnD697C1mmCRoXZWkmcreHoV9vTRw22supEVIp342D_2CA";

async function run() {
  const client = createClient({ url: BUNNY_DB_URL, authToken: BUNNY_DB_TOKEN });
  const res = await client.execute("SELECT * FROM prompts WHERE system_id = 'ctx_caveman_mode'");
  console.log(res.rows);
}
run().catch(console.error);
