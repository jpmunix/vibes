/**
 * Chat Draft Persistence
 *
 * Persists unsent message drafts per chatId in localStorage.
 * - Debounced writes (no write on every keystroke)
 * - One draft per chatId
 * - Cleared on send
 * - Survives app crashes, power outages, and chat switching
 */

const STORAGE_PREFIX = "vibes:draft:";

/** Save a draft for a specific chatId. */
export function saveDraft(chatId: number, text: string): void {
  try {
    const key = STORAGE_PREFIX + chatId;
    if (text.trim()) {
      localStorage.setItem(key, text);
    } else {
      localStorage.removeItem(key);
    }
  } catch {
    // localStorage full or unavailable — non-critical
  }
}

/** Load a draft for a specific chatId. Returns empty string if none. */
export function loadDraft(chatId: number): string {
  try {
    return localStorage.getItem(STORAGE_PREFIX + chatId) ?? "";
  } catch {
    return "";
  }
}

/** Clear the draft for a specific chatId (call after sending). */
export function clearDraft(chatId: number): void {
  try {
    localStorage.removeItem(STORAGE_PREFIX + chatId);
  } catch {
    // non-critical
  }
}
