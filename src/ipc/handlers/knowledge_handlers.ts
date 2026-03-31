import { getRemoteDb } from "../../db/remote";
import * as remoteSchema from "../../db/remote-schema";
import { eq, and, desc, lt, gt, sql } from "drizzle-orm";
import log from "electron-log";
import { createTypedHandler, HandlerContext } from "./base";
import { knowledgeContracts } from "../types/knowledge";

function mapKnowledgeEntry(entry: any) {
    return { ...entry, enabled: !!entry.enabled };
}

const logger = log.scope("knowledge_handlers");

// =============================================================================
// Constants
// =============================================================================

const MAX_KNOWLEDGE_ENTRIES = 50;
const CONFIDENCE_DECAY_INTERVAL_DAYS = 7;
const CONFIDENCE_DECAY_AMOUNT = 10;
const CONFIDENCE_FLOOR = 20;
const JACCARD_DUPLICATE_THRESHOLD = 0.55;
const PENDING_REVIEW_CONFIDENCE_THRESHOLD = 85;

const CATEGORY_LABELS: Record<string, string> = {
    convention: "📐 Convenciones",
    pattern: "🔁 Patrones",
    preference: "⚙️ Preferencias",
    rule: "🚫 Reglas",
    component: "🧩 Componentes",
    "stack-rules": "🏗️ Stack Tecnológico",
};

// =============================================================================
// Noise Filtering — Heuristic pre-save filters
// =============================================================================

