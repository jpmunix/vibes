/**
 * Memory Guardian — Deterministic Pre-filters (T1)
 *
 * Fast, regex-based guards that decide whether a chat interaction
 * is worth processing through the LLM Synthesizer or Router.
 * Runs in <1ms — no API calls, no DB queries.
 */

import log from "electron-log";

const logger = log.scope("memory_guardian");

// =============================================================================
// Strip Thinking Blocks
// =============================================================================

/**
 * Remove LLM thinking/reasoning blocks before analysis.
 * Models like DeepSeek, Claude, etc. wrap internal reasoning in tags.
 */
const THINKING_PATTERNS = [
    /<think>[\s\S]*?<\/think>/gi,
    /<thinking>[\s\S]*?<\/thinking>/gi,
    /<antThinking>[\s\S]*?<\/antThinking>/gi,
    /<reflection>[\s\S]*?<\/reflection>/gi,
];

export function stripThinkingBlocks(text: string): string {
    let cleaned = text;
    for (const pattern of THINKING_PATTERNS) {
        cleaned = cleaned.replace(pattern, "");
    }
    return cleaned.trim();
}

// =============================================================================
// Trivial Ack Detection
// =============================================================================

const TRIVIAL_ACKS = new Set([
    "ok", "sí", "si", "vale", "gracias", "perfecto", "hecho",
    "listo", "dale", "genial", "bien", "entendido", "de acuerdo",
    "claro", "correcto", "exacto", "eso", "adelante", "venga",
    "va", "okey", "bueno", "fenomenal", "estupendo", "recibido",
    "enterado", "ya", "sip", "sep", "nop", "no",
    "thanks", "sure", "yes", "yep", "nope", "got it", "done",
    "ok!", "sí!", "perfecto!", "genial!", "listo!", "dale!",
    "gracias!", "claro!", "venga!", "hecho!",
]);

function isTrivialAck(text: string): boolean {
    const normalized = text.trim().toLowerCase().replace(/[.!?,;:]+$/, "");
    return TRIVIAL_ACKS.has(normalized);
}

// =============================================================================
// Technical Content Detection
// =============================================================================

const TECH_PATTERNS = {
    // Code blocks
    codeBlocks: /```/,

    // Programming syntax keywords
    syntax: /\b(class|function|const|let|var|import|export|async|await|interface|type|struct|enum|public|private|protected|namespace|trait|impl|fn|yield|return|throw|catch|try|promise|callback|middleware|hook|component|props|state|useState|useEffect|useCallback|useMemo|useRef)\b/i,

    // Database and storage
    database: /\b(select|insert|update|delete|table|index|query|join|where|mongodb|redis|prisma|mongoose|sequelize|typeorm|drizzle|supabase|firebase|postgresql|mysql|sqlite|transaction|rollback|commit|migration|schema|nosql|memcached|localstorage|indexeddb|dynamodb)\b/i,

    // Network, infrastructure, and auth
    network: /(\b(get|post|put|patch|delete)\b\s+\/|https?:\/\/|\b(http|https|fetch|axios|graphql|rest|webhook|websocket|socket\.io|docker|kubernetes|aws|lambda|nginx|apache|vercel|netlify|cloudflare|dns|ssl|cors|jwt|oauth|token|endpoint|payload|json|api|grpc|cdn)\b)/i,

    // Technology stack
    stack: /\b(react|vue|angular|svelte|next\.js|nuxt|node|deno|bun|typescript|javascript|php|python|go|rust|java|c#|c\+\+|tailwind|bootstrap|sass|less|vite|webpack|esbuild|jest|cypress|playwright|vitest|git|bash|linux|ubuntu|npm|yarn|pnpm|electron|flutter|swift|kotlin)\b/i,

    // Decision-making phrases (Spanish + English)
    decisions: /(hemos optado por|vamos a usar|vamos a cambiar|la mejor opción es|se va a implementar|nuestra convención|el estándar del proyecto|descartamos|migraremos a|la regla será|siempre usaremos|preferimos usar|la arquitectura elegida|el patrón será|we decided to|we'll use|the convention is|the standard is|we chose|we prefer)/i,
};

/**
 * Check if text contains technical content worth processing.
 * Returns true if ANY category matches.
 */
export function hasTechnicalContent(text: string): boolean {
    for (const pattern of Object.values(TECH_PATTERNS)) {
        if (pattern.test(text)) return true;
    }
    return false;
}

// =============================================================================
// Main Guard: Should Process Interaction?
// =============================================================================

/**
 * Determine if a chat interaction has enough substance to be worth
 * running through the LLM Synthesizer (write) or Router (read).
 *
 * Returns `false` (skip) if the interaction is trivial.
 */
export function shouldProcessInteraction(
    userPrompt: string,
    cleanAssistantResponse: string,
): boolean {
    const trimmedPrompt = userPrompt.trim();

    // 1. Exact trivial ack match — instant reject
    if (isTrivialAck(trimmedPrompt)) {
        logger.info("[Guardian] Skipped: trivial ack");
        return false;
    }

    // 2. Very short prompt without technical content
    if (trimmedPrompt.length < 10 && !hasTechnicalContent(trimmedPrompt)) {
        logger.info("[Guardian] Skipped: short prompt, no tech content");
        return false;
    }

    // 3. Response has no technical substance
    if (!hasTechnicalContent(cleanAssistantResponse)) {
        logger.info("[Guardian] Skipped: response has no technical content");
        return false;
    }

    return true;
}

/**
 * Lighter guard for the read pipeline (memory injection).
 * Only checks the user prompt — we don't have the response yet.
 */
export function shouldInjectMemories(userPrompt: string): boolean {
    const trimmed = userPrompt.trim();

    // Very short + no tech → skip injection
    if (trimmed.length < 15 && !hasTechnicalContent(trimmed)) {
        return false;
    }

    // Trivial ack → skip injection
    if (isTrivialAck(trimmed)) {
        return false;
    }

    return true;
}
