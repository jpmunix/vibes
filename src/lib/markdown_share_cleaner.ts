/**
 * Cleans raw chat message content for external markdown sharing.
 *
 * Removes:
 * - All vibes-* tool call XML blocks (vibes-write, vibes-edit, vibes-read, etc.)
 * - AI thinking/reasoning blocks (<think>, <thought>, <vibes-think>)
 * - Token usage tags (<vibes-token-usage>)
 * - Any remaining HTML/XML tags
 * - Legacy dyad-* tags (via normalization)
 * - User attachment metadata (Attachments, Selected components, File to upload)
 * - Excessive whitespace / blank lines
 *
 * Keeps only the "prose" — the clean, human-readable parts of the conversation.
 */

/**
 * Strip tool blocks, thinking, and metadata from an assistant message.
 * Same logic used by the app's "zen/flow" render mode and copy-to-clipboard.
 */
export function cleanAssistantContent(raw: string): string {
  return raw
    // Normalize legacy dyad-* tags first
    .replace(/<dyad-/g, "<vibes-")
    .replace(/<\/dyad-/g, "</vibes-")
    // Remove all vibes-* tool blocks + think/thought blocks (self-closing or paired)
    .replace(/<(vibes-[\w-]+|think|thought)[^>]*>[\s\S]*?<\/\1>/g, "")
    // Remove any remaining HTML/XML tags (stray openers/closers)
    .replace(/<\/?[^>]+>/g, "")
    // Normalize line whitespace
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    // Collapse 3+ consecutive newlines into double
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Strip attachment / component / upload metadata from a user message.
 */
export function cleanUserContent(raw: string): string {
  let text = raw;
  const markers = [
    "\n\nAttachments:\n",
    "\n\nSelected components:\n",
    "\n\nFile to upload to codebase:",
  ];
  for (const marker of markers) {
    const idx = text.indexOf(marker);
    if (idx !== -1) text = text.substring(0, idx);
  }
  return text.trim();
}

/**
 * Build a clean markdown document from a chat's messages.
 * Filters out empty messages after cleaning.
 */
export function buildShareMarkdown(
  title: string,
  messages: Array<{
    role: string;
    content: string;
    createdAt?: string | Date | null;
  }>,
): string {
  const lines: string[] = [];
  lines.push(`# ${title}\n`);

  for (const msg of messages) {
    const isUser = msg.role === "user";
    const isAssistant = msg.role === "assistant";

    // Skip system messages entirely
    if (!isUser && !isAssistant) continue;

    const cleaned = isUser
      ? cleanUserContent(msg.content ?? "")
      : cleanAssistantContent(msg.content ?? "");

    // Skip messages that become empty after cleaning (e.g. tool-only responses)
    if (!cleaned) continue;

    const role = isUser ? "Usuario" : "Asistente";
    const ts = msg.createdAt
      ? new Date(msg.createdAt).toLocaleString("es-ES")
      : "";

    lines.push(`## ${role}${ts ? ` — ${ts}` : ""}\n`);
    lines.push(cleaned);
    lines.push("");
  }

  return lines.join("\n");
}