const NOISE_PATTERNS: RegExp[] = [
    // File paths, imports, internal routes
    /(?:src|components|pages|shared|admin|public)\//i,
    /\.\.\//,
    /import\s.*\sfrom/i,
    /\/admin\//i,

    // CSS measurements and specific layout values
    /\d+px/,
    /max-w-/,
    /col-span-/,
    /grid-cols-/,
    /gap-\d/,
    /rounded-/,
    /shadow-/,
    /font-display/,

    // Specific layouts for a single screen
    /columna[s]?\s*(partida|dividida)/i,
    /disposición\s*(vertical|horizontal)/i,
    /en\s+\d+\s+columna/i,

    // Content, copy, SEO texts
    /texto.*debe.*(?:ser|mostrarse)/i,
    /cambiar.*(?:el |la |los |las )?texto/i,
    /mostrar.*en\s+español/i,
    /título.*debe.*(?:ser|ir)/i,

    // Temporary refactoring actions
    /^(?:eliminar|borrar|quitar|mover|renombrar)\s/i,
    /^(?:añadir|agregar)\s.*(?:a la tabla|al formulario|a la sección)/i,

    // Overly specific to one screen/page
    /en\s+(?:la sección|la modal|la pestaña|la card|la vista)\s/i,
    /en\s+\/\w+/i,

    // Database/table column specifics
    /^(?:la tabla|campo|columna)\s+['"`]\w+['"`]/i,
    /ALTER\s+TABLE/i,
    /ADD\s+COLUMN/i,

    // Toast/timeout/keyboard shortcuts
    /duración\s+de\s+(?:toast|notificaci)/i,
    /atajo\s+de\s+teclado/i,
    /(?:Ctrl|Cmd)\s*\+\s*\w/i,

    // Placeholder/preview size specifics
    /previsualización.*\d+px/i,
    /tamaño.*estático/i,
    /ancho.*(?:máximo|fijo)/i,
];

/**
 * Returns true if the content looks like noise (implementation detail, not a convention).
 */
function isNoiseEntry(content: string): boolean {
    return NOISE_PATTERNS.some(pattern => pattern.test(content));
}

// =============================================================================
// Semantic Deduplication (Jaccard similarity)
// =============================================================================

/**
 * Tokenize text for Jaccard comparison.
 * Removes short words, punctuation, normalizes to lowercase.
 */
function tokenize(text: string): Set<string> {
    return new Set(
        text
            .toLowerCase()
            .replace(/[^\w\sáéíóúñü]/g, "")
            .split(/\s+/)
            .filter((w) => w.length > 2),
    );
}

/**
 * Jaccard similarity coefficient between two strings.
 * Returns a value between 0 (no overlap) and 1 (identical token sets).
 */
function jaccardSimilarity(a: string, b: string): number {
    const tokensA = tokenize(a);
    const tokensB = tokenize(b);

    if (tokensA.size === 0 && tokensB.size === 0) return 1;
    if (tokensA.size === 0 || tokensB.size === 0) return 0;

    let intersection = 0;
    for (const token of tokensA) {
        if (tokensB.has(token)) intersection++;
    }

    const unionSize = tokensA.size + tokensB.size - intersection;
    return unionSize === 0 ? 0 : intersection / unionSize;
}

/**
 * Check if a new entry is semantically similar to any existing entry.
 * Returns the matching existing entry if found, or null.
 */
function findSemanticDuplicate(
    newContent: string,
    existingEntries: { id: number; content: string; category: string }[],
): { id: number; content: string; category: string } | null {
    for (const existing of existingEntries) {
        if (jaccardSimilarity(newContent, existing.content) >= JACCARD_DUPLICATE_THRESHOLD) {
            return existing;
        }
    }
    return null;
}

// =============================================================================
// Knowledge Prompt Builder (Optimized v2)
// =============================================================================

/**
 * Builds a compressed knowledge base prompt from active entries.
 * v3: Uses embeddings to filter entries by semantic relevance to the user prompt.
 * - Rules are ALWAYS included (non-negotiable directives)
 * - Non-rule entries are ranked by cosine similarity to the user prompt
 * - Only top N most relevant non-rule entries are included
 * - Falls back to v2 behavior (include all) if embeddings unavailable
 */
async function buildKnowledgePrompt(appId: number, userId: string, userPrompt?: string): Promise<string> {
    const db = getRemoteDb();
    const entries = await db.query.knowledgeEntries.findMany({
        where: and(
            eq(remoteSchema.knowledgeEntries.appId, appId),
            eq(remoteSchema.knowledgeEntries.enabled, 1),
            eq(remoteSchema.knowledgeEntries.userId, userId),
        ),
        orderBy: [desc(remoteSchema.knowledgeEntries.confidence)],
        limit: MAX_KNOWLEDGE_ENTRIES,
    });

    if (entries.length === 0) return "";

    // Always include ALL rules and stack-rules regardless of filtering
    const rules = entries.filter((e) => e.category === "rule" || e.category === "stack-rules");
    const nonRules = entries.filter((e) => e.category !== "rule" && e.category !== "stack-rules");

    let selectedNonRules = nonRules;
    const MAX_SEMANTIC_ENTRIES = 8;

    // If we have a prompt and embeddings are available, filter non-rules semantically
    if (userPrompt && nonRules.length > MAX_SEMANTIC_ENTRIES) {
        try {
            const { isEmbeddingsAvailable, generateEmbedding, generateEmbeddingsBatched, cosineSimilarity, getEmbeddingModel, getConfiguredDims } = await import("../utils/embeddings_service");
            const { getCachedEmbedding, setCachedEmbedding, computeContentHash } = await import("../utils/embeddings_cache");

            if (isEmbeddingsAvailable()) {
                const model = getEmbeddingModel();
                const dims = getConfiguredDims();

                // Generate prompt embedding
                const promptEmbedding = await generateEmbedding(userPrompt);

                // Get/generate embeddings for all non-rule entries (lazy backfill)
                const entryEmbeddings: (number[] | null)[] = new Array(nonRules.length).fill(null);
                const toGenerate: { index: number; content: string }[] = [];

                for (let i = 0; i < nonRules.length; i++) {
                    const entry = nonRules[i];
                    const contentHash = computeContentHash(entry.content);
                    const cached = await getCachedEmbedding(
                        "knowledge",
                        appId,
                        `knowledge-${entry.id}`,
                        contentHash,
                        model,
                        userId,
                    );

                    if (cached) {
                        entryEmbeddings[i] = cached;
                    } else {
                        toGenerate.push({ index: i, content: entry.content });
                    }
                }

                // Batch generate missing embeddings (lazy backfill of existing entries)
                if (toGenerate.length > 0) {
                    logger.log(
                        `[KNOWLEDGE v3] Backfilling ${toGenerate.length} knowledge entry embeddings`,
                    );
                    const newEmbeddings = await generateEmbeddingsBatched(
                        toGenerate.map((t) => t.content),
                        5,
                        50,
                    );

                    for (let i = 0; i < toGenerate.length; i++) {
                        const { index } = toGenerate[i];
                        const entry = nonRules[index];
                        const embedding = newEmbeddings[i];
                        entryEmbeddings[index] = embedding;

                        // Cache for future use
                        void setCachedEmbedding(
                            "knowledge",
                            appId,
                            `knowledge-${entry.id}`,
                            computeContentHash(entry.content),
                            embedding,
                            model,
                            dims,
                            userId,
                        );
                    }
                }

                // Rank non-rules by cosine similarity to prompt
                const scored = nonRules.map((entry, i) => {
                    const embedding = entryEmbeddings[i];
                    let similarity = 0;
                    if (embedding) {
                        similarity = cosineSimilarity(promptEmbedding, embedding);
                    }
                    return { entry, similarity };
                });

                scored.sort((a, b) => b.similarity - a.similarity);
                selectedNonRules = scored.slice(0, MAX_SEMANTIC_ENTRIES).map((s) => s.entry);

                logger.log(
                    `[KNOWLEDGE v3] Semantic filter: ${nonRules.length} → ${selectedNonRules.length} entries (rules: ${rules.length} always included)`,
                );
            }
        } catch (error) {
            logger.error("[KNOWLEDGE v3] Semantic filtering failed, using all entries:", error);
            // Fallback: use original behavior
            selectedNonRules = nonRules.slice(0, Math.max(30, MAX_KNOWLEDGE_ENTRIES - rules.length));
        }
    } else {
        // No prompt or few entries: include all (original behavior)
        selectedNonRules = nonRules.slice(0, Math.max(30, MAX_KNOWLEDGE_ENTRIES - rules.length));
    }

    const finalEntries = [...rules, ...selectedNonRules];

    // Group by category
    const grouped: Record<string, string[]> = {};
    for (const entry of finalEntries) {
        const cat = entry.category;
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(entry.content);
    }

    // Build ultra-dense prompt
    let prompt = "<knowledge_base>\n";
    prompt += "# Reglas del Proyecto\n";
    prompt += "DEBES respetar SIEMPRE estas directivas aprendidas:\n\n";

    for (const [category, items] of Object.entries(grouped)) {
        const label = CATEGORY_LABELS[category] || category;
        // Dense format: category line + pipe-separated items
        if (items.length <= 3) {
            prompt += `${label}\n`;
            for (const item of items) {
                prompt += `- ${item}\n`;
            }
        } else {
            // Ultra-dense: single line with pipe separator for many items
            prompt += `${label}\n`;
            prompt += items.map((item) => `- ${item}`).join("\n") + "\n";
        }
        prompt += "\n";
    }

    prompt += "</knowledge_base>";
    return prompt;
}

// =============================================================================
// AI-Powered Knowledge Extractor (v2 — with context awareness)
// =============================================================================

/**
 * Extracts potential knowledge entries from a chat interaction using AI.
 * v2: Includes existing knowledge context, explicit exclusion rules,
 * durability classification, and contradiction detection.
 */
async function extractKnowledgeWithAI(
    appId: number,
    userId: string,
    userPrompt: string,
    assistantResponse: string,
): Promise<
    Array<{
        category: "convention" | "pattern" | "preference" | "rule" | "component";
        content: string;
        confidence: number;
        durability: "permanent" | "project-phase" | "temporary";
        replaces?: string;
    }>
> {
    logger.info("[KNOWLEDGE v2] 🧠 Starting AI-powered knowledge extraction");

    try {
        const { readSettings } = await import("../../main/settings");
        const { getModelClient } = await import("../utils/get_model_client");
        const { streamText } = await import("ai");

        const settings = readSettings();

        const extractionModel = settings.selectedModel;
        const { modelClient } = await getModelClient(extractionModel, settings);

        const db = getRemoteDb();
        // Fetch existing knowledge to provide context
        const existingEntries = await db.query.knowledgeEntries.findMany({
            where: and(
                eq(remoteSchema.knowledgeEntries.appId, appId),
                eq(remoteSchema.knowledgeEntries.enabled, 1),
                eq(remoteSchema.knowledgeEntries.userId, userId),
            ),
            orderBy: [desc(remoteSchema.knowledgeEntries.confidence)],
            limit: 40,
        });

        const existingContext =
            existingEntries.length > 0
                ? existingEntries
                    .map((e) => `- [${e.category}] ${e.content}`)
                    .join("\n")
                : "(vacío — aún no se ha aprendido nada)";

        const extractionPrompt = `Analiza esta conversación y extrae SOLO conocimiento que sea una CONVENCIÓN ESTABLE del proyecto. Tu trabajo es muy selectivo: solo extraer reglas, patrones o preferencias que deban recordarse permanentemente.

**USUARIO:**
${userPrompt}

**ASISTENTE:**
${assistantResponse.substring(0, 2000)}${assistantResponse.length > 2000 ? "..." : ""}

---

**CONOCIMIENTO YA EXISTENTE EN EL PROYECTO:**
${existingContext}

---

**CATEGORÍAS:**
- **convention**: Estándares de código permanentes (ej: "camelCase para archivos TSX", "imports organizados por tipo")
- **pattern**: Patrones arquitectónicos recurrentes (ej: "usar React Query para todas las peticiones")
- **preference**: Preferencias estables del desarrollador (ej: "evitar Tailwind, usar CSS puro")
- **rule**: Prohibiciones absolutas (ej: "NUNCA usar any", "NUNCA usar alert() nativo")
- **component**: Componentes propios obligatorios (ej: "usar Dialog propio en vez de confirm()")

**QUÉ NO EXTRAER (NUNCA):**
- ❌ Rutas de archivos o imports específicos (ej: "importar desde ../../shared/")
- ❌ Medidas CSS o valores pixel concretos (ej: "botón de 56px", "max-w-sm")
- ❌ Layouts o disposiciones de columnas de una pantalla específica
- ❌ Nombres de campos de base de datos, tablas concretas o esquemas SQL
- ❌ Textos de contenido, copy, SEO o traducciones específicas
- ❌ Cambios temporales de refactoring (ej: "eliminar sección X", "renombrar Y a Z")
- ❌ Diseño visual para una pantalla particular (ej: "centrar verticalmente icono del calendario")
- ❌ Configuraciones de duración de toasts, atajos de teclado, tamaños de preview
- ❌ Cualquier cosa que sea un DETALLE DE IMPLEMENTACIÓN y no una CONVENCIÓN
- ❌ Instrucciones que solo aplican a una tarea puntual en curso
- ❌ Estructura de formularios/secciones de una página concreta del admin
- ❌ Algo que ya existe en el conocimiento actual (ni paráfrasis del mismo concepto)

**DURABILIDAD:**
Para cada entrada, clasifica su durabilidad:
- "permanent": Convención estable que no cambiará (ej: "usar TypeScript estricto")
- "project-phase": Aplica durante una fase del proyecto pero puede cambiar (ej: "usar Supabase v2 API")
- "temporary": Decisión puntual que probablemente cambiará (ESTAS NO SE DEBEN EXTRAER)

**CONTRADICCIONES:**
Si detectas que una nueva regla CONTRADICE algo del conocimiento existente, incluye el campo "replaces" con el texto exacto de la entrada existente que debería reemplazarse.

**FORMATO DE SALIDA (solo JSON, sin markdown):**
[
  {"category": "rule", "content": "Nunca usar any en TypeScript", "confidence": 95, "durability": "permanent"},
  {"category": "pattern", "content": "Usar React Query para todas las peticiones API", "confidence": 90, "durability": "permanent", "replaces": "Usar fetch directo para las peticiones"}
]

**IMPORTANTE:**
- MÁXIMO 2 entradas por conversación (sé muy selectivo)
- Solo extraer conocimiento EXPLÍCITO (no inventes preferencias implícitas)
- Mantén cada "content" claro, corto y accionable (máx 120 caracteres)
- Si el usuario solo hace una pregunta normal o pide cambios puntuales, devuelve []
- Si no hay nada que CLARAMENTE sea una convención estable, devuelve []
- Duda = no extraer. Menos es más.`;

        logger.info("[KNOWLEDGE v2] 📤 Sending request to AI...");
        const result = await streamText({
            model: modelClient.model,
            messages: [
                {
                    role: "user",
                    content: extractionPrompt,
                },
            ],
            maxOutputTokens: 400,
            temperature: 0.2, // Even lower temperature for v2
        });

        let fullResponse = "";
        for await (const chunk of result.textStream) {
            fullResponse += chunk;
        }

        logger.info("[KNOWLEDGE v2] 📥 AI response received");
        logger.debug("[KNOWLEDGE v2] Full response:", fullResponse);

        // Parse JSON response
        const jsonMatch = fullResponse.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
            logger.info("[KNOWLEDGE v2] ℹ️ No JSON found — nothing to extract");
            return [];
        }

        const parsed = JSON.parse(jsonMatch[0]);
        if (!Array.isArray(parsed)) {
            logger.warn("[KNOWLEDGE v2] ❌ Parsed result is not an array");
            return [];
        }

        // Validate, normalize, and filter
        const validCategories = ["convention", "pattern", "preference", "rule", "component", "stack-rules"];
        const validDurabilities = ["permanent", "project-phase", "temporary"];

        const validated = parsed
            .filter((item: any) => {
                return (
                    item &&
                    typeof item === "object" &&
                    validCategories.includes(item.category) &&
                    typeof item.content === "string" &&
                    item.content.length > 5 &&
                    item.content.length < 200 &&
                    typeof item.confidence === "number" &&
                    item.confidence >= 1 &&
                    item.confidence <= 100
                );
            })
            .map((item: any) => ({
                category: item.category as "convention" | "pattern" | "preference" | "rule" | "component",
                content: item.content.trim(),
                confidence: Math.round(item.confidence),
                durability: (validDurabilities.includes(item.durability) ? item.durability : "permanent") as
                    | "permanent"
                    | "project-phase"
                    | "temporary",
                replaces: typeof item.replaces === "string" ? item.replaces.trim() : undefined,
            }))
            // Filter out temporary durability entries
            .filter((item) => item.durability !== "temporary")
            // Filter out noise via heuristic patterns
            .filter((item) => {
                if (isNoiseEntry(item.content)) {
                    logger.info(`[KNOWLEDGE v2] 🗑️ Filtered noise: "${item.content}"`);
                    return false;
                }
                return true;
            })
            // Hard limit: max 2 entries per extraction
            .slice(0, 2);

        logger.info(`[KNOWLEDGE v2] ✅ Validated ${validated.length} knowledge entries`);
        if (validated.length > 0) {
            logger.info(
                "[KNOWLEDGE v2] 📝 Extracted entries:",
                JSON.stringify(validated, null, 2),
            );
        }
        return validated;
    } catch (error) {
        logger.error("[KNOWLEDGE v2] ❌ Error during extraction:", error);
        return [];
    }
}

