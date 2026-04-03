import { z } from "zod";
import { defineContract, createClient } from "../contracts/core";

// =============================================================================
// Visual Editing Schemas
// =============================================================================

export const VisualEditingChangeSchema = z.object({
  componentId: z.string(),
  componentName: z.string(),
  relativePath: z.string(),
  lineNumber: z.number(),
  styles: z.object({
    margin: z
      .object({
        left: z.string().optional(),
        right: z.string().optional(),
        top: z.string().optional(),
        bottom: z.string().optional(),
      })
      .optional(),
    padding: z
      .object({
        left: z.string().optional(),
        right: z.string().optional(),
        top: z.string().optional(),
        bottom: z.string().optional(),
      })
      .optional(),
    dimensions: z
      .object({
        width: z.string().optional(),
        height: z.string().optional(),
      })
      .optional(),
    border: z
      .object({
        width: z.string().optional(),
        radius: z.string().optional(),
        color: z.string().optional(),
      })
      .optional(),
    backgroundColor: z.string().optional(),
    text: z
      .object({
        fontSize: z.string().optional(),
        fontWeight: z.string().optional(),
        color: z.string().optional(),
        fontFamily: z.string().optional(),
        textAlign: z.string().optional(),
      })
      .optional(),
    opacity: z.string().optional(),
    boxShadow: z.string().optional(),
    gap: z.string().optional(),
    display: z.string().optional(),
    flexDirection: z.string().optional(),
  }),
  textContent: z.string().optional(),
});

export type VisualEditingChange = z.infer<typeof VisualEditingChangeSchema>;

export const ApplyVisualEditingChangesParamsSchema = z.object({
  appId: z.number(),
  changes: z.array(VisualEditingChangeSchema),
});

export type ApplyVisualEditingChangesParams = z.infer<
  typeof ApplyVisualEditingChangesParamsSchema
>;

export const AnalyseComponentParamsSchema = z.object({
  appId: z.number(),
  componentId: z.string(),
});

export type AnalyseComponentParams = z.infer<
  typeof AnalyseComponentParamsSchema
>;

export const ReplaceIconParamsSchema = z.object({
  appId: z.number(),
  componentId: z.string(),
  newIconName: z.string(),
});

export type ReplaceIconParams = z.infer<typeof ReplaceIconParamsSchema>;

export const ElementTypeSchema = z.enum([
  "text",
  "container",
  "image",
  "button",
  "unknown",
]);

export type ElementType = z.infer<typeof ElementTypeSchema>;

export const AnalyseComponentResultSchema = z.object({
  isDynamic: z.boolean(),
  hasStaticText: z.boolean(),
  elementType: ElementTypeSchema,
  iconName: z.string().optional(),
  iconLine: z.number().optional(),
  textContent: z.string().optional(),
});

// =============================================================================
// Visual Editing Contracts
// =============================================================================

export const visualEditingContracts = {
  applyChanges: defineContract({
    channel: "apply-visual-editing-changes",
    input: ApplyVisualEditingChangesParamsSchema,
    output: z.void(),
  }),

  analyzeComponent: defineContract({
    channel: "analyze-component",
    input: AnalyseComponentParamsSchema,
    output: AnalyseComponentResultSchema,
  }),

  replaceIcon: defineContract({
    channel: "replace-component-icon",
    input: ReplaceIconParamsSchema,
    output: z.void(),
  }),

  makePrettier: defineContract({
    channel: "visual-editing:make-prettier",
    input: z.object({
      appId: z.number(),
      componentId: z.string(),
      relativePath: z.string(),
      lineNumber: z.number(),
      currentStyles: z.record(z.string(), z.any()).optional(),
    }),
    output: z.object({
      suggestions: z.array(VisualEditingChangeSchema),
    }),
  }),

  quickEdit: defineContract({
    channel: "visual-editing:quick-edit",
    input: z.object({
      appId: z.number(),
      componentId: z.string(),
      componentName: z.string(),
      relativePath: z.string(),
      lineNumber: z.number(),
      prompt: z.string(),
      currentStyles: z.record(z.string(), z.any()).optional(),
      currentTextContent: z.string().optional(),
    }),
    output: z.object({
      success: z.boolean(),
      summary: z.string().optional(),
      error: z.string().optional(),
    }),
  }),
} as const;

// =============================================================================
// Visual Editing Client
// =============================================================================

export const visualEditingClient = createClient(visualEditingContracts);
