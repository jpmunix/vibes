/**
 * #196: Attachment → media part conversion (carcasa → runtime frontier).
 *
 * The carcasa receives image attachments from the UI as data URLs and hands
 * them to the runtime as `ImageContentPart` values (part of the P1 boundary:
 * the runtime stays provider-agnostic and never does vision preprocessing).
 *
 * The persisted representation (aiMessagesJson) is heterogeneous by design:
 * the lightweight CDN URL when the upload succeeded, the inline dataURL/base64
 * as fallback. All persisted shapes are normalized here so the wire only ever
 * carries inline base64 (the universal representation across providers).
 */

import type { ImageContentPart } from "@vibes/shared";

/** Supported image MIME types (UI contract). */
export const SUPPORTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;

/** Marker that separates the MIME prefix from the payload in a data URL. */
const BASE64_MARKER = ";base64,";

/**
 * Strict base64 validation: canonical alphabet, correct padding, length % 4.
 * Rejects strings that merely look like base64 but would decode to garbage.
 */
const BASE64_RE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

/** Max inline size when re-downloading a persisted CDN image. */
const MAX_INLINE_BYTES = 20 * 1024 * 1024;
/** Timeout for the CDN re-download during hydration. */
const DOWNLOAD_TIMEOUT_MS = 10_000;

/**
 * Convert a single image attachment into an ImageContentPart with raw base64
 * (no `data:` prefix). Returns null for non-image attachments, unsupported
 * MIME types, and malformed base64 payloads.
 */
export function attachmentToImagePart(
  attachment: ChatAttachment,
): ImageContentPart | null {
  const mime = attachment.type?.toLowerCase();
  if (!mime || !(SUPPORTED_IMAGE_TYPES as readonly string[]).includes(mime)) {
    return null;
  }

  const raw = typeof attachment.data === "string" ? attachment.data : "";
  const markerIndex = raw.indexOf(BASE64_MARKER);
  const base64 =
    markerIndex !== -1
      ? raw.slice(markerIndex + BASE64_MARKER.length)
      : raw;
  if (base64.length === 0 || !BASE64_RE.test(base64)) return null;

  return {
    type: "image",
    mediaType: mime,
    data: base64,
  };
}

/**
 * Normalize a persisted image source (from aiMessagesJson) into an
 * ImageContentPart.
 *
 * The persisted representation is heterogeneous by design: the carcasa stores
 * the lightweight CDN URL when the upload succeeds and falls back to the
 * inline base64 when it does not (both keep the same `{ type: "image", image,
 * mediaType }` shape). Without this normalization a CDN URL would be treated
 * as base64 and the provider would reject the request with an invalid
 * `image_url` payload.
 */
export function persistedImageToPart(input: {
  raw?: unknown;
  mediaType?: unknown;
}): ImageContentPart | null {
  if (typeof input.raw !== "string" || input.raw.length === 0) return null;
  const raw = input.raw;
  const mediaType =
    typeof input.mediaType === "string" && input.mediaType.startsWith("image/")
      ? input.mediaType
      : "image/png";

  // Direct HTTP(S) reference → url part; the provider uses it verbatim.
  if (/^https?:\/\//i.test(raw)) {
    return { type: "image", mediaType, url: raw };
  }

  // data URL (`data:<mime>;base64,<payload>`) or bare base64 payload.
  const markerIndex = raw.indexOf(BASE64_MARKER);
  const base64 =
    markerIndex !== -1
      ? raw.slice(markerIndex + BASE64_MARKER.length)
      : raw;
  if (base64.length === 0 || !BASE64_RE.test(base64)) return null;

  return { type: "image", mediaType, data: base64 };
}

/**
 * Resolve a persisted image source into the part the model should receive.
 *
 * Inline base64 data URLs are the universal representation across providers
 * (cloud endpoints AND local ones, which never fetch external URLs), while a
 * bare `https://` reference only works when the provider accepts and can
 * reach the URL. The carcasa persists the lightweight CDN URL after a
 * successful upload, so hydration re-downloads it and re-inlines the bytes.
 * If the download fails (offline, CDN down), the part falls back to the URL
 * form so providers that do accept URLs keep working.
 */
export async function resolvePersistedImage(input: {
  raw?: unknown;
  mediaType?: unknown;
}): Promise<ImageContentPart | null> {
  const part = persistedImageToPart(input);
  if (!part || !part.url) return part;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
    const response = await fetch(part.url, { signal: controller.signal });
    clearTimeout(timer);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_INLINE_BYTES) {
      return part;
    }
    const contentType = (response.headers.get("content-type") ?? "").split(";")[0].trim();
    return {
      type: "image",
      mediaType: contentType.startsWith("image/") ? contentType : part.mediaType,
      data: bytes.toString("base64"),
    };
  } catch {
    // Offline/unreachable CDN: keep the URL part; providers that accept
    // direct references can still render it.
    return part;
  }
}

/**
 * Resolve a persisted image source into a complete data URL
 * (`data:<mime>;base64,<payload>`) for consumers that rebuild browser
 * `File`/`Blob` objects from the payload (undo/redo input restoration).
 * Returns null when the source cannot be resolved to inline bytes.
 */
export async function persistedImageToDataUrl(input: {
  raw?: unknown;
  mediaType?: unknown;
}): Promise<string | null> {
  const part = await resolvePersistedImage(input);
  if (!part?.data) return null;
  return `data:${part.mediaType};base64,${part.data}`;
}

/**
 * Convert a list of attachments into ImageContentPart[].
 * Non-image attachments are dropped (they travel elsewhere). An empty/undefined
 * input yields an empty array so callers can always spread safely.
 */
export function attachmentsToImageParts(
  attachments?: ChatAttachment[] | null,
): ImageContentPart[] {
  if (!attachments) return [];
  const parts: ImageContentPart[] = [];
  for (const attachment of attachments) {
    const part = attachmentToImagePart(attachment);
    if (part) parts.push(part);
  }
  return parts;
}