// =============================================================================
// Confidence Decay — Reduce confidence of unconfirmed auto-extracted entries
// =============================================================================

/**
 * Decays confidence of auto-extracted entries that haven't been manually
 * confirmed within the decay interval. Called on app open or periodically.
 */
async function decayUnconfirmedKnowledge(appId: number, userId: string): Promise<number> {
    const cutoffMs = Date.now() - CONFIDENCE_DECAY_INTERVAL_DAYS * 24 * 60 * 60 * 1000;
    const cutoffTimestamp = Math.floor(cutoffMs / 1000);

    try {
        const db = getRemoteDb();
        // Find entries eligible for decay
        const eligibleEntries = await db.query.knowledgeEntries.findMany({
            where: and(
                eq(remoteSchema.knowledgeEntries.appId, appId),
                eq(remoteSchema.knowledgeEntries.source, "auto-extracted"),
                eq(remoteSchema.knowledgeEntries.enabled, 1),
                eq(remoteSchema.knowledgeEntries.userId, userId),
            ),
        });

        let decayedCount = 0;
        for (const entry of eligibleEntries) {
            // Use lastConfirmedAt if available, otherwise updatedAt
            const lastTouched = (entry as any).lastConfirmedAt || entry.updatedAt;
            const lastTouchedTs =
                typeof lastTouched === "number"
                    ? lastTouched
                    : lastTouched instanceof Date
                        ? Math.floor(lastTouched.getTime() / 1000)
                        : 0;

            if (lastTouchedTs < cutoffTimestamp && entry.confidence > CONFIDENCE_FLOOR) {
                const newConfidence = Math.max(entry.confidence - CONFIDENCE_DECAY_AMOUNT, CONFIDENCE_FLOOR);
                await db
                    .update(remoteSchema.knowledgeEntries)
                    .set({ confidence: newConfidence })
                    .where(and(eq(remoteSchema.knowledgeEntries.id, entry.id), eq(remoteSchema.knowledgeEntries.userId, userId)));
                decayedCount++;
            }
        }

        if (decayedCount > 0) {
            logger.info(
                `[KNOWLEDGE DECAY] Decayed confidence for ${decayedCount} unconfirmed entries (app ${appId})`,
            );
        }
        return decayedCount;
    } catch (error) {
        logger.error("[KNOWLEDGE DECAY] Error:", error);
        return 0;
    }
}

