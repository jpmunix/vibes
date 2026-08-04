/**
 * Legacy admin database connector (minube-vibes).
 *
 * ISOLATION CONTRACT: this module may only be imported by
 * `src/ipc/handlers/admin_handlers.ts`. The rest of the application must
 * always use `getRemoteDb()` from `./remote` — the legacy database must
 * never be reachable from any other code path.
 *
 * The legacy DB (minube-vibes) has an identical schema to the current DB
 * (vibes), so `remote-schema.ts` is reused as-is. No DDL is ever executed
 * against the legacy database: it is read/written exactly as it is.
 */
import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./remote-schema";
import log from "electron-log";
import { retryWithRateLimit } from "../ipc/utils/retryWithRateLimit";

const logger = log.scope("admin-legacy-db");

// Legacy Bunny Edge SQL credentials (minube-vibes — see scripts/migrate_bunny.ts)
const LEGACY_DB_URL =
  "libsql://01KJ783WM1SD8X465A3VPAGHG6-minube-vibes.lite.bunnydb.net/";
const LEGACY_DB_TOKEN =
  "eyJ0eXAiOiJKV1QiLCJhbGciOiJFZERTQSJ9.eyJwIjp7InJvIjpudWxsLCJydyI6eyJucyI6WyJtaW51YmUtdmliZXMiXSwidGFncyI6bnVsbH0sInJvYSI6bnVsbCwicndhIjpudWxsLCJkZGwiOm51bGx9LCJpYXQiOjE3NzE5MTc0MDl9.m-5EAVWjKG0kPM72fPFpeAg25seNnUY65gtSzTJlhnD697C1mmCRoXZWkmcreHoV9vTRw22supEVIp342D_2CA";

let _legacyClient: Client | null = null;
let _legacyDb: LibSQLDatabase<typeof schema> | null = null;

function getLegacyClient(): Client {
  if (!_legacyClient) {
    logger.info(
      "Creating libSQL client connection to legacy admin DB (minube-vibes)...",
    );
    _legacyClient = createClient({
      url: LEGACY_DB_URL,
      authToken: LEGACY_DB_TOKEN,
      fetch: async (input: any, init: any) => {
        return retryWithRateLimit(
          async () => {
            const url = typeof input === "string" ? input : input.url;
            const options = init || {};

            // Merge from Request if input is an object
            if (typeof input === "object" && input !== null) {
              if (!options.method && input.method)
                options.method = input.method;
              if (!options.headers && input.headers)
                options.headers = input.headers;
              if (!options.body && input.body) options.body = input.body;
            }

            const resp = await fetch(url, options);
            if (resp.body && typeof (resp.body as any).cancel !== "function") {
              const body = resp.body as any;
              body.cancel = async () => {
                if (typeof body.destroy === "function") body.destroy();
                else if (typeof body.close === "function") body.close();
              };
            }
            return resp;
          },
          "legacy-libSQL-fetch",
          { maxRetries: 3, baseDelay: 1_000, maxDelay: 10_000 },
        );
      },
    });
  }
  return _legacyClient;
}

/**
 * Get or create the Drizzle instance bound to the legacy admin database.
 * Reuses the current schema definition (both databases are identical) but
 * NEVER runs schema initialization or any DDL against the legacy database.
 */
export function getLegacyAdminDb(): LibSQLDatabase<typeof schema> {
  if (!_legacyDb) {
    _legacyDb = drizzle(getLegacyClient(), { schema });
    logger.info("Legacy admin Drizzle ORM instance initialized");
  }
  return _legacyDb;
}

/**
 * Test the legacy database connection (SELECT 1).
 */
export async function testLegacyAdminConnection(): Promise<boolean> {
  try {
    await getLegacyClient().execute("SELECT 1 as test");
    return true;
  } catch (error) {
    logger.error("Legacy admin DB connection test failed:", error);
    return false;
  }
}
