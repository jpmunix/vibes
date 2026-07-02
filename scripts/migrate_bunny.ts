import { createClient } from "@libsql/client";

// --- OLD CREDENTIALS ---
const OLD_DB_URL = "libsql://01KJ783WM1SD8X465A3VPAGHG6-minube-vibes.lite.bunnydb.net/";
const OLD_DB_TOKEN = "eyJ0eXAiOiJKV1QiLCJhbGciOiJFZERTQSJ9.eyJwIjp7InJvIjpudWxsLCJydyI6eyJucyI6WyJtaW51YmUtdmliZXMiXSwidGFncyI6bnVsbH0sInJvYSI6bnVsbCwicndhIjpudWxsLCJkZGwiOm51bGx9LCJpYXQiOjE3NzE5MTc0MDl9.m-5EAVWjKG0kPM72fPFpeAg25seNnUY65gtSzTJlhnD697C1mmCRoXZWkmcreHoV9vTRw22supEVIp342D_2CA";
const OLD_CDN_BASE = "https://minube-vibes.b-cdn.net";

// --- NEW CREDENTIALS ---
const NEW_DB_URL = "libsql://01KWFQXHYHXBKNBY6HXGZ4CK6X-vibes.lite.bunnydb.net/";
const NEW_DB_TOKEN = "eyJ0eXAiOiJKV1QiLCJhbGciOiJFZERTQSJ9.eyJwIjp7InJvIjpudWxsLCJydyI6eyJucyI6WyJ2aWJlcyJdLCJ0YWdzIjpudWxsfSwicm9hIjpudWxsLCJyd2EiOm51bGwsImRkbCI6bnVsbH0sImlhdCI6MTc4MjkzOTgzMX0.GhgK8Ck_uRUx7cl6ekpynAtoXcF0yKeJl6LtVfGBaLGHqkabHTkHX6f2uDnSc5wE9Qsd7t9QT3PqrempxcQLCg";
const NEW_CDN_BASE = "https://vibes-cdn.b-cdn.net";

const TARGET_USER_ID = "295703a0-093e-4b1a-9d27-9b8c4e2a2b71";

async function migrateDatabase() {
  console.log(`==> Starting DB Migration ONLY for user: ${TARGET_USER_ID}`);
  const oldDb = createClient({ url: OLD_DB_URL, authToken: OLD_DB_TOKEN });
  const newDb = createClient({ url: NEW_DB_URL, authToken: NEW_DB_TOKEN });

  try {
    await newDb.execute("PRAGMA foreign_keys = OFF;");
  } catch (e) {
    console.log("Could not disable FKs (might be ok).");
  }

  // -1. Drop existing tables in new DB to ensure a clean state
  console.log("==> Dropping existing tables on the new DB to start clean...");
  const newTablesRes = await newDb.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'drizzle_%';");
  for (const row of newTablesRes.rows) {
    console.log(`Dropping table ${row.name}...`);
    try {
      await newDb.execute(`DROP TABLE "${row.name}";`);
    } catch (e: any) {
      console.error(`Error dropping ${row.name}:`, e.message);
    }
  }

  // 0. Copy Schema from Old DB to New DB
  console.log("==> Extracting schema from old DB...");
  const schemaRes = await oldDb.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'drizzle_%';");
  for (const row of schemaRes.rows) {
    const ddl = row.sql as string;
    if (ddl) {
      try {
        await newDb.execute(ddl);
      } catch (e: any) {
        console.error("Failed to create table:", e.message);
      }
    }
  }
  console.log("Schema migration complete.");

  // 1. Get all tables from old DB
  const tablesRes = await oldDb.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'drizzle_%';");
  const tableNames = tablesRes.rows.map(r => r.name as string);
  
  // Reorder so that 'labels' comes before 'chat_labels' to prevent FK errors
  tableNames.sort((a, b) => {
    if (a === 'labels' && b === 'chat_labels') return -1;
    if (a === 'chat_labels' && b === 'labels') return 1;
    return 0;
  });

  console.log(`Found ${tableNames.length} tables to migrate.`);

  for (const table of tableNames) {
    console.log(`\nMigrating table: ${table}...`);
    
    // Determine the WHERE clause based on table
    let whereClause = "";
    if (table === "users") {
      whereClause = `WHERE id = '${TARGET_USER_ID}'`;
    } else {
      whereClause = `WHERE user_id = '${TARGET_USER_ID}'`;
    }
    
    const BATCH_SIZE = 100;
    let offset = 0;
    let totalMigrated = 0;

    while (true) {
      // It's safe to query user_id on all other tables because they all have it.
      // If a table doesn't have it, this query would fail, but our inspection showed all do.
      let data;
      try {
        data = await oldDb.execute(`SELECT * FROM "${table}" ${whereClause} LIMIT ${BATCH_SIZE} OFFSET ${offset};`);
      } catch(err: any) {
        if (err.message.includes('no such column: user_id')) {
           // Fallback if there is a system table without user_id
           console.log(`  Table ${table} has no user_id column. Migrating all rows.`);
           data = await oldDb.execute(`SELECT * FROM "${table}" LIMIT ${BATCH_SIZE} OFFSET ${offset};`);
        } else {
           throw err;
        }
      }
      
      if (data.rows.length === 0) {
        break;
      }

      const columns = Object.keys(data.rows[0]);
      const batch = data.rows;
      
      const valuesPlaceholders = batch.map(() => `(${columns.map(() => "?").join(", ")})`).join(", ");
      const args = batch.flatMap(row => {
        return columns.map(col => {
          let val = row[col];
          // Replace CDN URLs
          if (typeof val === 'string' && val.includes(OLD_CDN_BASE)) {
            val = val.replace(new RegExp(OLD_CDN_BASE, 'g'), NEW_CDN_BASE);
          }
          return val;
        });
      });

      const sql = `INSERT OR REPLACE INTO "${table}" (${columns.map(c => `"${c}"`).join(", ")}) VALUES ${valuesPlaceholders}`;
      
      try {
        await newDb.execute({ sql, args });
        totalMigrated += batch.length;
        console.log(`  Inserted batch, total migrated: ${totalMigrated}`);
      } catch (err: any) {
        console.error(`  Error inserting batch into ${table}:`, err.message);
        console.log("  Attempting 1 by 1 fallback...");
        for (const row of batch) {
          const rowArgs = columns.map(col => {
            let val = row[col];
            if (typeof val === 'string' && val.includes(OLD_CDN_BASE)) {
              val = val.replace(new RegExp(OLD_CDN_BASE, 'g'), NEW_CDN_BASE);
            }
            return val;
          });
          const rowSql = `INSERT OR REPLACE INTO "${table}" (${columns.map(c => `"${c}"`).join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`;
          try {
            await newDb.execute({ sql: rowSql, args: rowArgs });
            totalMigrated++;
          } catch (e: any) {
             console.error(`    Row insert failed for ${table}:`, e.message);
          }
        }
      }
      
      offset += data.rows.length;
    }
    console.log(`Finished ${table}: ${totalMigrated} rows migrated.`);
  }

  oldDb.close();
  newDb.close();
  console.log("==> DB Migration Complete.");
}

async function run() {
  try {
    await migrateDatabase();
    console.log("\n==> Storage migration skipped as requested.");
  } catch (err) {
    console.error("Migration failed:", err);
  }
}

run();
