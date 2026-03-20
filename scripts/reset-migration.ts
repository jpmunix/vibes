import { createClient } from "@libsql/client";

async function main() {
    const BUNNY_DB_URL = "libsql://01KJ783WM1SD8X465A3VPAGHG6-minube-vibes.lite.bunnydb.net/";
    const BUNNY_DB_TOKEN = "eyJ0eXAiOiJKV1QiLCJhbGciOiJFZERTQSJ9.eyJwIjp7InJvIjpudWxsLCJydyI6eyJucyI6WyJtaW51YmUtdmliZXMiXSwidGFncyI6bnVsbH0sInJvYSI6bnVsbCwicndhIjpudWxsLCJkZGwiOm51bGx9LCJpYXQiOjE3NzE5MTc0MDl9.m-5EAVWjKG0kPM72fPFpeAg25seNnUY65gtSzTJlhnD697C1mmCRoXZWkmcreHoV9vTRw22supEVIp342D_2CA";

    const client = createClient({ url: BUNNY_DB_URL, authToken: BUNNY_DB_TOKEN });

    try {
        console.log("Resetting migration_status to 'pending' for all users in remote Bunny DB...");
        const result = await client.execute("UPDATE users SET migration_status = 'pending'");
        console.log(`Success! Updated ${result.rowsAffected} users.`);
    } catch (e) {
        console.error("Failed:", e);
    }
}

main();
