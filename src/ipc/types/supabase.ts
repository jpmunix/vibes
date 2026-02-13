import { z } from "zod";
import { defineContract, createClient } from "../contracts/core";

// =============================================================================
// Supabase Schemas
// =============================================================================

export const SupabaseOrganizationInfoSchema = z.object({
  organizationSlug: z.string(),
  name: z.string().optional(),
  ownerEmail: z.string().optional(),
});

export type SupabaseOrganizationInfo = z.infer<
  typeof SupabaseOrganizationInfoSchema
>;

export const SupabaseProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  region: z.string(),
  organizationSlug: z.string(),
});

export type SupabaseProject = z.infer<typeof SupabaseProjectSchema>;

export const SupabaseBranchSchema = z.object({
  id: z.string(),
  name: z.string(),
  isDefault: z.boolean(),
  projectRef: z.string(),
  parentProjectRef: z.string().nullable(),
});

export type SupabaseBranch = z.infer<typeof SupabaseBranchSchema>;

export const DeleteSupabaseOrganizationParamsSchema = z.object({
  organizationSlug: z.string(),
});

export type DeleteSupabaseOrganizationParams = z.infer<
  typeof DeleteSupabaseOrganizationParamsSchema
>;

export const ListSupabaseBranchesParamsSchema = z.object({
  projectId: z.string(),
  organizationSlug: z.string().nullable().optional(),
});

export const GetSupabaseEdgeLogsParamsSchema = z.object({
  projectId: z.string(),
  timestampStart: z.number().optional(),
  appId: z.number(),
  organizationSlug: z.string().nullable(),
});

export const ConsoleEntrySchema = z.object({
  level: z.enum(["info", "warn", "error"]),
  type: z.enum(["server", "client", "edge-function", "network-requests"]),
  message: z.string(),
  timestamp: z.number(),
  sourceName: z.string().optional(),
  appId: z.number(),
});

export type ConsoleEntry = z.infer<typeof ConsoleEntrySchema>;

export const SetSupabaseAppProjectParamsSchema = z.object({
  appId: z.number(),
  projectId: z.string().nullable().optional(),
  parentProjectId: z.string().nullable().optional(),
  organizationSlug: z.string().nullable().optional(),
});

export type SetSupabaseAppProjectParams = z.infer<
  typeof SetSupabaseAppProjectParamsSchema
>;

// =============================================================================
// Supabase Contracts
// =============================================================================

export const supabaseContracts = {
  listOrganizations: defineContract({
    channel: "supabase:list-organizations",
    input: z.void(),
    output: z.array(SupabaseOrganizationInfoSchema),
  }),

  deleteOrganization: defineContract({
    channel: "supabase:delete-organization",
    input: DeleteSupabaseOrganizationParamsSchema,
    output: z.void(),
  }),

  listAllProjects: defineContract({
    channel: "supabase:list-all-projects",
    input: z.void(),
    output: z.array(SupabaseProjectSchema),
  }),

  listBranches: defineContract({
    channel: "supabase:list-branches",
    input: ListSupabaseBranchesParamsSchema,
    output: z.array(SupabaseBranchSchema),
  }),

  getEdgeLogs: defineContract({
    channel: "supabase:get-edge-logs",
    input: GetSupabaseEdgeLogsParamsSchema,
    output: z.array(ConsoleEntrySchema),
  }),

  setAppProject: defineContract({
    channel: "supabase:set-app-project",
    input: SetSupabaseAppProjectParamsSchema,
    output: z.void(),
  }),

  unsetAppProject: defineContract({
    channel: "supabase:unset-app-project",
    input: z.object({ app: z.number() }),
    output: z.void(),
  }),

  // ─── Database Viewer contracts ───

  listTables: defineContract({
    channel: "supabase:db-list-tables",
    input: z.object({ appId: z.number() }),
    output: z.object({
      tables: z.array(
        z.object({
          name: z.string(),
          rowCount: z.number(),
          columns: z.array(
            z.object({
              name: z.string(),
              type: z.string(),
              nullable: z.boolean(),
              defaultValue: z.string().nullable(),
              isPrimaryKey: z.boolean(),
            }),
          ),
        }),
      ),
    }),
  }),

  queryTable: defineContract({
    channel: "supabase:db-query-table",
    input: z.object({
      appId: z.number(),
      table: z.string(),
      page: z.number().default(1),
      pageSize: z.number().default(50),
      orderBy: z.string().optional(),
      orderDir: z.enum(["asc", "desc"]).default("asc"),
      filters: z
        .array(
          z.object({
            column: z.string(),
            operator: z.enum(["=", "!=", ">", "<", ">=", "<=", "LIKE", "ILIKE", "IS NULL", "IS NOT NULL"]),
            value: z.string().optional(),
          }),
        )
        .optional(),
    }),
    output: z.object({
      rows: z.array(z.record(z.string(), z.unknown())),
      totalCount: z.number(),
      columns: z.array(z.string()),
    }),
  }),

  executeQuery: defineContract({
    channel: "supabase:db-execute-query",
    input: z.object({
      appId: z.number(),
      query: z.string(),
    }),
    output: z.object({
      rows: z.array(z.record(z.string(), z.unknown())),
      columns: z.array(z.string()),
      rowCount: z.number(),
      error: z.string().optional(),
    }),
  }),

  insertRow: defineContract({
    channel: "supabase:db-insert-row",
    input: z.object({
      appId: z.number(),
      table: z.string(),
      data: z.record(z.string(), z.unknown()),
    }),
    output: z.object({
      success: z.boolean(),
      row: z.record(z.string(), z.unknown()).optional(),
    }),
  }),

  updateRow: defineContract({
    channel: "supabase:db-update-row",
    input: z.object({
      appId: z.number(),
      table: z.string(),
      primaryKey: z.record(z.string(), z.unknown()),
      data: z.record(z.string(), z.unknown()),
    }),
    output: z.object({ success: z.boolean() }),
  }),

  deleteRows: defineContract({
    channel: "supabase:db-delete-rows",
    input: z.object({
      appId: z.number(),
      table: z.string(),
      primaryKeys: z.array(z.record(z.string(), z.unknown())),
    }),
    output: z.object({ deletedCount: z.number() }),
  }),

  // Test-only channel
  fakeConnectAndSetProject: defineContract({
    channel: "supabase:fake-connect-and-set-project",
    input: z.object({
      appId: z.number(),
      fakeProjectId: z.string(),
    }),
    output: z.void(),
  }),
} as const;

// =============================================================================
// Supabase Client
// =============================================================================

export const supabaseClient = createClient(supabaseContracts);
