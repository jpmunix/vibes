/**
 * OpenResponses API Types
 *
 * Zod schemas and TypeScript types mapping the OpenAI Responses API specification.
 * Used for validating/transforming responses and building requests when
 * the model client supports the Responses API.
 *
 * @see https://platform.openai.com/docs/api-reference/responses
 */
import { z } from "zod";

// ============================================================================
// Enums
// ============================================================================

export const ReasoningEffortEnum = z.enum([
    "none",
    "low",
    "medium",
    "high",
    "xhigh",
]);
export type ReasoningEffort = z.infer<typeof ReasoningEffortEnum>;

export const TruncationEnum = z.enum(["auto", "disabled"]);
export type Truncation = z.infer<typeof TruncationEnum>;

export const ServiceTierEnum = z.enum(["auto", "default", "flex"]);
export type ServiceTier = z.infer<typeof ServiceTierEnum>;

export const ResponseStatusEnum = z.enum([
    "completed",
    "failed",
    "in_progress",
    "incomplete",
]);
export type ResponseStatus = z.infer<typeof ResponseStatusEnum>;

export const MessageRoleEnum = z.enum([
    "user",
    "assistant",
    "system",
    "developer",
]);
export type MessageRole = z.infer<typeof MessageRoleEnum>;

// ============================================================================
// Usage & Token Details
// ============================================================================

export const InputTokensDetailsSchema = z.object({
    cached_tokens: z.number().optional(),
});

export const OutputTokensDetailsSchema = z.object({
    reasoning_tokens: z.number().optional(),
});

export const UsageSchema = z.object({
    input_tokens: z.number(),
    output_tokens: z.number(),
    total_tokens: z.number(),
    input_tokens_details: InputTokensDetailsSchema.optional(),
    output_tokens_details: OutputTokensDetailsSchema.optional(),
});
export type Usage = z.infer<typeof UsageSchema>;

// ============================================================================
// Annotations
// ============================================================================

export const UrlCitationSchema = z.object({
    type: z.literal("url_citation"),
    end_index: z.number(),
    start_index: z.number(),
    title: z.string(),
    url: z.string(),
});
export type UrlCitation = z.infer<typeof UrlCitationSchema>;

export const AnnotationSchema = z.discriminatedUnion("type", [
    UrlCitationSchema,
]);
export type Annotation = z.infer<typeof AnnotationSchema>;

// ============================================================================
// Reasoning
// ============================================================================

export const ReasoningSummarySchema = z.object({
    text: z.string(),
    type: z.literal("summary_text"),
});

export const ReasoningSchema = z.object({
    effort: ReasoningEffortEnum.optional(),
    summary: z.enum(["auto", "concise", "detailed"]).nullable().optional(),
});
export type Reasoning = z.infer<typeof ReasoningSchema>;

// ============================================================================
// Output Items
// ============================================================================

export const OutputTextSchema = z.object({
    type: z.literal("output_text"),
    text: z.string(),
    annotations: z.array(AnnotationSchema).optional(),
});

export const ReasoningContentSchema = z.object({
    type: z.literal("reasoning"),
    id: z.string().optional(),
    summary: z.array(ReasoningSummarySchema).optional(),
});

export const OutputMessageSchema = z.object({
    type: z.literal("message"),
    id: z.string(),
    role: z.literal("assistant"),
    status: z.enum(["completed", "in_progress"]).optional(),
    content: z.array(
        z.discriminatedUnion("type", [OutputTextSchema, ReasoningContentSchema]),
    ),
});

// ============================================================================
// Function / Tool Calling
// ============================================================================

export const FunctionToolSchema = z.object({
    type: z.literal("function"),
    name: z.string(),
    description: z.string().optional(),
    parameters: z.record(z.string(), z.unknown()),
    strict: z.boolean().optional(),
});
export type FunctionTool = z.infer<typeof FunctionToolSchema>;

