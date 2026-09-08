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

  it("elimina bloques completos <vibes-context-summary> (retroactivo, sin tocar DB)", () => {
    const block =
      "<vibes-context-summary>\n" +
      "Read: a.ts, b.ts\n" +
      "Listed: src\n" +
      "Modified: c.ts\n" +
      "</vibes-context-summary>";
    const input = "Listo, restaurado.\n\n" + block;
    const output = normalizeMessageContent(input);
    expect(output).toContain("Listo, restaurado.");
    expect(output).not.toContain("vibes-context-summary");
    expect(output).not.toContain("Read: a.ts");
    expect(output).not.toContain("Modified: c.ts");
  });

  it("elimina tags sueltos de apertura/cierre de vibes-context-summary (doble cierre)", () => {
    const orphanClose = "</vibes-context-summary></vibes-context-summary>";
    const input = "Respuesta limpia.\n\n" + orphanClose;
    const output = normalizeMessageContent(input);
    expect(output).not.toContain("vibes-context-summary");
    expect(output).toContain("Respuesta limpia.");
  });

  it("elimina bloques con atributos y respeta el texto alrededor", () => {
    const input =
      "Antes " +
      '<vibes-context-summary files="3">datos</vibes-context-summary>' +
      " después";
    expect(normalizeMessageContent(input)).toBe("Antes  después");
  });

  it("elimina tags </think> huérfanos sin apertura previa", () => {
    const input = "Texto normal.</think>";
    expect(normalizeMessageContent(input)).toBe("Texto normal.");
  });

  it("elimina tags </vibes-think> o </thought> huérfanos", () => {
    const input = '<vibes-grep query="version_handlers"></vibes-grep>\n</think>\nExplicación.';
    const output = normalizeMessageContent(input);
    expect(output).not.toContain("</think>");
    expect(output).toContain("Explicación.");
  });

  it("preserva pares válidos <think>...</think> convirtiéndolos a <vibes-think>", () => {
    const input = "<think>razonando</think>\nRespuesta.";
    const output = normalizeMessageContent(input);
    expect(output).toContain("<vibes-think>razonando</vibes-think>");
    expect(output).toContain("Respuesta.");
  });

  it("elimina cierre huérfano incluso si hay un think previo ya cerrado", () => {
    const input = "<think>razonando</think>\nRespuesta.\n</think>";
    const output = normalizeMessageContent(input);
    expect(output).toBe("<vibes-think>razonando</vibes-think>\nRespuesta.\n");
  });

  it("elimina cierre huérfano de think cuando el tool tag leyó código con un <think> dentro", () => {
    const input =
      'Voy a mirar la función de undo en `ChatInput.tsx`.\n\n' +
      '<vibes-read path="/version_handlers.ts">\n' +
      '  let cleaned = msg.content.replace(/<think>[\\s\\S]*?<\\/think>/g, "");\n' +
      '</vibes-read>\n\n' +
      'Voy a leer la función `performUndo` completa.\n' +
      '</think>';
    const output = normalizeMessageContent(input);
    expect(output).not.toContain("</think>");
    expect(output).toContain("Voy a leer la función `performUndo` completa.");
    expect(output).toContain("let cleaned = msg.content.replace");
  });

  it("elimina la cola exacta de cierres vibes huérfanos vista durante streaming", () => {
    const input =
      'Texto visible\n' +
      '</vibes-write></vibes-token-usage></vibes-cancelled></vibes-files-changed>';
    expect(normalizeMessageContent(input)).toBe("Texto visible\n");
  });

  it("elimina cierres vibes duplicados que crecen entre snapshots", () => {
    const input =
      '</vibes-write></vibes-write>' +
      '<think>pensando</think><think>más</think>' +
      '</vibes-token-usage></vibes-token-usage>' +
      '</vibes-cancelled></vibes-cancelled>' +
      '</vibes-files-changed></vibes-files-changed>';
    const output = normalizeMessageContent(input);
    expect(output).toBe(
      '<vibes-think>pensando</vibes-think><vibes-think>más</vibes-think>',
    );
  });

  it("preserva bloques vibes completos válidos y su contenido", () => {
    const input =
      '<vibes-token-usage input="10" output="5"></vibes-token-usage>\n' +
      '<vibes-write path="a.ts">contenido</vibes-write>';
    expect(normalizeMessageContent(input)).toBe(input);
  });

  it("preserva una apertura vibes en progreso para el parser de streaming", () => {
    const input = '<vibes-write path="a.ts">contenido parcial';
    expect(normalizeMessageContent(input)).toBe(input);
  });
});

