import { db } from "../../db";
import { knowledgeEntries } from "../../db/schema";
import { eq, and, desc } from "drizzle-orm";
import log from "electron-log";
import { createTypedHandler } from "./base";
import { knowledgeContracts } from "../types/knowledge";

const logger = log.scope("knowledge_handlers");

// =============================================================================
// Category labels for prompt generation
// =============================================================================

const CATEGORY_LABELS: Record<string, string> = {
    convention: "📐 Convenciones",
    pattern: "🔁 Patrones",
    preference: "⚙️ Preferencias",
    rule: "🚫 Reglas",
    component: "🧩 Componentes",
};

// =============================================================================
// Knowledge Prompt Builder
// =============================================================================

/**
 * Builds a compressed knowledge base prompt from active entries.
 * Designed to be ultra-lightweight (<500 tokens typically).
 */
async function buildKnowledgePrompt(appId: number): Promise<string> {
    const entries = await db.query.knowledgeEntries.findMany({
        where: and(
            eq(knowledgeEntries.appId, appId),
            eq(knowledgeEntries.enabled, true),
        ),
        orderBy: [desc(knowledgeEntries.confidence)],
    });

    if (entries.length === 0) return "";

    // Group by category
    const grouped: Record<string, string[]> = {};
    for (const entry of entries) {
        const cat = entry.category;
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(entry.content);
    }

    // Build compressed prompt
    let prompt = "<knowledge_base>\n";
    prompt +=
        "# Base de Conocimientos del Proyecto\n";
    prompt +=
        "Reglas y convenciones aprendidas. DEBES respetar SIEMPRE estas directivas:\n\n";

    for (const [category, items] of Object.entries(grouped)) {
        const label = CATEGORY_LABELS[category] || category;
        prompt += `## ${label}\n`;
        for (const item of items) {
            prompt += `- ${item}\n`;
        }
        prompt += "\n";
    }

    prompt += "</knowledge_base>";
    return prompt;
}

// =============================================================================
// AI-Powered Knowledge Extractor
// =============================================================================

/**
 * Extracts potential knowledge entries from a chat interaction using AI.
 * Uses a fast, cheap model to synthesize user intent into structured knowledge.
 * Output is limited to 500 tokens to keep costs low.
 */