// =============================================================================
// Entry Cap Enforcement
// =============================================================================

/**
 * Ensures the number of active entries doesn't exceed MAX_KNOWLEDGE_ENTRIES.
 * Disables the lowest-confidence entries if the limit is exceeded.
 */
async function enforceEntryCap(appId: number, userId: string): Promise<number> {
    try {
        const db = getRemoteDb();
        const activeEntries = await db.query.knowledgeEntries.findMany({
            where: and(
                eq(remoteSchema.knowledgeEntries.appId, appId),
                eq(remoteSchema.knowledgeEntries.enabled, 1),
                eq(remoteSchema.knowledgeEntries.userId, userId),
            ),
            orderBy: [desc(remoteSchema.knowledgeEntries.confidence)],
        });

        if (activeEntries.length <= MAX_KNOWLEDGE_ENTRIES) return 0;

        const toDisable = activeEntries.slice(MAX_KNOWLEDGE_ENTRIES);
        for (const entry of toDisable) {
            await db
                .update(remoteSchema.knowledgeEntries)
                .set({ enabled: 0 })
                .where(and(eq(remoteSchema.knowledgeEntries.id, entry.id), eq(remoteSchema.knowledgeEntries.userId, userId)));
        }

        logger.info(
            `[KNOWLEDGE CAP] Disabled ${toDisable.length} entries exceeding cap of ${MAX_KNOWLEDGE_ENTRIES} (app ${appId})`,
        );
        return toDisable.length;
    } catch (error) {
        logger.error("[KNOWLEDGE CAP] Error:", error);
        return 0;
    }
}

