/**
 * migrate_settings_to_kv.ts
 * 
 * Migrates ALL users from the monolithic `user_settings` JSON blob
 * to individual key-value rows in `user_preferences`.
 * 
 * Safe to run multiple times (idempotent via upserts).
 * 
 * Usage:
 *   npx tsx scripts/migrate_settings_to_kv.ts
 *   npx tsx scripts/migrate_settings_to_kv.ts --dry-run   # preview only
 */
import { createClient } from "@libsql/client";

// ── BunnyDB credentials (same as src/db/remote.ts) ──
const BUNNY_DB_URL =
  "libsql://01KJ783WM1SD8X465A3VPAGHG6-minube-vibes.lite.bunnydb.net/";
const BUNNY_DB_TOKEN =
  "eyJ0eXAiOiJKV1QiLCJhbGciOiJFZERTQSJ9.eyJwIjp7InJvIjpudWxsLCJydyI6eyJucyI6WyJtaW51YmUtdmliZXMiXSwidGFncyI6bnVsbH0sInJvYSI6bnVsbCwicndhIjpudWxsLCJkZGwiOm51bGx9LCJpYXQiOjE3NzE5MTc0MDl9.m-5EAVWjKG0kPM72fPFpeAg25seNnUY65gtSzTJlhnD697C1mmCRoXZWkmcreHoV9vTRw22supEVIp342D_2CA";

// ── Keys to SKIP (session data, internal state) ──
const SKIP_KEYS = new Set([
  "userId",         // session — stored locally, not a preference
  "sessionToken",   // session — stored locally
]);