async function extractKnowledgeWithAI(
    userPrompt: string,
    assistantResponse: string,
): Promise<Array<{
    category: "convention" | "pattern" | "preference" | "rule" | "component";
    content: string;
    confidence: number;
}>> {
    logger.info("[KNOWLEDGE EXTRACTION] 🧠 Starting AI-powered knowledge extraction");
    logger.debug("[KNOWLEDGE EXTRACTION] User prompt:", userPrompt.substring(0, 200));
    logger.debug("[KNOWLEDGE EXTRACTION] Assistant response:", assistantResponse.substring(0, 200));

    try {
        const { readSettings } = await import("../../main/settings");
        const { getModelClient } = await import("../utils/get_model_client");
        const { streamText } = await import("ai");

        const settings = readSettings();
        logger.info("[KNOWLEDGE EXTRACTION] ⚙️ Settings loaded");

        // Use a fast, cheap model for extraction
        // Default to selectedModel if no specific knowledgeExtractionModel is set
        // This respects the user's OpenRouter multi-key setup
        const extractionModel = settings.selectedModel;

        const { modelClient } = await getModelClient(extractionModel, settings);
        logger.info(`[KNOWLEDGE EXTRACTION] 🤖 Model client obtained: ${extractionModel.provider}/${extractionModel.name}`);

        const extractionPrompt = `Analiza esta conversación entre un usuario y un asistente IA. Tu trabajo es extraer cualquier regla, convención, preferencia o conocimiento que el usuario quiera que la IA recuerde para futuras interacciones.

**USUARIO:**
${userPrompt}

**ASISTENTE:**
${assistantResponse.substring(0, 2000)}${assistantResponse.length > 2000 ? "..." : ""}

---

**CATEGORÍAS:**
- **convention** (Convención): Estándares de código del proyecto (ej: "usar camelCase", "imports al inicio")
- **pattern** (Patrón): Patrones de diseño recurrentes (ej: "estructura de carpetas específica", "siempre validar entradas")
- **preference** (Preferencia): Preferencias de estilo y herramientas (ej: "textos cortos", "evitar async/await cuando no sea necesario")
- **rule** (Regla): Cosas que NUNCA hacer (ej: "NUNCA borrar la base de datos", "no usar var")
- **component** (Componente): Componentes propios a usar siempre (ej: "usar nuestro Dialog en vez de confirm()")

**INSTRUCCIONES:**
1. Detecta si el usuario está expresando algo que quiere que se recuerde (ej: "siempre usa X", "quiero usar Y", "nunca hagas Z", "busca X porque siempre quiero usar Y")
2. Si NO hay nada que recordar, devuelve un array vacío: []
3. Si SÍ hay conocimiento, devuelve un array JSON con objetos que tengan:
   - "category": una de las 5 categorías
   - "content": frase corta y clara (máx 150 caracteres) en español, SIN comillas extras
   - "confidence": número del 1-100 (qué tan seguro estás de que esto es importante)

**FORMATO DE SALIDA (solo JSON, sin markdown):**
[
  {"category": "preference", "content": "Usar siempre textos cortos y concisos", "confidence": 95},
  {"category": "rule", "content": "Nunca eliminar datos sin confirmación explícita", "confidence": 100}
]

**IMPORTANTE:**
- Solo extraer conocimiento EXPLÍCITO (no inventes preferencias)
- Mantén cada "content" claro, corto y accionable
- Si el usuario solo hace una pregunta normal, devuelve []`;

        logger.info("[KNOWLEDGE EXTRACTION] 📤 Sending request to AI...");
        const result = await streamText({
            model: modelClient.model,
            messages: [
                {
                    role: "user",
                    content: extractionPrompt,
                },
            ],
            maxOutputTokens: 500,
            temperature: 0.3, // Low temperature for consistent extraction
        });

        let fullResponse = "";
        for await (const chunk of result.textStream) {
            fullResponse += chunk;
        }

        logger.info("[KNOWLEDGE EXTRACTION] 📥 AI response received:");
        logger.debug("[KNOWLEDGE EXTRACTION] Full response:", fullResponse);

        // Parse JSON response
        const jsonMatch = fullResponse.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
            logger.warn("[KNOWLEDGE EXTRACTION] ❌ No JSON array found in response");
            logger.debug("[KNOWLEDGE EXTRACTION] Response was:", fullResponse);
            return [];
        }

        logger.info("[KNOWLEDGE EXTRACTION] ✅ JSON array found, parsing...");
        const parsed = JSON.parse(jsonMatch[0]);
        logger.debug("[KNOWLEDGE EXTRACTION] Parsed JSON:", JSON.stringify(parsed, null, 2));

        if (!Array.isArray(parsed)) {
            logger.warn("[KNOWLEDGE EXTRACTION] ❌ Parsed result is not an array");
            return [];
        }

        // Validate and normalize
        const validated = parsed
            .filter((item: any) => {
                return (
                    item &&
                    typeof item === "object" &&
                    ["convention", "pattern", "preference", "rule", "component"].includes(item.category) &&
                    typeof item.content === "string" &&
                    item.content.length > 5 &&
                    item.content.length < 200 &&
                    typeof item.confidence === "number" &&
                    item.confidence >= 1 &&
                    item.confidence <= 100
                );
            })
            .map((item: any) => ({
                category: item.category,
                content: item.content.trim(),
                confidence: Math.round(item.confidence),
            }));

        logger.info(`[KNOWLEDGE EXTRACTION] ✅ Validated ${validated.length} knowledge entries`);
        if (validated.length > 0) {
            logger.info("[KNOWLEDGE EXTRACTION] 📝 Extracted entries:", JSON.stringify(validated, null, 2));
        } else {
            logger.info("[KNOWLEDGE EXTRACTION] ℹ️ No valid knowledge entries found");
        }
        return validated;
    } catch (error) {
        logger.error("[KNOWLEDGE EXTRACTION] ❌ Error during extraction:", error);
        return [];
    }
}

// =============================================================================
// Handler Registration
// =============================================================================