// =============================================================================
// AI-Powered Cleanup — Analyze all entries and suggest removals
// =============================================================================

/**
 * Uses AI to analyze all active entries and identify noise, redundancies,
 * and contradictions. Returns categorized suggestions.
 */
async function analyzeKnowledgeHealth(
    appId: number,
    userId: string,
): Promise<{
    noise: number[];
    redundant: Array<{ keep: number; remove: number[] }>;
    contradictions: Array<{ entryA: number; entryB: number }>;
}> {
    const defaultResult = { noise: [], redundant: [], contradictions: [] };

    try {
        const { readSettings } = await import("../../main/settings");
        const { getModelClient } = await import("../utils/get_model_client");
        const { streamText } = await import("ai");

        const settings = readSettings();
        const { modelClient } = await getModelClient(settings.selectedModel, settings);

        const db = getRemoteDb();
        const entries = await db.query.knowledgeEntries.findMany({
            where: and(
                eq(remoteSchema.knowledgeEntries.appId, appId),
                eq(remoteSchema.knowledgeEntries.enabled, 1),
                eq(remoteSchema.knowledgeEntries.userId, userId),
            ),
            orderBy: [desc(remoteSchema.knowledgeEntries.confidence)],
        });

        if (entries.length < 3) return defaultResult;

        const entriesList = entries
            .map((e) => `[ID:${e.id}] [${e.category}] ${e.content}`)
            .join("\n");

        const prompt = `Analiza estas entradas de base de conocimientos de un proyecto de software y devuelve un análisis de calidad.

**ENTRADAS ACTUALES:**
${entriesList}

Busca:
1. **Ruido**: Entradas que NO son convenciones estables (detalles de implementación, rutas de archivos, medidas CSS, textos de contenido, decisiones temporales de refactoring, layouts de una pantalla concreta)
2. **Redundancias**: Entradas que dicen lo mismo con diferentes palabras
3. **Contradicciones**: Entradas que se contradicen entre sí

**FORMATO DE SALIDA (solo JSON):**
{
  "noise": [1, 5, 12],
  "redundant": [{"keep": 3, "remove": [7, 15]}],
  "contradictions": [{"entryA": 2, "entryB": 8}]
}

Si todo parece limpio, devuelve: {"noise": [], "redundant": [], "contradictions": []}`;

        const result = await streamText({
            model: modelClient.model,
            messages: [{ role: "user", content: prompt }],
            maxOutputTokens: 600,
            temperature: 0.1,
        });

        let fullResponse = "";
        for await (const chunk of result.textStream) {
            fullResponse += chunk;
        }

        const jsonMatch = fullResponse.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return defaultResult;

        const parsed = JSON.parse(jsonMatch[0]);
        return {
            noise: Array.isArray(parsed.noise) ? parsed.noise.filter((n: any) => typeof n === "number") : [],
            redundant: Array.isArray(parsed.redundant) ? parsed.redundant : [],
            contradictions: Array.isArray(parsed.contradictions) ? parsed.contradictions : [],
        };
    } catch (error) {
        logger.error("[KNOWLEDGE HEALTH] Error:", error);
        return defaultResult;
    }
}

