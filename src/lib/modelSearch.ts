/**
 * Multi-word fuzzy model search.
 *
 * Splits the query into individual words (2+ chars each).
 * Every word must match somewhere in the searchable text
 * (display name, API name, or alias).
 *
 * Hyphens are normalized to spaces so "qwen flash" matches "Qwen3.5-Flash"
 * and "openrouter" matches "openrouter/some-model".
 *
 * Slashes are also normalized to spaces so searching "openrouter caca"
 * matches "openrouter/caca-vaca".
 */
export function matchesModelSearch(
    query: string,
    ...fields: (string | undefined)[]
): boolean {
    const words = query
        .trim()
        .toLowerCase()
        .replace(/[-/]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 2);

    if (words.length === 0) return true;

    // Combine all fields into a single searchable string
    const haystack = fields
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .replace(/[-/]/g, " ");

    return words.every((word) => haystack.includes(word));
}
