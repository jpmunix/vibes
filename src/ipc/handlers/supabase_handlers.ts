import { getRemoteDb } from "../../db/remote";
import * as remoteSchema from "../../db/remote-schema";
import { eq, and } from "drizzle-orm";
import {
  getSupabaseClientForOrganization,
  listSupabaseBranches,
  getSupabaseProjectLogs,
  getOrganizationDetails,
  getOrganizationMembers,
  executeSupabaseSql,
  type SupabaseProjectLog,
} from "../../supabase_admin/supabase_management_client";
import { extractFunctionName } from "../../supabase_admin/supabase_utils";
import { createTypedHandler, HandlerContext } from "./base";
import { createTestOnlyLoggedHandler } from "./safe_handle";
import { safeSend } from "../utils/safe_sender";
import log from "electron-log";
import { readSettings, writeSettings } from "../../main/settings";
import { supabaseContracts } from "../types/supabase";

const logger = log.scope("supabase_handlers");
const testOnlyHandle = createTestOnlyLoggedHandler(logger);

export function registerSupabaseHandlers() {
  // List all connected Supabase organizations with details
  createTypedHandler(supabaseContracts.listOrganizations, async () => {
    const settings = readSettings();
    const organizations = settings.supabase?.organizations ?? {};

    const results: Array<{
      organizationSlug: string;
      name?: string;
      ownerEmail?: string;
    }> = [];

    for (const organizationSlug of Object.keys(organizations)) {
      try {
        // Fetch organization details and members in parallel
        const [details, members] = await Promise.all([
          getOrganizationDetails(organizationSlug),
          getOrganizationMembers(organizationSlug),
        ]);

        // Find the owner from members
        const owner = members.find((m) => m.role === "Owner");

        results.push({
          organizationSlug,
          name: details.name,
          ownerEmail: owner?.email,
        });
      } catch (error) {
        // If we can't fetch details, still include the org with just the ID
        logger.error(
          `Failed to fetch details for organization ${organizationSlug}:`,
          error,
        );
        results.push({ organizationSlug });
      }
    }

    return results;
  });

  // Delete a Supabase organization connection
  createTypedHandler(
    supabaseContracts.deleteOrganization,
    async (_, params) => {
      const { organizationSlug } = params;
      const settings = readSettings();
      const organizations = { ...settings.supabase?.organizations };

      if (!organizations[organizationSlug]) {
        throw new Error(`Supabase organization ${organizationSlug} not found`);
      }

      delete organizations[organizationSlug];

      writeSettings({
        supabase: {
          ...settings.supabase,
          organizations,
        },
      });

      logger.info(`Deleted Supabase organization ${organizationSlug}`);
    },
  );

  // List all projects from all connected organizations
  createTypedHandler(supabaseContracts.listAllProjects, async () => {
    const settings = readSettings();
    const organizations = settings.supabase?.organizations ?? {};
    const allProjects: Array<{
      id: string;
      name: string;
      region: string;
      organizationSlug: string;
    }> = [];

    for (const organizationSlug of Object.keys(organizations)) {
      try {
        const client = await getSupabaseClientForOrganization(organizationSlug);
        const projects = await client.getProjects();

        if (projects) {
          for (const project of projects) {
            allProjects.push({
              id: project.id,
              name: project.name,
              region: project.region,
              organizationSlug:
                // The supabase management API typedef is out of date and there's
                // actually an organization_slug field.
                // Just in case it's not there, we fallback to organization_id
                // which in practice is the same value as the slug.
                (project as any).organization_slug || project.organization_id,
            });
          }
        }
      } catch (error) {
        logger.error(
          `Failed to fetch projects for organization ${organizationSlug}:`,
          error,
        );
        // Continue with other organizations even if one fails
      }
    }

    return allProjects;
  });

  // List branches for a Supabase project (database branches)
  createTypedHandler(supabaseContracts.listBranches, async (_, params) => {
    const { projectId, organizationSlug } = params;
    const branches = await listSupabaseBranches({
      supabaseProjectId: projectId,
      organizationSlug: organizationSlug ?? null,
    });
    return branches.map((branch) => ({
      id: branch.id,
      name: branch.name,
      isDefault: branch.is_default,
      projectRef: branch.project_ref,
      parentProjectRef: branch.parent_project_ref,
    }));
  });

  // Get edge function logs for a Supabase project
  createTypedHandler(supabaseContracts.getEdgeLogs, async (_, params) => {
    const { projectId, timestampStart, appId, organizationSlug } = params;
    const response = await getSupabaseProjectLogs(
      projectId,
      timestampStart,
      organizationSlug ?? undefined,
    );

    if (response.error) {
      const errorMsg =
        typeof response.error === "string"
          ? response.error
          : JSON.stringify(response.error);
      throw new Error(`Failed to fetch logs: ${errorMsg}`);
    }

    const rawLogs = response.result || [];

    // Transform to ConsoleEntry format
    return rawLogs.map((logEntry: SupabaseProjectLog) => {
      const metadata = logEntry.metadata?.[0] || {};
      const level = metadata.level || "info";
      const eventMessage = logEntry.event_message || "";
      const functionName = extractFunctionName(eventMessage);

      return {
        level: (level === "error"
          ? "error"
          : level === "warn"
            ? "warn"
            : "info") as "info" | "warn" | "error",
        type: "edge-function" as const,
        message: eventMessage,
        timestamp: logEntry.timestamp / 1000, // Convert from microseconds to milliseconds
        sourceName: functionName,
        appId,
      };
    });
  });

  // Set app project - links a Vibes app to a Supabase project
  createTypedHandler(supabaseContracts.setAppProject, async (_, params, context) => {
    const userId = context.userId;
    if (!userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    const { projectId, appId, parentProjectId, organizationSlug } = params;
    await db
      .update(remoteSchema.apps)
      .set({
        supabaseProjectId: projectId,
        supabaseParentProjectId: parentProjectId,
        supabaseOrganizationSlug: organizationSlug,
      })
      .where(and(eq(remoteSchema.apps.id, appId), eq(remoteSchema.apps.userId, userId)));

    logger.info(
      `Associated app ${appId} with Supabase project ${projectId} (organization: ${organizationSlug})${parentProjectId ? ` and parent project ${parentProjectId}` : ""}`,
    );
  });

  // Unset app project - removes the link between a Vibes app and a Supabase project
  createTypedHandler(supabaseContracts.unsetAppProject, async (_, params, context) => {
    const userId = context.userId;
    if (!userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    const { app } = params;
    await db
      .update(remoteSchema.apps)
      .set({
        supabaseProjectId: null,
        supabaseParentProjectId: null,
        supabaseOrganizationSlug: null,
      })
      .where(and(eq(remoteSchema.apps.id, app), eq(remoteSchema.apps.userId, userId)));
    logger.info(`Removed Supabase project association for app ${app}`);
  });

  // ─── Database Viewer Handlers ───

  // Helper to get app's Supabase connection info
  async function getAppSupabaseInfo(appId: number, userId: string) {
    const db = getRemoteDb();
    const app = await db.query.apps.findFirst({
      where: and(eq(remoteSchema.apps.id, appId), eq(remoteSchema.apps.userId, userId)),
    });
    if (!app) throw new Error("App not found");
    if (!app.supabaseProjectId)
      throw new Error("This app is not connected to Supabase");
    return {
      projectId: app.supabaseProjectId,
      organizationSlug: app.supabaseOrganizationSlug ?? null,
    };
  }

  // SQL escaping helpers
  function quoteIdent(name: string): string {
    return `"${name.replace(/"/g, '""')}"`;
  }

  function escapeValue(val: unknown): string {
    if (val === null || val === undefined) return "NULL";
    if (typeof val === "number") return String(val);
    if (typeof val === "boolean") return val ? "TRUE" : "FALSE";
    if (typeof val === "object") return `'${JSON.stringify(val).replace(/'/g, "''")}'::jsonb`;
    return `'${String(val).replace(/'/g, "''")}'`;
  }

  // List tables with schema
  createTypedHandler(supabaseContracts.listTables, async (_, { appId }, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const { projectId, organizationSlug } = await getAppSupabaseInfo(appId, context.userId);

    const query = `
      WITH table_counts AS (
        SELECT
          schemaname,
          relname as table_name,
          n_live_tup as row_count
        FROM pg_stat_user_tables
        WHERE schemaname = 'public'
      ),
      pk_columns AS (
        SELECT
          tc.table_name,
          kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'PRIMARY KEY'
          AND tc.table_schema = 'public'
      )
      SELECT
        c.table_name,
        COALESCE(tc.row_count, 0) as row_count,
        jsonb_agg(
          jsonb_build_object(
            'name', c.column_name,
            'type', c.data_type,
            'nullable', c.is_nullable = 'YES',
            'default_value', c.column_default,
            'is_primary_key', pk.column_name IS NOT NULL
          ) ORDER BY c.ordinal_position
        ) as columns
      FROM information_schema.columns c
      LEFT JOIN table_counts tc ON c.table_name = tc.table_name
      LEFT JOIN pk_columns pk ON c.table_name = pk.table_name AND c.column_name = pk.column_name
      WHERE c.table_schema = 'public'
      GROUP BY c.table_name, tc.row_count
      ORDER BY c.table_name;
    `;

    const resultStr = await executeSupabaseSql({
      supabaseProjectId: projectId,
      query,
      organizationSlug,
    });
    const rows = JSON.parse(resultStr);

    return {
      tables: (Array.isArray(rows) ? rows : []).map((row: any) => ({
        name: row.table_name,
        rowCount: Number(row.row_count) || 0,
        columns: (typeof row.columns === "string" ? JSON.parse(row.columns) : row.columns || []).map((col: any) => ({
          name: col.name,
          type: col.type,
          nullable: col.nullable,
          defaultValue: col.default_value ?? null,
          isPrimaryKey: col.is_primary_key ?? false,
        })),
      })),
    };
  });

  // Query table with pagination
  createTypedHandler(supabaseContracts.queryTable, async (_, params, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const { appId, table, page = 1, pageSize = 50, orderBy, orderDir = "asc", filters } = params;
    const { projectId, organizationSlug } = await getAppSupabaseInfo(appId, context.userId);

    let whereClause = "";
    if (filters && filters.length > 0) {
      const conditions = filters.map((f) => {
        const col = quoteIdent(f.column);
        if (f.operator === "IS NULL") return `${col} IS NULL`;
        if (f.operator === "IS NOT NULL") return `${col} IS NOT NULL`;
        return `${col} ${f.operator} ${escapeValue(f.value)}`;
      });
      whereClause = `WHERE ${conditions.join(" AND ")}`;
    }

    const orderClause = orderBy
      ? `ORDER BY ${quoteIdent(orderBy)} ${orderDir === "desc" ? "DESC" : "ASC"}`
      : "";
    const offset = (page - 1) * pageSize;

    // Count query
    const countQuery = `SELECT COUNT(*) as total FROM ${quoteIdent(table)} ${whereClause};`;
    const countResultStr = await executeSupabaseSql({
      supabaseProjectId: projectId,
      query: countQuery,
      organizationSlug,
    });
    const countResult = JSON.parse(countResultStr);
    const totalCount = Number(
      Array.isArray(countResult) && countResult[0]?.total
        ? countResult[0].total
        : 0,
    );

    // Data query
    const dataQuery = `SELECT * FROM ${quoteIdent(table)} ${whereClause} ${orderClause} LIMIT ${pageSize} OFFSET ${offset};`;
    const dataResultStr = await executeSupabaseSql({
      supabaseProjectId: projectId,
      query: dataQuery,
      organizationSlug,
    });
    const dataResult = JSON.parse(dataResultStr);
    const rows = Array.isArray(dataResult) ? dataResult : [];
    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

    return { rows, totalCount, columns };
  });

  // Execute raw SQL
  createTypedHandler(supabaseContracts.executeQuery, async (_, { appId, query }, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const { projectId, organizationSlug } = await getAppSupabaseInfo(appId, context.userId);

    try {
      const resultStr = await executeSupabaseSql({
        supabaseProjectId: projectId,
        query,
        organizationSlug,
      });
      const result = JSON.parse(resultStr);
      const rows = Array.isArray(result) ? result : [];
      const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
      return { rows, columns, rowCount: rows.length };
    } catch (err: any) {
      return { rows: [], columns: [], rowCount: 0, error: err.message };
    }
  });

  // Insert row
  createTypedHandler(supabaseContracts.insertRow, async (_, { appId, table, data }, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const { projectId, organizationSlug } = await getAppSupabaseInfo(appId, context.userId);

    const columns = Object.keys(data);
    const colList = columns.map(quoteIdent).join(", ");
    const valList = columns.map((c) => escapeValue(data[c])).join(", ");

    const query = `INSERT INTO ${quoteIdent(table)} (${colList}) VALUES (${valList}) RETURNING *;`;
    const resultStr = await executeSupabaseSql({
      supabaseProjectId: projectId,
      query,
      organizationSlug,
    });
    const result = JSON.parse(resultStr);
    const rows = Array.isArray(result) ? result : [];

    return { success: true, row: rows[0] };
  });

  // Update row
  createTypedHandler(supabaseContracts.updateRow, async (_, { appId, table, primaryKey, data }, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const { projectId, organizationSlug } = await getAppSupabaseInfo(appId, context.userId);

    const setClause = Object.entries(data)
      .map(([col, val]) => `${quoteIdent(col)} = ${escapeValue(val)}`)
      .join(", ");

    const whereClause = Object.entries(primaryKey)
      .map(([col, val]) => `${quoteIdent(col)} = ${escapeValue(val)}`)
      .join(" AND ");

    const query = `UPDATE ${quoteIdent(table)} SET ${setClause} WHERE ${whereClause};`;
    await executeSupabaseSql({
      supabaseProjectId: projectId,
      query,
      organizationSlug,
    });

    return { success: true };
  });

  // Delete rows
  createTypedHandler(supabaseContracts.deleteRows, async (_, { appId, table, primaryKeys }, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const { projectId, organizationSlug } = await getAppSupabaseInfo(appId, context.userId);

    let deletedCount = 0;
    for (const pk of primaryKeys) {
      const whereClause = Object.entries(pk)
        .map(([col, val]) => `${quoteIdent(col)} = ${escapeValue(val)}`)
        .join(" AND ");

      const query = `DELETE FROM ${quoteIdent(table)} WHERE ${whereClause};`;
      await executeSupabaseSql({
        supabaseProjectId: projectId,
        query,
        organizationSlug,
      });
      deletedCount++;
    }

    return { deletedCount };
  });

  testOnlyHandle(
    "supabase:fake-connect-and-set-project",
    async (
      event,
      { appId, fakeProjectId }: { appId: number; fakeProjectId: string },
    ) => {
      const fakeOrgId = "fake-org-id";

      // Directly store fake credentials in the organizations map
      // We don't call handleSupabaseOAuthReturn because it attempts a real API call
      // which fails with fake tokens, causing credentials to be stored in legacy format
      const settings = readSettings();
      const existingOrgs = settings.supabase?.organizations ?? {};
      writeSettings({
        supabase: {
          ...settings.supabase,
          organizations: {
            ...existingOrgs,
            [fakeOrgId]: {
              accessToken: {
                value: "fake-access-token",
              },
              refreshToken: {
                value: "fake-refresh-token",
              },
              expiresIn: 3600,
              tokenTimestamp: Math.floor(Date.now() / 1000),
            },
          },
        },
      });
      logger.info(
        `Stored fake Supabase credentials for organization ${fakeOrgId} for app ${appId} during testing.`,
      );

      // Set the supabase project for the currently selected app
      const userId = readSettings().userId;
      if (!userId) throw new Error("Unauthorized");
      const db = getRemoteDb();
      await db
        .update(remoteSchema.apps)
        .set({
          supabaseProjectId: fakeProjectId,
          supabaseOrganizationSlug: fakeOrgId,
        })
        .where(and(eq(remoteSchema.apps.id, appId), eq(remoteSchema.apps.userId, userId)));
      logger.info(
        `Set fake Supabase project ${fakeProjectId} for app ${appId} during testing.`,
      );

      // Simulate the deep link event
      safeSend(event.sender, "deep-link-received", {
        type: "supabase-oauth-return",
        url: "https://supabase-oauth.dyad.sh/api/connect-supabase/login",
      });
      logger.info(
        `Sent fake deep-link-received event for app ${appId} during testing.`,
      );
    },
  );
}
