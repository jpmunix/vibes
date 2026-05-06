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
 * Extract image URLs (CDN or data URIs) from aiMessagesJson.
 * Returns an array of URL strings suitable for markdown `![](url)` tags.
 */
export function extractImageUrls(aiMessagesJson: any): string[] {
  if (!aiMessagesJson) return [];

  let parsed = aiMessagesJson;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return [];
    }
  }

  const messages = Array.isArray(parsed) ? parsed : parsed?.messages;
  if (!messages || !Array.isArray(messages)) return [];

  const urls: string[] = [];
  for (const msg of messages) {
    if (msg.role !== "user") continue;
    if (!Array.isArray(msg.content)) continue;
    for (const part of msg.content) {
      if (part.type === "image" && part.image) {
        // Only include CDN URLs — skip base64 data (too large for markdown)
        if (part.image.startsWith("http://") || part.image.startsWith("https://")) {
          urls.push(part.image);
        }
      }
    }
  }
  return urls;
}

/**
 * Build a clean markdown document from a chat's messages.
 * Filters out empty messages after cleaning.
 * Embeds image attachments from aiMessagesJson as markdown image tags.
 */
export function buildShareMarkdown(
  title: string,
  messages: Array<{
    role: string;
    content: string;
    createdAt?: string | Date | null;
    aiMessagesJson?: any;
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

    // Extract image URLs for user messages
    const imageUrls = isUser ? extractImageUrls(msg.aiMessagesJson) : [];

    // Skip messages that become empty after cleaning (e.g. tool-only responses)
    if (!cleaned && imageUrls.length === 0) continue;

    const role = isUser ? "Usuario" : "Asistente";
    const ts = msg.createdAt
      ? new Date(msg.createdAt).toLocaleString("es-ES")
      : "";

    lines.push(`## ${role}${ts ? ` — ${ts}` : ""}\n`);
    if (cleaned) lines.push(cleaned);

    // Append image tags for user messages with CDN-backed attachments
    if (imageUrls.length > 0) {
      lines.push(""); // blank line before images
      for (let i = 0; i < imageUrls.length; i++) {
        lines.push(`![Captura ${i + 1}](${imageUrls[i]})`);
      }
    }

    lines.push("");
  }

  return lines.join("\n");
}

