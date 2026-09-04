import { describe, expect, it } from "vitest";
import { normalizeMessageContent } from "./normalizeMessageContent";

// Tokens DSML reales (misma convención que el provider del core):
// DeepSeek: <｜DSML｜tool_calls> ... </｜DSML｜tool_calls> (barra fullwidth ｜ U+FF5C)
// GLM:      <|tool_calls_begin|> ... <|tool_calls_end|>     (barra normal |)
const L = "\u003c"; // <
const G = "\u003e"; // >
const S = "\u002f"; // /
const FW = "\uff5c"; // ｜
const P = "\u007c"; // |
const D_OPEN = `${L}${FW}DSML${FW}tool_calls${G}`;
const D_CLOSE = `${L}${S}${FW}DSML${FW}tool_calls${G}`;
const D_INV_OPEN = `${L}${FW}DSML${FW}invoke name="fn"${G}`;
const D_INV_CLOSE = `${L}${S}${FW}DSML${FW}invoke${G}`;
const G_OPEN = `${L}${P}tool_calls_begin${P}${G}`;
const G_CLOSE = `${L}${P}tool_calls_end${P}${G}`;

describe("normalizeMessageContent", () => {
  it("devuelve string vacío para null/undefined", () => {
    expect(normalizeMessageContent(null)).toBe("");
    expect(normalizeMessageContent(undefined)).toBe("");
  });

  it("pasa texto plano sin cambios", () => {
    expect(normalizeMessageContent("Hola mundo")).toBe("Hola mundo");
    expect(normalizeMessageContent("Normal text with <b>tags</b>")).toBe(
      "Normal text with <b>tags</b>",
    );
  });

  it("aplica normalizeLegacyTags (dyad-* -> vibes-*)", () => {
    const input = '<dyad-action type="tool">foo</dyad-action>';
    const expected = '<vibes-action type="tool">foo</vibes-action>';
    expect(normalizeMessageContent(input)).toBe(expected);
  });

  it("elimina bloques DSML DeepSeek y conserva la prosa", () => {
    const block = `${D_OPEN}\n${D_INV_OPEN}\n<parameter name="x">42</parameter>\n${D_INV_CLOSE}\n${D_CLOSE}`;
    const input = `Pensamiento previo.\n\n${block}\n\nY después la respuesta.`;
    const output = normalizeMessageContent(input);
    expect(output).toContain("Pensamiento previo.");
    expect(output).toContain("Y después la respuesta.");
    expect(output).not.toContain(FW);
    expect(output).not.toContain("invoke");
    expect(output).not.toContain("tool_calls");
  });

  it("elimina bloques GLM (tool_calls_begin) y conserva la prosa", () => {
    const block = `${G_OPEN}\n<|tool_call_begin|>fn\n<|tool_call_sep|>{}\n<|tool_call_end|>\n${G_CLOSE}`;
    const input = `Texto antes.\n\n${block}\n\nTexto después.`;
    const output = normalizeMessageContent(input);
    expect(output).toContain("Texto antes.");
    expect(output).toContain("Texto después.");
    expect(output).not.toContain("tool_calls_begin");
    expect(output).not.toContain("tool_call_begin");
    expect(output).not.toContain(P + "tool_calls");
  });

  it("compone legacy tags + DSML en el mismo mensaje", () => {
    const block = `${D_OPEN}${D_INV_OPEN}…${D_INV_CLOSE}${D_CLOSE}`;
    const input = `<dyad-thinking>Hmm</dyad-thinking> ${block}`;
    const output = normalizeMessageContent(input);
    expect(output).toContain("<vibes-thinking>Hmm</vibes-thinking>");
    expect(output).not.toContain("dyad-");
    expect(output).not.toContain(FW);
  });

  it("elimina el bloque [Previous Turn Context Summary] al final y conserva la prosa", () => {
    const input =
      "Listo, card restaurada.\n\n" +
      "[Previous Turn Context Summary]\n" +
      "Read: /home/munix/ChatMessage.tsx\n" +
      "Modified: /home/munix/ChatMessage.tsx, walkthrough.md";
    const output = normalizeMessageContent(input);
    expect(output).toContain("Listo, card restaurada.");
    expect(output).not.toContain("[Previous Turn Context Summary]");
    expect(output).not.toContain("Read:");
    expect(output).not.toContain("Modified:");
    // No debe dejar el sangrado \n\n sobrante antes del corte.
    expect(output).toBe("Listo, card restaurada.\n");
  });

  it("no toca el texto cuando no hay marcador de summary", () => {
    const input = "Respuesta normal sin memoria de turno.";
    expect(normalizeMessageContent(input)).toBe(
      "Respuesta normal sin memoria de turno.",
    );
  });

  it("no rompe <|think|> tags ni < suelto en prosa", () => {
    const input = "Pensando… <|think|>estoy razonando<|endthink|> hecho. a < b";
    const output = normalizeMessageContent(input);
    expect(output).toContain("<|think|>");
    expect(output).toContain("<|endthink|>");
    expect(output).toContain("estoy razonando");
    expect(output).toContain("a < b");
  });
});