export const FunctionCallSchema = z.object({
    type: z.literal("function_call"),
    id: z.string(),
    call_id: z.string(),
    name: z.string(),
    arguments: z.string(),
    status: z.enum(["completed", "in_progress"]).optional(),
});
export type FunctionCall = z.infer<typeof FunctionCallSchema>;

export const FunctionCallOutputSchema = z.object({
    type: z.literal("function_call_output"),
    call_id: z.string(),
    output: z.string(),
});
export type FunctionCallOutput = z.infer<typeof FunctionCallOutputSchema>;

// ============================================================================
// Input Message Types (for building requests)
// ============================================================================

export const InputTextContentSchema = z.object({
    type: z.literal("input_text"),
    text: z.string(),
});

export const InputImageContentSchema = z.object({
    type: z.literal("input_image"),
    image_url: z.string().optional(),
    detail: z.enum(["auto", "low", "high"]).optional(),
});

export const InputMessageSchema = z.object({
    role: MessageRoleEnum,
    content: z.union([
        z.string(),
        z.array(
            z.discriminatedUnion("type", [
                InputTextContentSchema,
                InputImageContentSchema,
            ]),
        ),
    ]),
});
export type InputMessage = z.infer<typeof InputMessageSchema>;

// ============================================================================
// Text Configuration
// ============================================================================

export const TextConfigSchema = z.object({
    format: z
        .object({
            type: z.enum(["text", "json_schema", "json_object"]),
        })
        .optional(),
});

// ============================================================================
// Complete Response Object
// ============================================================================

export const OpenResponseSchema = z.object({
    id: z.string(),
    object: z.literal("response").optional(),
    created_at: z.number().optional(),
    status: ResponseStatusEnum.optional(),
    model: z.string().optional(),
    output: z
        .array(
            z.discriminatedUnion("type", [
                OutputMessageSchema,
                FunctionCallSchema,
                FunctionCallOutputSchema,
            ]),
        )
        .optional(),
    usage: UsageSchema.optional(),
    metadata: z.record(z.string(), z.string()).nullable().optional(),
    temperature: z.number().nullable().optional(),
    top_p: z.number().nullable().optional(),
    max_output_tokens: z.number().nullable().optional(),
    previous_response_id: z.string().nullable().optional(),
    reasoning: ReasoningSchema.nullable().optional(),
    truncation: TruncationEnum.nullable().optional(),
    service_tier: ServiceTierEnum.nullable().optional(),
});
export type OpenResponse = z.infer<typeof OpenResponseSchema>;

// ============================================================================
// Request Object (for building API calls)
// ============================================================================

export const OpenResponseRequestSchema = z.object({
    model: z.string(),
    input: z.union([
        z.string(),
        z.array(
            z.union([InputMessageSchema, FunctionCallOutputSchema]),
        ),
    ]),
    instructions: z.string().optional(),
    previous_response_id: z.string().nullable().optional(),
    tools: z.array(FunctionToolSchema).optional(),
    tool_choice: z.union([z.literal("auto"), z.literal("none"), z.literal("required")]).optional(),
    metadata: z.record(z.string(), z.string()).nullable().optional(),
    text: TextConfigSchema.optional(),
    temperature: z.number().nullable().optional(),
    top_p: z.number().nullable().optional(),
    max_output_tokens: z.number().nullable().optional(),
    stream: z.boolean().optional(),
    reasoning: ReasoningSchema.optional(),
    truncation: TruncationEnum.optional(),
    service_tier: ServiceTierEnum.optional(),
});
export type OpenResponseRequest = z.infer<typeof OpenResponseRequestSchema>;

// ============================================================================
// Provider Capability Detection
// ============================================================================

/**
 * Providers known to support the OpenResponses API.
 * Used by get_model_client to decide whether to use .responses() or regular chat().
 */
export const RESPONSES_API_PROVIDERS = new Set<string>([
    "openai",
]);

/**
 * Check if a given provider ID supports the Responses API.
 */
export function supportsResponsesApi(providerId: string): boolean {
    return RESPONSES_API_PROVIDERS.has(providerId);
}
