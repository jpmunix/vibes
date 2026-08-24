/**
 * Verbosidad dinámica del system prompt (card #182).
 *
 * El selector `textVerbosity` (Ajustes → Agente → Verbosidad) es LA FUENTE
 * DE VERDAD sobre cuánto habla el agente. El núcleo editable del agente
 * (runtime_agent_base) define CÓMO actúa (tool usage, objectivity, estilo),
 * pero nunca CUÁNTO habla: esa responsabilidad vive aquí, inyectada por la
 * carcasa al componer el system prompt.
 *
 * Diseño clave: cada nivel es AUTOCONTENIDO y coherente consigo mismo — lleva
 * su propio texto de longitud + sus propios ejemplos de calibración del MISMO
 * nivel. Así el modelo recibe una sola voz sobre cuánto hablar, y nunca
 * conviven ejemplos de concisión con una instrucción de detalle.
 *
 * El nivel `low` reproduce el comportamiento endurecido (Nivel 1, card #117):
 * mismo texto y mismos ejemplos que antes vivían fijos en runtime_agent_base.
 * Cero regresión para quien no toque el selector (default sigue siendo `low`).
 */

export type VerbosityLevel = "low" | "medium" | "high";

/**
 * Bloque de concisión global (cuánto habla en cualquier respuesta).
 * Va en TODOS los modos (build/plan/explore).
 */
const GENERAL_BLOCKS: Record<VerbosityLevel, string> = {
  low: [
    "Response length (low):",
    "- Keep responses short. One-word or one-line answers are best when they suffice.",
    "- Your final summary MUST be 1-3 sentences; no preamble, no postamble, no restating the question.",
    "- Do NOT add code explanation summaries unless requested. After working on a file, just stop.",
    "",
    "Calibration examples (this level):",
    "<example>",
    "user: what is 2+2?",
    "assistant: 4",
    "</example>",
    "",
    "<example>",
    "user: which file handles authentication?",
    "assistant: src/services/auth.ts:42",
    "</example>",
    "",
    "<example>",
    "user: add a /health endpoint that returns the database status",
    "assistant: [reads src/server/routes.ts, then writes the endpoint]",
    "Done — added GET /health at src/server/routes.ts:88.",
    "</example>",
  ].join("\n"),

  medium: [
    "Response length (medium):",
    "- Keep responses focused. Prefer short answers over long explanations, but provide brief context when it matters.",
    "- Your final summary should be 3-5 sentences covering what changed and why. No preamble, no restating the question.",
    "- Add a one-line explanation only when a decision or trade-off isn't obvious from the diff.",
    "",
    "Calibration examples (this level):",
    "<example>",
    "user: what is 2+2?",
    "assistant: 4",
    "</example>",
    "",
    "<example>",
    "user: which file handles authentication?",
    "assistant: src/services/auth.ts:42 — validates the session token and refreshes it on expiry.",
    "</example>",
    "",
    "<example>",
    "user: add a /health endpoint that returns the database status",
    "assistant: [reads src/server/routes.ts, then writes the endpoint]",
    "Done — added GET /health at src/server/routes.ts:88. It pings the DB and returns {ok, latencyMs}, so the load balancer can drop unhealthy nodes.",
    "</example>",
  ].join("\n"),

  high: [
    "Response length (high):",
    "- Be informative and structured. Explain reasoning and trade-offs when they help the user.",
    "- Your final summary should be 5-15 sentences, organized as a short bullet list covering: files touched, key decisions and trade-offs, and how the change was verified. No preamble.",
    "",
    "Calibration examples (this level):",
    "<example>",
    "user: what is 2+2?",
    "assistant: 4",
    "</example>",
    "",
    "<example>",
    "user: which file handles authentication?",
    "assistant: src/services/auth.ts:42 — `authenticate()` reads the session token from the Authorization header, validates it, and refreshes it on expiry before delegating to the route handler.",
    "</example>",
    "",
    "<example>",
    "user: add a /health endpoint that returns the database status",
    "assistant: [reads src/server/routes.ts, then writes the endpoint]",
    "",
    "Done. Changes:",
    "- Added GET /health in src/server/routes.ts:88.",
    "- It pings the DB and returns {ok, latencyMs}.",
    "- Decision: used the existing `db.ping()` helper rather than a raw query, so timeouts stay consistent with the rest of the app.",
    "- Verified: endpoint returns 200 and correct latency under load.",
    "</example>",
  ].join("\n"),
};

/**
 * Bloque de cierre de tarea (qué dice en el chat al terminar).
 * Va SOLO en el agente build (mismo criterio que el scope de fábrica de
 * ctx_build_walkthrough: el resumen completo va a .vibes/walkthrough-*.md).
 */
const WALKTHROUGH_BLOCKS: Record<VerbosityLevel, string> = {
  low: [
    "Task closing (low verbosity):",
    'Your final chat message must be ONLY a very brief confirmation inviting the user to open the summary (e.g. "✅ Task completed. You can view the summary using the 📄 button"). Do not repeat in the chat what is already in the summary.',
  ].join("\n"),

  medium: [
    "Task closing (medium verbosity):",
    'Close with 1-2 sentences: a confirmation + one line of context about what was done, and invite the user to open the full summary (e.g. "✅ JWT auth implemented — login, refresh and middleware. Full details in the 📄 panel").',
  ].join("\n"),

  high: [
    "Task closing (high verbosity):",
    "Close in the chat with a short bullet list of the most relevant points (key files, decisions, verification) and an invitation to open the full summary in the 📄 panel.",
  ].join("\n"),
};

/** Normaliza cualquier valor externo (undefined/null/inválido) a un nivel válido. */
export function normalizeVerbosityLevel(
  level?: VerbosityLevel | string | null,
): VerbosityLevel {
  if (level === "medium" || level === "high") return level;
  return "low";
}

/**
 * Compone el bloque de verbosidad completo para el system prompt.
 *
 * @param level       Nivel elegido por el usuario (o undefined → low).
 * @param opts        `includeWalkthrough` añade el bloque de cierre de tarea
 *                    (solo agente build).
 * @returns           String listo para concatenar al system prompt, o "" si
 *                    algo impide componer (nunca debería pasar con niveles válidos).
 */
export function buildVerbosityInstructions(
  level?: VerbosityLevel | string | null,
  opts?: { includeWalkthrough?: boolean },
): string {
  const normalized = normalizeVerbosityLevel(level);
  const sections = [
    "## Response length & closing",
    "",
    GENERAL_BLOCKS[normalized],
  ];

  if (opts?.includeWalkthrough) {
    sections.push("", WALKTHROUGH_BLOCKS[normalized]);
  }

  return sections.join("\n");
}

/** Expone las variantes para tests e inspección. */
export const VERBOSITY_BLOCKS = {
  general: GENERAL_BLOCKS,
  walkthrough: WALKTHROUGH_BLOCKS,
};
