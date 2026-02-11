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
// Knowledge Extractor
// =============================================================================

/**
 * Extracts potential knowledge entries from assistant responses.
 * Uses heuristic pattern matching to find conventions and rules.
 *
 * This is a lightweight extraction that runs locally instead of needing
 * an LLM call. It catches common patterns from developer conversations.
 */
function extractKnowledgeFromResponse(
    assistantResponse: string,
    userPrompt: string,
): Array<{
    category: "convention" | "pattern" | "preference" | "rule" | "component";
    content: string;
    confidence: number;
}> {
    const extracted: Array<{
        category: "convention" | "pattern" | "preference" | "rule" | "component";
        content: string;
        confidence: number;
    }> = [];

    const lowerPrompt = userPrompt.toLowerCase();
    const lowerResponse = assistantResponse.toLowerCase();

    // Pattern 1: User explicitly says "remember", "always", "never", "use X instead of Y"
    const explicitRules = [
        /recuerda?\s+(?:que\s+)?(?:siempre|nunca)\s+(.+?)(?:\.|$)/gi,
        /(?:siempre|always)\s+(?:usa[rs]?|usar|use)\s+(.+?)(?:\s+(?:en\s+vez|instead)\s+(?:de|of)\s+(.+?))?(?:\.|$)/gi,
        /(?:nunca|never)\s+(?:usa[rs]?|usar|use)\s+(.+?)(?:\.|$)/gi,
        /(?:no\s+uses?|don'?t\s+use)\s+(.+?)(?:,?\s*(?:usa|use)\s+(.+?))?(?:\.|$)/gi,
        /(?:prefiero|prefer)\s+(.+?)(?:\s+(?:sobre|over|en\s+vez\s+de|instead\s+of)\s+(.+?))?(?:\.|$)/gi,
    ];

    for (const regex of explicitRules) {
        let match;
        while ((match = regex.exec(userPrompt)) !== null) {
            const content = match[0]
                .trim()
                .replace(/^recuerda\s+que?\s*/i, "")
                .replace(/\.$/, "");
            if (content.length > 10 && content.length < 200) {
                extracted.push({
                    category: content.toLowerCase().includes("nunca") ||
                        content.toLowerCase().includes("never") ||
                        content.toLowerCase().includes("no uses")
                        ? "rule"
                        : "preference",
                    content: content.charAt(0).toUpperCase() + content.slice(1),
                    confidence: 90,
                });
            }
        }
    }

    // Pattern 2: Detect component creation patterns from the response
    const componentPattern =
        /(?:cre[ée]|creat(?:ed|ing)|nuevo|new)\s+(?:componente?|component)\s+[`"']?(\w+)[`"']?/gi;
    let componentMatch;
    while ((componentMatch = componentPattern.exec(lowerResponse)) !== null) {
        const componentName = componentMatch[1];
        if (componentName && componentName.length > 2) {
            extracted.push({
                category: "component",
                content: `Componente personalizado: ${componentName}`,
                confidence: 60,
            });
        }
    }

    // Pattern 3: Detect library/package preferences
    const libraryPattern =
        /(?:usamos?|we\s+use|usando|using)\s+[`"']?(\w[\w.-]+)[`"']?\s+(?:para|for|como|as)\s+(.+?)(?:\.|$)/gi;
    let libMatch;
    while ((libMatch = libraryPattern.exec(lowerPrompt)) !== null) {
        const lib = libMatch[1];
        const purpose = libMatch[2]?.trim();
        if (lib && lib.length > 2 && purpose) {
            extracted.push({
                category: "convention",
                content: `Usar ${lib} para ${purpose}`,
                confidence: 75,
            });
        }
    }

    // Pattern 4: "Nuestro componente de X" / "Our X component"
    const ourComponentPattern =
        /(?:nuestro|our)\s+(?:componente?|component)\s+(?:de\s+)?[`"']?(\w+)[`"']?/gi;
    let ourMatch;
    while ((ourMatch = ourComponentPattern.exec(lowerPrompt)) !== null) {
        const comp = ourMatch[1];
        if (comp && comp.length > 2) {
            extracted.push({
                category: "component",
                content: `Usar componente propio: ${comp} (en vez de alternativas nativas)`,
                confidence: 85,
            });
        }
    }

    // Deduplicate by content similarity
    const unique = extracted.filter(
        (entry, index, self) =>
            index ===
            self.findIndex(
                (e) => e.content.toLowerCase() === entry.content.toLowerCase(),
            ),
    );

    return unique;
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

            const candidates = extractKnowledgeFromResponse(
                assistantResponse,
                userPrompt,
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
    try {
        const candidates = extractKnowledgeFromResponse(
            assistantResponse,
            userPrompt,
        );

        if (candidates.length === 0) return;

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

        if (newEntries.length === 0) return;

        await db.insert(knowledgeEntries).values(
            newEntries.map((entry) => ({
                appId,
                category: entry.category,
                content: entry.content,
                source: "auto-extracted" as const,
                confidence: entry.confidence,
            })),
        );

        logger.info(
            `Auto-extracted ${newEntries.length} knowledge entries for app ${appId}`,
        );
    } catch (error) {
        // Never crash the chat flow due to knowledge extraction
        logger.warn("Knowledge auto-extraction failed (non-fatal):", error);
    }
}

// Export for use in chat_stream_handlers
export { buildKnowledgePrompt, autoExtractKnowledge };
