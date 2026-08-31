/**
 * Pure utility for humanizing model IDs and resolving display name collisions.
 * No electron/node dependencies — safe to import from both main and renderer.
 */

const UPPERCASE_ALWAYS = new Set(["gpt", "glm", "llm", "ai", "api", "rwkv"]);

/**
 * Title-case a word with acronym awareness.
 */
function titleCaseWord(word: string): string {
  const lower = word.toLowerCase();
  if (UPPERCASE_ALWAYS.has(lower)) return word.toUpperCase();
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/**
 * Core humanization: replace separators, merge version numbers, title-case.
 * @param name The string to humanize (already stripped of prefix or not).
 */
function humanizeCore(name: string): string {
  // Replace hyphens/underscores with spaces
  let result = name.replace(/[-_]/g, " ");

  // Merge adjacent single-digit numbers into version format: "4 5" → "4.5"
  result = result.replace(/(\d)\s+(\d)/g, "$1.$2");

  // Title-case each word with acronym awareness
  result = result
    .split(" ")
    .filter((w) => w.length > 0)
    .map(titleCaseWord)
    .join(" ");

  return result;
}

/**
 * Humanize a model ID into a readable display name (SHORT form).
 * Strips everything before the last "/" (provider prefix).
 *
 * Examples:
 *   "anthropic/claude-sonnet-4-5" → "Claude Sonnet 4.5"
 *   "gpt-4o" → "GPT 4o"
 *   "minube/alibaba/qwen/qwen3.8-max" → "Qwen3.8 Max"
 */
export function humanizeModelId(id: string): string {
  let name = id;

  // Strip provider prefix (everything before last "/")
  const slashIdx = name.lastIndexOf("/");
  if (slashIdx !== -1) {
    name = name.substring(slashIdx + 1);
  }

  return humanizeCore(name);
}

/**
 * Humanize a model ID preserving ALL namespace segments (LONG form).
 * Treats "/" as a word separator instead of stripping prefixes.
 *
 * Examples:
 *   "minube/alibaba/qwen/qwen3.8-max" → "Minube Alibaba Qwen Qwen3.8 Max"
 *   "anthropic/claude-sonnet-4-5" → "Anthropic Claude Sonnet 4.5"
 */
export function humanizeModelIdLong(id: string): string {
  // Replace slashes with spaces too, then humanize everything
  const name = id.replace(/\//g, " ");
  return humanizeCore(name);
}

/**
 * Resolve display names for a batch of model IDs.
 *
 * Strategy:
 * 1. Compute short displayName for all IDs (current behavior).
 * 2. Detect collisions (same displayName for different IDs).
 * 3. For colliding IDs only, recompute using the long form.
 * 4. If long form still collides (theoretically impossible for distinct IDs),
 *    append numeric suffixes.
 *
 * @param ids Array of model IDs from the same provider batch.
 * @returns Map of id → resolved displayName.
 */
export function resolveDisplayNames(ids: string[]): Map<string, string> {
  const result = new Map<string, string>();

  // Step 1: short names
  const shortNames = new Map<string, string>();
  for (const id of ids) {
    shortNames.set(id, humanizeModelId(id));
  }

  // Step 2: detect collisions — group by displayName
  const byDisplayName = new Map<string, string[]>();
  for (const [id, name] of shortNames) {
    const group = byDisplayName.get(name) ?? [];
    group.push(id);
    byDisplayName.set(name, group);
  }

  // Step 3: resolve
  for (const [displayName, group] of byDisplayName) {
    if (group.length === 1) {
      // No collision — keep short name
      result.set(group[0], displayName);
    } else {
      // Collision — try long form
      const longNames = new Map<string, string>();
      for (const id of group) {
        longNames.set(id, humanizeModelIdLong(id));
      }

      // Check if long form resolved the collision
      const longByDisplay = new Map<string, string[]>();
      for (const [id, longName] of longNames) {
        const g = longByDisplay.get(longName) ?? [];
        g.push(id);
        longByDisplay.set(longName, g);
      }

      for (const [longName, subGroup] of longByDisplay) {
        if (subGroup.length === 1) {
          result.set(subGroup[0], longName);
        } else {
          // Still colliding (e.g. byte-identical IDs) — append suffix
          subGroup.forEach((id, idx) => {
            result.set(id, idx === 0 ? longName : `${longName} (${idx + 1})`);
          });
        }
      }
    }
  }

  return result;
}
