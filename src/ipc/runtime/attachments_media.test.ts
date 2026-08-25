/**
 * #196: Unit tests for attachments_media.ts — the pure attachment → media
 * part converter used by the runtime bridge to hand images to vibes-core.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import type { ChatAttachment } from "@/ipc/types";
import { attachmentsToImageParts, attachmentToImagePart, persistedImageToPart, resolvePersistedImage, persistedImageToDataUrl } from "./attachments_media";

afterEach(() => {
  vi.unstubAllGlobals();
});

const pngDataUrl = "data:image/png;base64,QUJD";

function makeAttachment(overrides: Partial<ChatAttachment> = {}): ChatAttachment {
  return {
    name: "pic.png",
    type: "image/png",
    data: pngDataUrl,
    attachmentType: "chat-context",
    ...overrides,
  };
}

describe("attachmentToImagePart", () => {
  it("converts an image attachment into an ImageContentPart with raw base64", () => {
    expect(attachmentToImagePart(makeAttachment())).toEqual({
      type: "image",
      mediaType: "image/png",
      data: "QUJD",
    });
  });

  it("returns null for non-image attachments", () => {
    expect(attachmentToImagePart(makeAttachment({ type: "text/markdown" }))).toBeNull();
    expect(attachmentToImagePart(makeAttachment({ type: "application/json" }))).toBeNull();
  });

  it("rejects image MIME types outside the supported UI contract", () => {
    expect(attachmentToImagePart(makeAttachment({ type: "image/svg+xml" }))).toBeNull();
    expect(attachmentToImagePart(makeAttachment({ type: "image/avif" }))).toBeNull();
  });

  it("rejects malformed base64 payloads", () => {
    expect(attachmentToImagePart(makeAttachment({ data: "data:image/png;base64,not base64!" }))).toBeNull();
    expect(attachmentToImagePart(makeAttachment({ data: "data:image/png;base64,abc" }))).toBeNull();
  });

  it("returns null when data is missing or empty", () => {
    expect(attachmentToImagePart(makeAttachment({ data: "" }))).toBeNull();
    // data URL with an empty payload after the marker
    expect(attachmentToImagePart(makeAttachment({ data: "data:image/png;base64," }))).toBeNull();
  });

  it("treats a bare base64 string (no data: prefix) as the payload", () => {
    expect(attachmentToImagePart(makeAttachment({ data: "QUJD" }))).toEqual({
      type: "image",
      mediaType: "image/png",
      data: "QUJD",
    });
  });
});

describe("attachmentsToImageParts", () => {
  it("returns an empty array for undefined or empty input", () => {
    expect(attachmentsToImageParts(undefined)).toEqual([]);
    expect(attachmentsToImageParts([])).toEqual([]);
  });

  it("keeps only image attachments, dropping everything else", () => {
    const parts = attachmentsToImageParts([
      makeAttachment(),
      makeAttachment({ name: "notes.md", type: "text/markdown", data: "# notes" }),
      makeAttachment({ name: "shot.jpg", type: "image/jpeg", data: "data:image/jpeg;base64,REVG" }),
    ]);
    expect(parts).toEqual([
      { type: "image", mediaType: "image/png", data: "QUJD" },
      { type: "image", mediaType: "image/jpeg", data: "REVG" },
    ]);
  });
});

describe("persistedImageToPart", () => {
  const cdnUrl = "https://vibes-cdn.b-cdn.net/chat-attachments/u1/6063cb76e50ddccacaa5490e3a6436aa.png";

  it("maps an HTTP(S) CDN URL to a url part (never base64)", () => {
    // Regression for the production 400: aiMessagesJson stores the CDN URL
    // after a successful upload; treating it as base64 produced an invalid
    // data URL on the wire.
    expect(persistedImageToPart({ raw: cdnUrl, mediaType: "image/png" })).toEqual({
      type: "image",
      mediaType: "image/png",
      url: cdnUrl,
    });
  });

  it("maps a data URL to a data part without the data: prefix", () => {
    expect(persistedImageToPart({ raw: pngDataUrl, mediaType: "image/png" })).toEqual({
      type: "image",
      mediaType: "image/png",
      data: "QUJD",
    });
  });

  it("maps a bare base64 payload to a data part", () => {
    expect(persistedImageToPart({ raw: "QUJD", mediaType: "image/jpeg" })).toEqual({
      type: "image",
      mediaType: "image/jpeg",
      data: "QUJD",
    });
  });

  it("defaults mediaType to image/png when missing or not an image MIME", () => {
    expect(persistedImageToPart({ raw: "QUJD", mediaType: undefined })).toEqual({
      type: "image",
      mediaType: "image/png",
      data: "QUJD",
    });
    expect(persistedImageToPart({ raw: "QUJD", mediaType: "text/plain" })).toEqual({
      type: "image",
      mediaType: "image/png",
      data: "QUJD",
    });
  });

  it("rejects garbage that is neither a URL nor valid base64", () => {
    expect(persistedImageToPart({ raw: undefined, mediaType: "image/png" })).toBeNull();
    expect(persistedImageToPart({ raw: "", mediaType: "image/png" })).toBeNull();
    expect(persistedImageToPart({ raw: 12345, mediaType: "image/png" })).toBeNull();
    expect(persistedImageToPart({ raw: "not base64!", mediaType: "image/png" })).toBeNull();
    expect(persistedImageToPart({ raw: "data:image/png;base64,abc", mediaType: "image/png" })).toBeNull();
  });
});

describe("resolvePersistedImage", () => {
  const cdnUrl = "https://vibes-cdn.b-cdn.net/chat-attachments/u1/shot.png";

  it("re-inlines a CDN URL as base64 when the download succeeds", async () => {
    // A 2-byte payload ("AB"); the exact bytes don't matter here, only that
    // the resolver downloads and base64-encodes them.
    vi.stubGlobal("fetch", vi.fn(async () => new Response(Buffer.from("AB"), {
      status: 200,
      headers: { "content-type": "image/png" },
    })));
    const part = await resolvePersistedImage({ raw: cdnUrl, mediaType: "image/png" });
    expect(part).toEqual({ type: "image", mediaType: "image/png", data: Buffer.from("AB").toString("base64") });
  });

  it("keeps the url part when the CDN answers with an HTTP error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("gone", { status: 404 })));
    const part = await resolvePersistedImage({ raw: cdnUrl, mediaType: "image/png" });
    expect(part).toEqual({ type: "image", mediaType: "image/png", url: cdnUrl });
  });

  it("keeps the url part when the network fails outright (offline)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ENOTFOUND"); }));
    const part = await resolvePersistedImage({ raw: cdnUrl, mediaType: "image/png" });
    expect(part).toEqual({ type: "image", mediaType: "image/png", url: cdnUrl });
  });

  it("does not fetch for inline sources (dataURL / bare base64)", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect(await resolvePersistedImage({ raw: "QUJD", mediaType: "image/jpeg" })).toEqual({
      type: "image",
      mediaType: "image/jpeg",
      data: "QUJD",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("persistedImageToDataUrl", () => {
  it("returns a complete data URL for an inline base64 source", async () => {
    expect(await persistedImageToDataUrl({ raw: pngDataUrl, mediaType: "image/png" }))
      .toBe(pngDataUrl);
  });

  it("re-downloads a CDN URL and returns its bytes as a data URL", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(Buffer.from("AB"), {
      status: 200,
      headers: { "content-type": "image/png" },
    })));
    expect(await persistedImageToDataUrl({
      raw: "https://vibes-cdn.b-cdn.net/chat-attachments/u1/shot.png",
      mediaType: "image/png",
    })).toBe(`data:image/png;base64,${Buffer.from("AB").toString("base64")}`);
  });

  it("returns null when no inline bytes can be resolved (CDN unreachable)", async () => {
    // Undo restoration must not hand a URL to atob(): null means "cannot
    // rebuild the File", and the caller skips the part.
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ENOTFOUND"); }));
    expect(await persistedImageToDataUrl({
      raw: "https://vibes-cdn.b-cdn.net/chat-attachments/u1/shot.png",
      mediaType: "image/png",
    })).toBeNull();
  });
});
