/**
 * Robust JSON Extractor — shared utility for all memory pipeline stages
 *
 * Handles the common LLM output quirks:
 * 1. Thinking/reasoning blocks (<think>, <thinking>, <antThinking>)
 * 2. Markdown code fences (```json ... ```)
 * 3. Leading/trailing prose around JSON
 * 4. Direct JSON without wrapping
 */

/**
 * Extract and parse JSON from an LLM response string.
 * Returns the parsed object or null if extraction fails.
 */
export function extractJsonFromLLM(text: string): any | null {
    if (!text || !text.trim()) return null;

    let raw = text.trim();

    // 1. Strip thinking/reasoning blocks
    raw = raw
        .replace(/<think>[\s\S]*?<\/think>/gi, "")
        .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
        .replace(/<antThinking>[\s\S]*?<\/antThinking>/gi, "")
        .replace(/<reflection>[\s\S]*?<\/reflection>/gi, "")
        .trim();

    // 2. Strip markdown code fences (```json ... ``` or ``` ... ```)
    const fenceMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
    if (fenceMatch) raw = fenceMatch[1].trim();

    // 3. If it already starts with { or [, try direct parse
    if (raw.startsWith("{") || raw.startsWith("[")) {
        try {
            return JSON.parse(raw);
        } catch {
            // Fall through to extraction attempts
        }
    }

    // 4. Try to extract the outermost JSON object
    const objMatch = raw.match(/(\{[\s\S]*\})/);
    if (objMatch) {
        try {
            return JSON.parse(objMatch[1]);
        } catch {
            // Fall through
        }
    }

    // 5. Try to extract a JSON array
    const arrMatch = raw.match(/(\[[\s\S]*\])/);
    if (arrMatch) {
        try {
            return JSON.parse(arrMatch[1]);
        } catch {
            // Fall through
        }
    }

    // 6. Last resort — raw parse
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}