// =============================================================================
// Handler Registration
// =============================================================================

export function registerKnowledgeHandlers() {
    createTypedHandler(
        knowledgeContracts.getKnowledgeEntries,
        async (_, appId, context) => {
            if (!context.userId) throw new Error("Unauthorized");
            const db = getRemoteDb();
            const entries = await db.query.knowledgeEntries.findMany({
                where: and(eq(remoteSchema.knowledgeEntries.appId, appId), eq(remoteSchema.knowledgeEntries.userId, context.userId!)),
                orderBy: [desc(remoteSchema.knowledgeEntries.updatedAt)],
            });
            return entries.map(mapKnowledgeEntry) as any;
        },
    );

    createTypedHandler(
        knowledgeContracts.createKnowledgeEntry,
        async (_, params, context) => {
            if (!context.userId) throw new Error("Unauthorized");
            const db = getRemoteDb();
            const [entry] = await db
                .insert(remoteSchema.knowledgeEntries)
                .values({
                    userId: context.userId!,
                    appId: params.appId,
                    category: params.category,
                    content: params.content,
                    source: params.source || "manual",
                    confidence: params.confidence ?? 100,
                    enabled: 1,
                    createdAt: new Date(),
                    updatedAt: new Date()
                })
                .returning();
            logger.info(`Created knowledge entry: ${entry.id} for app ${params.appId}`);
            return entry.id;
        },
    );

    createTypedHandler(
        knowledgeContracts.updateKnowledgeEntry,
        async (_, params, context) => {
            if (!context.userId) throw new Error("Unauthorized");
            const db = getRemoteDb();
            const updateData: Record<string, any> = {};
            if (params.category !== undefined) updateData.category = params.category;
            if (params.content !== undefined) updateData.content = params.content;
            if (params.confidence !== undefined)
                updateData.confidence = params.confidence;
            if (params.enabled !== undefined) updateData.enabled = params.enabled;

            if (Object.keys(updateData).length > 0) {
                // When user manually edits, update lastConfirmedAt
                updateData.lastConfirmedAt = sql`(unixepoch())`;
                await db
                    .update(remoteSchema.knowledgeEntries)
                    .set(updateData)
                    .where(and(eq(remoteSchema.knowledgeEntries.id, params.id), eq(remoteSchema.knowledgeEntries.userId, context.userId!)));
                logger.info(`Updated knowledge entry: ${params.id}`);
            }
        },
    );

    createTypedHandler(
        knowledgeContracts.deleteKnowledgeEntry,
        async (_, entryId, context) => {
            if (!context.userId) throw new Error("Unauthorized");
            const db = getRemoteDb();
            await db.delete(remoteSchema.knowledgeEntries).where(and(eq(remoteSchema.knowledgeEntries.id, entryId), eq(remoteSchema.knowledgeEntries.userId, context.userId!)));
            logger.info(`Deleted knowledge entry: ${entryId}`);
        },
    );

    createTypedHandler(
        knowledgeContracts.getKnowledgePrompt,
        async (_, appId, context) => {
            if (!context.userId) throw new Error("Unauthorized");
            return buildKnowledgePrompt(appId, context.userId);
        },
    );

    createTypedHandler(
        knowledgeContracts.extractKnowledge,
        async (_, params, context) => {
            if (!context.userId) throw new Error("Unauthorized");
            const { appId, assistantResponse, userPrompt } = params;

            const candidates = await extractKnowledgeWithAI(
                appId,
                context.userId,
                userPrompt,
                assistantResponse,
            );

            if (candidates.length === 0) return [];

            const db = getRemoteDb();
            // Get existing entries for semantic dedup
            const existing = await db.query.knowledgeEntries.findMany({
                where: and(eq(remoteSchema.knowledgeEntries.appId, appId), eq(remoteSchema.knowledgeEntries.userId, context.userId!)),
            });

            const newEntries: typeof candidates = [];
            for (const candidate of candidates) {
                // Check semantic similarity against ALL existing entries
                const duplicate = findSemanticDuplicate(
                    candidate.content,
                    existing.map((e) => ({ id: e.id, content: e.content, category: e.category })),
                );

                if (duplicate) {
                    logger.info(
                        `[KNOWLEDGE v2] 🔄 Duplicate detected: "${candidate.content}" ≈ "${duplicate.content}"`,
                    );
                    continue;
                }

                // Handle contradictions (replaces field)
                if (candidate.replaces) {
                    const contradicted = existing.find(
                        (e) => jaccardSimilarity(e.content, candidate.replaces!) >= 0.5,
                    );
                    if (contradicted) {
                        logger.info(
                            `[KNOWLEDGE v2] ⚡ Contradiction: "${candidate.content}" replaces "${contradicted.content}" (ID: ${contradicted.id})`,
                        );
                        await db
                            .update(remoteSchema.knowledgeEntries)
                            .set({
                                enabled: 0,
                                supersededBy: null, // Will be set after insert
                            })
                            .where(and(eq(remoteSchema.knowledgeEntries.id, contradicted.id), eq(remoteSchema.knowledgeEntries.userId, context.userId!)));
                    }
                }

                newEntries.push(candidate);
            }

            if (newEntries.length === 0) return [];

            // Determine if entries go active or pending review
            const inserted = await db
                .insert(remoteSchema.knowledgeEntries)
                .values(
                    newEntries.map((entry) => ({
                        userId: context.userId!,
                        appId,
                        category: entry.category,
                        content: entry.content,
                        source: "auto-extracted" as const,
                        confidence: entry.confidence,
                        // project-phase entries start disabled for review
                        enabled: (entry.durability === "permanent" && entry.confidence >= PENDING_REVIEW_CONFIDENCE_THRESHOLD) ? 1 : 0,
                        durability: entry.durability,
                        createdAt: new Date(),
                        updatedAt: new Date(),
                    })),
                )
                .returning();

            // Enforce entry cap after insertion
            await enforceEntryCap(appId, context.userId);

            logger.info(
                `[KNOWLEDGE v2] ✅ Saved ${inserted.length} entries for app ${appId} (${inserted.filter((e) => e.enabled).length} active, ${inserted.filter((e) => !e.enabled).length} pending review)`,
            );

            return inserted.map(mapKnowledgeEntry) as any;
        },
    );

    // New handler: Decay unconfirmed knowledge
    createTypedHandler(
        knowledgeContracts.decayKnowledge,
        async (_, appId, context) => {
            if (!context.userId) throw new Error("Unauthorized");
            const decayedCount = await decayUnconfirmedKnowledge(appId, context.userId);
            return decayedCount;
        },
    );

    // New handler: Analyze knowledge health
    createTypedHandler(
        knowledgeContracts.analyzeKnowledgeHealth,
        async (_, appId, context) => {
            if (!context.userId) throw new Error("Unauthorized");
            return analyzeKnowledgeHealth(appId, context.userId);
        },
    );

    // New handler: Bulk cleanup (disable entries by IDs)
    createTypedHandler(
        knowledgeContracts.bulkDisableKnowledge,
        async (_, params, context) => {
            if (!context.userId) throw new Error("Unauthorized");
            const db = getRemoteDb();
            const { entryIds } = params;
            let count = 0;
            for (const id of entryIds) {
                await db
                    .update(remoteSchema.knowledgeEntries)
                    .set({ enabled: 0 })
                    .where(and(eq(remoteSchema.knowledgeEntries.id, id), eq(remoteSchema.knowledgeEntries.userId, context.userId!)));
                count++;
            }
            logger.info(`[KNOWLEDGE CLEANUP] Disabled ${count} entries`);
            return count;
        },
    );

    // New handler: Bulk approve pending entries
    createTypedHandler(
        knowledgeContracts.bulkApproveKnowledge,
        async (_, params, context) => {
            if (!context.userId) throw new Error("Unauthorized");
            const db = getRemoteDb();
            const { entryIds } = params;
            let count = 0;
            for (const id of entryIds) {
                await db
                    .update(remoteSchema.knowledgeEntries)
                    .set({
                        enabled: 1,
                        confidence: 100,
                        source: "manual" as const,
                        lastConfirmedAt: sql`(unixepoch())`,
                    })
                    .where(and(eq(remoteSchema.knowledgeEntries.id, id), eq(remoteSchema.knowledgeEntries.userId, context.userId!)));
                count++;
            }
            // Enforce cap after bulk approve
            const appIdResult = await db.query.knowledgeEntries.findFirst({
                where: and(eq(remoteSchema.knowledgeEntries.id, entryIds[0]), eq(remoteSchema.knowledgeEntries.userId, context.userId!)),
            });
            if (appIdResult) {
                await enforceEntryCap(appIdResult.appId, context.userId);
            }
            logger.info(`[KNOWLEDGE APPROVE] Approved ${count} entries`);
            return count;
        },
    );

    logger.debug("Registered knowledge base v2 IPC handlers");
}

