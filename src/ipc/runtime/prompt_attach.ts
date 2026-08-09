/**
 * Pure helper: composes the final system prompt from pipeline context
 * instructions + a custom agent system prompt.
 *
 * Extracted from opencode_adapter.ts (B2/B6) so the runtime bridge can reuse
 * it WITHOUT importing the 200KB adapter (which drags in the OpenCode SDK
 * and is not test-friendly). The adapter re-exports it to keep its public
 * surface unchanged.
 *
 * Pure function — no I/O, no electron, fully unit-testable.
 */
export function attachToSystemPrompt(
  contextInstructions?: string[],
  customSystemPrompt?: string,
): string | undefined {
  const parts: string[] = [];

  // 1. Inyectar primero la ristra de instrucciones estáticas del pipeline
  // (Idioma, esquemas DB, MCPs, artefactos, etc.)
  if (contextInstructions && contextInstructions.length > 0) {
    parts.push(contextInstructions.join("\n\n"));
  }

  // 2. Inyectar el system prompt de agente personalizado (si existe)
  if (customSystemPrompt && customSystemPrompt.trim().length > 0) {
    parts.push(customSystemPrompt);
  }

  if (parts.length === 0) {
    return undefined;
  }

  return parts.join("\n\n---\n\n");
}
