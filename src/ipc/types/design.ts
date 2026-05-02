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

  /** Generate DESIGN.md from a screenshot via AI vision analysis */
  generateFromScreenshot: defineContract({
    channel: "design:generate-from-screenshot",
    input: z.object({
      /** Base64 data URL of the screenshot (e.g. data:image/png;base64,...) */
      imageDataUrl: z.string(),
      /** OpenRouter model apiName to use (user's selected chat model) */
      model: z.string(),
    }),
    output: z.object({
      content: z.string(),
    }),
  }),

  /** Read docs/DESIGN.md from a project (returns null if missing) */
  readDesign: defineContract({
    channel: "design:read",
    input: z.object({
      appPath: z.string(),
    }),
    output: z.object({
      content: z.string().nullable(),
    }),
  }),

  /** Read AGENTS.md from the project root (returns null if missing) */
  readAgentsMd: defineContract({
    channel: "design:read-agents-md",
    input: z.object({
      appPath: z.string(),
    }),
    output: z.object({
      content: z.string().nullable(),
    }),
  }),
} as const;

// =============================================================================
// Design Client
// =============================================================================

export const designClient = createClient(designContracts);
