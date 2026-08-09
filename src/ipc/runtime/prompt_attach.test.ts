/**
 * B6: Unit tests for prompt_attach.ts — the pure system-prompt composer.
 * Extracted from the OpenCode adapter (B6 refactor) so both the adapter and
 * the runtime bridge share one tested implementation.
 */

import { describe, it, expect } from "vitest";
import { attachToSystemPrompt } from "./prompt_attach";

describe("attachToSystemPrompt", () => {
  it("returns undefined when there is nothing to attach", () => {
    expect(attachToSystemPrompt(undefined, undefined)).toBeUndefined();
    expect(attachToSystemPrompt([], undefined)).toBeUndefined();
    expect(attachToSystemPrompt([], "   ")).toBeUndefined();
  });

  it("joins context instructions with blank lines", () => {
    expect(attachToSystemPrompt(["IDIOMA: español", "DB: sqlite"], undefined)).toBe(
      "IDIOMA: español\n\nDB: sqlite",
    );
  });

  it("uses the custom prompt alone when there are no instructions", () => {
    expect(attachToSystemPrompt(undefined, "CUSTOM")).toBe("CUSTOM");
  });

  it("separates instructions and custom prompt with ---", () => {
    expect(attachToSystemPrompt(["A"], "B")).toBe("A\n\n---\n\nB");
  });
});
