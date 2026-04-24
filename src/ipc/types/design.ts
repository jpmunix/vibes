import { z } from "zod";
import { defineContract, createClient } from "../contracts/core";

// =============================================================================
// Design Schemas
// =============================================================================

export const DesignItemSchema = z.object({
  id: z.string(),
  description: z.string(),
});

export type DesignItem = z.infer<typeof DesignItemSchema>;

// =============================================================================
// Design Contracts
// =============================================================================

export const designContracts = {
  listDesigns: defineContract({
    channel: "design:list",
    input: z.void(),
    output: z.array(DesignItemSchema),
  }),

  addDesign: defineContract({
    channel: "design:add",
    input: z.object({
      brand: z.string(),
      appPath: z.string(),
    }),
    output: z.object({
      content: z.string(),
    }),
  }),

  /** Write user-provided DESIGN.md content (uploaded or pasted) to docs/DESIGN.md */
  writeCustomDesign: defineContract({
    channel: "design:write-custom",
    input: z.object({
      content: z.string(),
      appPath: z.string(),
    }),
    output: z.object({
      written: z.boolean(),
    }),
  }),
} as const;

// =============================================================================
// Design Client
// =============================================================================

export const designClient = createClient(designContracts);