export function registerKnowledgeHandlers() {
    createTypedHandler(
        knowledgeContracts.getKnowledgeEntries,
        async (_, appId) => {
            const entries = await db.query.knowledgeEntries.findMany({
                where: eq(knowledgeEntries.appId, appId),
                orderBy: [desc(knowledgeEntries.updatedAt)],
            });
            return entries;
        },
    );

    createTypedHandler(
        knowledgeContracts.createKnowledgeEntry,
        async (_, params) => {
            const [entry] = await db
                .insert(knowledgeEntries)
                .values({
                    appId: params.appId,
                    category: params.category,
                    content: params.content,
                    source: params.source || "manual",
                    confidence: params.confidence ?? 100,
                })
                .returning();
            logger.info(`Created knowledge entry: ${entry.id} for app ${params.appId}`);
            return entry.id;
        },
    );

    createTypedHandler(
        knowledgeContracts.updateKnowledgeEntry,
        async (_, params) => {
            const updateData: Record<string, any> = {};
            if (params.category !== undefined) updateData.category = params.category;
            if (params.content !== undefined) updateData.content = params.content;
            if (params.confidence !== undefined)
                updateData.confidence = params.confidence;
            if (params.enabled !== undefined) updateData.enabled = params.enabled;

            if (Object.keys(updateData).length > 0) {
                await db
                    .update(knowledgeEntries)
                    .set(updateData)
                    .where(eq(knowledgeEntries.id, params.id));
                logger.info(`Updated knowledge entry: ${params.id}`);
            }
        },
    );

    createTypedHandler(
        knowledgeContracts.deleteKnowledgeEntry,
        async (_, entryId) => {
            await db.delete(knowledgeEntries).where(eq(knowledgeEntries.id, entryId));
            logger.info(`Deleted knowledge entry: ${entryId}`);
        },
    );

    createTypedHandler(
        knowledgeContracts.getKnowledgePrompt,
        async (_, appId) => {
            return buildKnowledgePrompt(appId);
        },
    );

    createTypedHandler(
        knowledgeContracts.extractKnowledge,
        async (_, params) => {
            const { appId, assistantResponse, userPrompt } = params;

            const candidates = await extractKnowledgeWithAI(
                userPrompt,
                assistantResponse,
            );

            if (candidates.length === 0) return [];

            // Check for duplicates against existing entries
            const existing = await db.query.knowledgeEntries.findMany({
                where: eq(knowledgeEntries.appId, appId),
            });

            const existingContents = new Set(
                existing.map((e) => e.content.toLowerCase()),
            );

            const newEntries = candidates.filter(
                (c) => !existingContents.has(c.content.toLowerCase()),
            );

            if (newEntries.length === 0) return [];

            // Insert new entries
            const inserted = await db
                .insert(knowledgeEntries)
                .values(
                    newEntries.map((entry) => ({
                        appId,
                        category: entry.category,
                        content: entry.content,
                        source: "auto-extracted" as const,
                        confidence: entry.confidence,
                    })),
                )
                .returning();

            logger.info(
                `Auto-extracted ${inserted.length} knowledge entries for app ${appId}`,
            );

            return inserted;
        },
    );

    logger.debug("Registered knowledge base IPC handlers");
}

/**
 * Fire-and-forget auto-extraction of knowledge from a chat interaction.
 * Safe to call without awaiting - errors are caught and logged silently.
 */
async function autoExtractKnowledge(
    appId: number,
    userPrompt: string,
    assistantResponse: string,
): Promise<void> {
    logger.info(`[AUTO-EXTRACT] 🚀 Starting auto-extraction for appId=${appId}`);
    try {
        const candidates = await extractKnowledgeWithAI(
            userPrompt,
            assistantResponse,
        );

        if (candidates.length === 0) {
            logger.info("[AUTO-EXTRACT] ℹ️ No candidates to save, exiting");
            return;
        }

        // Check for duplicates
        const existing = await db.query.knowledgeEntries.findMany({
            where: eq(knowledgeEntries.appId, appId),
        });

        const existingContents = new Set(
            existing.map((e) => e.content.toLowerCase()),
        );

        const newEntries = candidates.filter(
            (c) => !existingContents.has(c.content.toLowerCase()),
        );

        if (newEntries.length === 0) {
            logger.info("[AUTO-EXTRACT] ℹ️ All extracted knowledge entries already exist (duplicates filtered)");
            return;
        }

        logger.info(`[AUTO-EXTRACT] 💾 Saving ${newEntries.length} new entries to database...`);
        await db.insert(knowledgeEntries).values(
            newEntries.map((entry) => ({
                appId,
                category: entry.category,
                content: entry.content,
                source: "auto-extracted" as const,
                confidence: entry.confidence,
            })),
        );

        const totalEntries = await db.query.knowledgeEntries.findMany({
            where: eq(knowledgeEntries.appId, appId),
        });

        logger.info(
            `[AUTO-EXTRACT] ✅ Successfully saved ${newEntries.length} new knowledge entries. Total entries for app ${appId}: ${totalEntries.length}`,
        );
        logger.debug("[AUTO-EXTRACT] Saved entries:", JSON.stringify(newEntries, null, 2));
    } catch (error) {
        // Never crash the chat flow due to knowledge extraction
        logger.error("[AUTO-EXTRACT] ❌ Failed (non-fatal):", error);
    }
}

// Export for use in chat_stream_handlers
export { buildKnowledgePrompt, autoExtractKnowledge };
