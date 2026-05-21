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
// Types
// =============================================================================

export type GuardianRejectReason =
    | "trivial_ack"
    | "short_no_tech"
    | "response_no_tech";

export type GuardianInjectionRejectReason =
    | "trivial_ack"
    | "short_no_tech";

export interface GuardianResult {
    allowed: boolean;
    reason: GuardianRejectReason | "approved";
}

export interface GuardianInjectionResult {
    allowed: boolean;
    reason: GuardianInjectionRejectReason | "approved";
}

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
// Strip Vibes Tool Tags (XML noise from agent messages)
// =============================================================================

/**
 * All custom XML tags used by the Vibes agent for tool calls, file writes,
 * command execution, etc. Their content is operational noise — not useful
 * for summarization or memory extraction.
 */
const VIBES_TOOL_TAG_NAMES = [
    "vibes-write", "vibes-rename", "vibes-delete", "vibes-add-dependency",
    "vibes-execute-sql", "vibes-read-logs", "vibes-add-integration",
    "vibes-output", "vibes-problem-report", "vibes-chat-summary",
    "set_chat_summary", "vibes-edit", "vibes-grep", "vibes-search-replace",
    "vibes-codebase-context", "vibes-web-crawl", "vibes-code-search-result",
    "vibes-code-search", "vibes-read", "vibes-command",
    "vibes-mcp-tool-call", "vibes-mcp-tool-result", "vibes-list-files",
    "vibes-database-schema", "vibes-supabase-table-schema",
    "vibes-supabase-project-info", "vibes-pocketbase-info",
    "vibes-pocketbase-storage-info", "vibes-bunny-db-info",
    "vibes-bunny-storage-info", "vibes-status", "vibes-think", "vibes-git",
    "vibes-ask-user", "vibes-patch", "vibes-run-command",
    "vibes-start-process", "vibes-stop-process", "vibes-list-processes",
    "vibes-wait-http", "vibes-typecheck-summary", "vibes-token-usage",
    "vibes-cancelled",
];

const VIBES_TOOL_TAG_GROUP = VIBES_TOOL_TAG_NAMES.join("|");

const VIBES_TOOL_TAG_REGEX = new RegExp(
    `<(?:${VIBES_TOOL_TAG_GROUP})(?:\\s[^>]*)?>[\\s\\S]*?<\\/(?:${VIBES_TOOL_TAG_GROUP})>`,
    "gi",
);

/**
 * Remove all Vibes custom XML tool tags and their content from a message.
 * Keeps only the human-readable prose (explanations, decisions, etc.).
 */
export function stripVibesToolTags(text: string): string {
    return text.replace(VIBES_TOOL_TAG_REGEX, "");
}

/**
 * Full noise cleanup: strip thinking blocks + Vibes tool tags + collapse whitespace.
 * Use this when preparing message content for summarization or memory extraction.
 */
export function stripAllNoise(text: string): string {
    let cleaned = stripThinkingBlocks(text);
    cleaned = stripVibesToolTags(cleaned);
    // Collapse excessive blank lines left behind
    cleaned = cleaned.replace(/\n{3,}/g, "\n\n").trim();
    return cleaned;
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
 * Returns a structured result with the rejection reason for observability.
 */
export function shouldProcessInteraction(
    userPrompt: string,
    cleanAssistantResponse: string,
): GuardianResult {
    const trimmedPrompt = userPrompt.trim();

    // 1. Exact trivial ack match — instant reject
    if (isTrivialAck(trimmedPrompt)) {
        logger.info("[Guardian] Skipped: trivial ack");
        return { allowed: false, reason: "trivial_ack" };
    }

    // 2. Very short prompt without technical content
    if (trimmedPrompt.length < 10 && !hasTechnicalContent(trimmedPrompt)) {
        logger.info("[Guardian] Skipped: short prompt, no tech content");
        return { allowed: false, reason: "short_no_tech" };
    }

    // 3. Response has no technical substance
    if (!hasTechnicalContent(cleanAssistantResponse)) {
        logger.info("[Guardian] Skipped: response has no technical content");
        return { allowed: false, reason: "response_no_tech" };
    }

    return { allowed: true, reason: "approved" };
}

/**
 * Lighter guard for the read pipeline (memory injection).
 * Only checks the user prompt — we don't have the response yet.
 */
export function shouldInjectMemories(userPrompt: string): GuardianInjectionResult {
    const trimmed = userPrompt.trim();

    // Very short + no tech → skip injection
    if (trimmed.length < 15 && !hasTechnicalContent(trimmed)) {
        return { allowed: false, reason: "short_no_tech" };
    }

    // Trivial ack → skip injection
    if (isTrivialAck(trimmed)) {
        return { allowed: false, reason: "trivial_ack" };
    }

    return { allowed: true, reason: "approved" };
}
