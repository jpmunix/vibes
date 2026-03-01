import { getClient } from "../src/db/remote";

async function run() {
    const client = getClient();
    try {
        await client.execute("ALTER TABLE apps ADD COLUMN pocketbase_config TEXT;");
        console.log("Migration successful");
    } catch (err: any) {
        if (err.message.includes("duplicate column name")) {
            console.log("Column already exists");
        } else {
            console.error("Migration failed:", err);
        }
    }
}

run();