// ── Keys that are LOCAL-ONLY state (machine-specific, NOT preferences) ──
// These are still migrated so the user can see them in the DB,
// but you could optionally skip them.
const LOCAL_STATE_KEYS = new Set([
  "isRunning",
  "lastKnownPerformance",
  "windowState",
  "secondaryWindowStates",
  "hasRunBefore",
  "lastShownReleaseNotesVersion",
  "lastOpenCodeUpdateCheck",
]);

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Settings → Key-Value Migration");
  console.log(`  Mode: ${DRY_RUN ? "🔍 DRY RUN (no writes)" : "🔥 LIVE"}`);
  console.log("═══════════════════════════════════════════════════════════\n");

  const client = createClient({
    url: BUNNY_DB_URL,
    authToken: BUNNY_DB_TOKEN,
  });

  // ── Step 0: Ensure unique index exists for upserts ──
  console.log("[0/4] Ensuring unique index on user_preferences(user_id, key, app_id)...");
  if (!DRY_RUN) {
    await client.execute(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_user_preferences_upsert
      ON user_preferences(user_id, key, app_id)
    `);
  }
  console.log("  ✅ Index ready\n");

  // ── Step 1: Fetch all user_settings blobs ──
  console.log("[1/4] Fetching all user_settings rows...");
  const settingsRows = await client.execute(
    "SELECT user_id, settings_json, updated_at FROM user_settings"
  );
  console.log(`  Found ${settingsRows.rows.length} user(s)\n`);

  if (settingsRows.rows.length === 0) {
    console.log("Nothing to migrate. Done.");
    client.close();
    return;
  }

  // ── Step 2: Fetch existing user emails for logging ──
  console.log("[2/4] Fetching user info...");
  const usersRows = await client.execute("SELECT id, email FROM users");
  const userMap = new Map<string, string>();
  for (const row of usersRows.rows) {
    userMap.set(row.id as string, row.email as string);
  }
  console.log(`  Found ${usersRows.rows.length} user(s) in users table\n`);

  // ── Step 3: Decompose each blob into KV rows ──
  console.log("[3/4] Decomposing settings blobs into key-value pairs...\n");

  let totalKeys = 0;
  let totalSkipped = 0;
  let totalUpserted = 0;
  let totalErrors = 0;

  for (const row of settingsRows.rows) {
    const userId = row.user_id as string;
    const email = userMap.get(userId) ?? "unknown";
    const settingsJson = row.settings_json as string;

    console.log(`  ┌─ User: ${email} (${userId})`);

    let settings: Record<string, unknown>;
    try {
      settings = JSON.parse(settingsJson);
    } catch (e) {
      console.log(`  │  ❌ Failed to parse settings JSON: ${e}`);
      console.log(`  └─ Skipped\n`);
      totalErrors++;
      continue;
    }

    const keys = Object.keys(settings);
    console.log(`  │  Total keys in blob: ${keys.length}`);

    const toMigrate: Array<{ key: string; value: string }> = [];
    const skippedKeys: string[] = [];

    for (const key of keys) {
      if (SKIP_KEYS.has(key)) {
        skippedKeys.push(key);
        continue;
      }

      const rawValue = settings[key];

      // Skip undefined/null values — no point storing them
      if (rawValue === undefined || rawValue === null) {
        skippedKeys.push(`${key}(null)`);
        continue;
      }

      // Serialize everything as JSON string
      const serialized = typeof rawValue === "string"
        ? rawValue
        : JSON.stringify(rawValue);

      toMigrate.push({ key, value: serialized });
    }

    totalKeys += keys.length;
    totalSkipped += skippedKeys.length;

    if (skippedKeys.length > 0) {
      console.log(`  │  Skipped: ${skippedKeys.join(", ")}`);
    }
    console.log(`  │  Keys to upsert: ${toMigrate.length}`);

    if (!DRY_RUN && toMigrate.length > 0) {
      // Batch upsert using a transaction
      const now = Math.floor(Date.now() / 1000); // unix timestamp (integer)

      const statements = toMigrate.map(({ key, value }) => ({
        sql: `INSERT INTO user_preferences (user_id, app_id, key, value, updated_at)
              VALUES (?, 0, ?, ?, ?)
              ON CONFLICT(user_id, key, app_id) DO UPDATE SET
                value = excluded.value,
                updated_at = excluded.updated_at`,
        args: [userId, key, value, now],
      }));

      // Execute in batches of 20 to avoid overwhelming the API
      const BATCH_SIZE = 20;
      for (let i = 0; i < statements.length; i += BATCH_SIZE) {
        const batch = statements.slice(i, i + BATCH_SIZE);
        try {
          await client.batch(batch, "write");
          totalUpserted += batch.length;
        } catch (e: any) {
          console.log(`  │  ❌ Batch error at offset ${i}: ${e.message}`);
          totalErrors += batch.length;
        }
      }
      console.log(`  │  ✅ Upserted ${toMigrate.length} keys`);
    } else if (DRY_RUN) {
      totalUpserted += toMigrate.length;
      // Print a sample of keys for review
      const sample = toMigrate.slice(0, 10);
      for (const { key, value } of sample) {
        const preview = value.length > 60 ? value.slice(0, 60) + "…" : value;
        const isLocal = LOCAL_STATE_KEYS.has(key) ? " [LOCAL]" : "";
        console.log(`  │    ${key}${isLocal} = ${preview}`);
      }
      if (toMigrate.length > 10) {
        console.log(`  │    ... and ${toMigrate.length - 10} more`);
      }
    }

    console.log(`  └─ Done\n`);
  }

  // ── Step 4: Summary ──
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Summary");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Users processed:  ${settingsRows.rows.length}`);
  console.log(`  Total keys found: ${totalKeys}`);
  console.log(`  Keys skipped:     ${totalSkipped}`);
  console.log(`  Keys upserted:    ${totalUpserted}`);
  console.log(`  Errors:           ${totalErrors}`);
  console.log(`  Mode:             ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
  console.log("═══════════════════════════════════════════════════════════");

  if (DRY_RUN) {
    console.log("\n💡 Run without --dry-run to execute the migration.");
  }

  client.close();
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
