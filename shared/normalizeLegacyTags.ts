/**
 * Normalize legacy dyad-* XML tags to vibes-* in a single pass.
 * Applied once before parsing so that all downstream code only
 * needs to handle vibes-* tags.
 *
 * This is a temporary backward-compat shim for old chat history;
 * it can be removed once all users have migrated.
 */
export function normalizeLegacyTags(content: string): string {
  if (!content || !content.includes("dyad-")) return content;
  return content
    .replace(/<dyad-/g, "<vibes-")
    .replace(/<\/dyad-/g, "</vibes-");
}
