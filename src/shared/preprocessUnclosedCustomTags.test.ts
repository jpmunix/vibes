import { describe, expect, it } from "vitest";
import { preprocessUnclosedCustomTags } from "./preprocessUnclosedCustomTags";

const TAGS = [
  "vibes-write",
  "vibes-token-usage",
  "vibes-cancelled",
  "vibes-files-changed",
  "vibes-think",
] as const;

describe("preprocessUnclosedCustomTags", () => {
  it("elimina la secuencia exacta de cierres huérfanos que crecía en streaming", () => {
    const content =
      "Texto\n" +
      "</vibes-write></vibes-write>" +
      "</vibes-token-usage></vibes-token-usage>" +
      "</vibes-cancelled></vibes-cancelled>" +
      "</vibes-files-changed></vibes-files-changed>";

    expect(preprocessUnclosedCustomTags(content, TAGS)).toEqual({
      processedContent: "Texto\n",
      inProgressTags: new Map(),
    });
  });

  it("preserva bloques completos aunque su contenido parezca tags internos", () => {
    const content =
      '<vibes-write path="a.ts">' +
      'const source = "</vibes-token-usage><vibes-think>";' +
      "</vibes-write>";

    expect(preprocessUnclosedCustomTags(content, TAGS)).toEqual({
      processedContent: content,
      inProgressTags: new Map(),
    });
  });

  it("cierra aperturas en progreso en orden inverso y marca sus offsets", () => {
    const content = '<vibes-write path="a"><vibes-think>parcial';
    const result = preprocessUnclosedCustomTags(content, TAGS);

    expect(result.processedContent).toBe(
      content + "</vibes-think></vibes-write>",
    );
    expect(result.inProgressTags.get("vibes-write")).toEqual(new Set([0]));
    expect(result.inProgressTags.get("vibes-think")).toEqual(
      new Set([content.indexOf("<vibes-think>")]),
    );
  });

  it("preserva pares completos y elimina solo el cierre sobrante posterior", () => {
    const content =
      '<vibes-token-usage input="1"></vibes-token-usage>' +
      "</vibes-token-usage>";
    const result = preprocessUnclosedCustomTags(content, TAGS);

    expect(result.processedContent).toBe(
      '<vibes-token-usage input="1"></vibes-token-usage>',
    );
    expect(result.inProgressTags.size).toBe(0);
  });
});
