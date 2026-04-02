/**
 * Knowledge Base — REMOVED
 *
 * The Knowledge Base system has been fully replaced by OpenCode's native
 * AGENTS.md project context. This stub exists only to satisfy remaining
 * imports that haven't been cleaned up yet.
 */

/** @deprecated KB removed — returns empty string */
export async function buildKnowledgePrompt(
  _appId: number,
  _userId: string,
  _userPrompt?: string,
): Promise<string> {
  return "";
}

/** @deprecated KB removed — no-op */
export async function autoExtractKnowledge(
  _appId: number,
  _userId: string,
  _userPrompt: string,
  _aiResponse: string,
): Promise<void> {
  // no-op
}

/** @deprecated KB removed — no-op */
export function registerKnowledgeHandlers(): void {
  // no-op — all IPC handlers removed
}
