/**
 * Available embedding models for semantic search.
 * These models are available through OpenRouter's /api/v1/embeddings endpoint.
 */
export const EMBEDDING_MODELS = [
    {
        id: "openai/text-embedding-3-small",
        name: "Text Embedding 3 Small",
        provider: "OpenAI",
        dims: 1536,
    },
    {
        id: "openai/text-embedding-3-large",
        name: "Text Embedding 3 Large",
        provider: "OpenAI",
        dims: 3072,
    },
    {
        id: "google/gemini-embedding-001",
        name: "Gemini Embedding 001",
        provider: "Google",
        dims: 768,
    },
    {
        id: "qwen/qwen3-embedding-4b",
        name: "Qwen3 Embedding 4B",
        provider: "Qwen",
        dims: 2560,
    },
    {
        id: "qwen/qwen3-embedding-8b",
        name: "Qwen3 Embedding 8B",
        provider: "Qwen",
        dims: 4096,
    },
    {
        id: "mistralai/mistral-embed-2312",
        name: "Mistral Embed",
        provider: "Mistral",
        dims: 1024,
    },
] as const;

export type EmbeddingModelId = (typeof EMBEDDING_MODELS)[number]["id"];

export const DEFAULT_EMBEDDING_MODEL: EmbeddingModelId =
    "openai/text-embedding-3-small";

/**
 * Get the dimensions for a given embedding model ID.
 * Returns undefined if the model is not found.
 */
export function getEmbeddingModelDims(
    modelId: string,
): number | undefined {
    const model = EMBEDDING_MODELS.find((m) => m.id === modelId);
    return model?.dims;
}