// =============================================================================
// Auto-extraction (Fire-and-forget)
// =============================================================================

/**
 * Fire-and-forget auto-extraction of knowledge from a chat interaction.
 * v2: Includes appId for context-aware extraction.
 */
async function autoExtractKnowledge(
    appId: number,
    userId: string,
    userPrompt: string,
    assistantResponse: string,
): Promise<void> {
    logger.info(`[AUTO-EXTRACT v2] 🚀 Starting for appId=${appId}`);
    try {
        const candidates = await extractKnowledgeWithAI(
            appId,
            userId,
            userPrompt,
            assistantResponse,
        );

        if (candidates.length === 0) {
            logger.info("[AUTO-EXTRACT v2] ℹ️ No candidates to save");
            return;
        }

        const db = getRemoteDb();
        // Get existing entries for semantic dedup
        const existing = await db.query.knowledgeEntries.findMany({
            where: and(eq(remoteSchema.knowledgeEntries.appId, appId), eq(remoteSchema.knowledgeEntries.userId, userId)),
        });

        const newEntries: typeof candidates = [];
        for (const candidate of candidates) {
            const duplicate = findSemanticDuplicate(
                candidate.content,
                existing.map((e) => ({ id: e.id, content: e.content, category: e.category })),
            );

            if (duplicate) {
                logger.info(
                    `[AUTO-EXTRACT v2] 🔄 Skipping duplicate: "${candidate.content}" ≈ "${duplicate.content}"`,
                );
                continue;
            }

            // Handle contradictions
            if (candidate.replaces) {
                const contradicted = existing.find(
                    (e) => jaccardSimilarity(e.content, candidate.replaces!) >= 0.5,
                );
                if (contradicted) {
                    logger.info(
                        `[AUTO-EXTRACT v2] ⚡ Superseding: "${contradicted.content}" → "${candidate.content}"`,
                    );
                    await db
                        .update(remoteSchema.knowledgeEntries)
                        .set({ enabled: 0 })
                        .where(and(eq(remoteSchema.knowledgeEntries.id, contradicted.id), eq(remoteSchema.knowledgeEntries.userId, userId)));
                }
            }

            newEntries.push(candidate);
        }

        if (newEntries.length === 0) {
            logger.info("[AUTO-EXTRACT v2] ℹ️ All candidates filtered out");
            return;
        }

        await db.insert(remoteSchema.knowledgeEntries).values(
            newEntries.map((entry) => ({
                userId,
                appId,
                category: entry.category,
                content: entry.content,
                source: "auto-extracted" as const,
                confidence: entry.confidence,
                enabled: (entry.durability === "permanent" && entry.confidence >= PENDING_REVIEW_CONFIDENCE_THRESHOLD) ? 1 : 0,
                durability: entry.durability,
                createdAt: new Date(),
                updatedAt: new Date(),
            })),
        );

        // Enforce entry cap
        await enforceEntryCap(appId, userId);

        // Run decay while we're at it
        await decayUnconfirmedKnowledge(appId, userId);

        logger.info(
            `[AUTO-EXTRACT v2] ✅ Saved ${newEntries.length} new entries`,
        );
    } catch (error) {
        logger.error("[AUTO-EXTRACT v2] ❌ Failed (non-fatal):", error);
    }
}

// Export for use in chat_stream_handlers
export { buildKnowledgePrompt, autoExtractKnowledge };
