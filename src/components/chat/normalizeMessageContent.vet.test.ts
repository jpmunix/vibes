/**
 * Vet exhaustivo de la regresión de tags think/context-summary huérfanas.
 * NO es un test de regresión: es un guión manual de validación que ejecuta
 * los mismos casos límite que la conversación real produjo. Si alguno
 * cambia, hay que investigar.
 */
import { describe, expect, it } from "vitest";
import { normalizeMessageContent } from "./normalizeMessageContent";

describe("VET — strip huérfanos retroactivo", () => {
  it("CASO 1: regresión original (read_file con <think> en regex)", () => {
    const input =
      "Voy a mirar la función de undo.\n\n" +
      '<vibes-read path="/version_handlers.ts">\n' +
      "  let cleaned = msg.content.replace(/<think>[\\s\\S]*?<\\/think>/g, \"\");\n" +
      "</vibes-read>\n\n" +
      "Voy a leer la función completa.\n" +
      "</think>";
    const out = normalizeMessageContent(input);
    // El cierre huérfano del final de la prosa desaparece.
    expect(out).not.toMatch(/Voy a leer la función completa\.\n*<\/think>/);
    // La prosa legítima sobrevive.
    expect(out).toContain("Voy a leer la función completa.");
    // El código del tool block (con `<think>` como texto literal del regex) se preserva intacto.
    expect(out).toContain("let cleaned = msg.content.replace");
    expect(out).toContain("<think>[\\s\\S]*?<\\/think>");
  });

  it("CASO 2: par válido → <vibes-think>", () => {
    const out = normalizeMessageContent("<think>razonando</think>\nRespuesta final.");
    expect(out).toContain("<vibes-think>razonando</vibes-think>");
    expect(out).toContain("Respuesta final.");
  });

  it("CASO 3: context-summary retroactivo", () => {
    const input =
      "Lo que vi en el archivo es:\n" +
      "<vibes-context-summary>\n" +
      "Read: a.ts, b.ts\n" +
      "Listed: src\n" +
      "Modified: c.ts\n" +
      "</vibes-context-summary>\n" +
      "Esto es lo importante.";
    const out = normalizeMessageContent(input);
    expect(out).not.toContain("vibes-context-summary");
    expect(out).not.toContain("Read: a.ts");
    expect(out).toContain("Esto es lo importante.");
  });

  it("CASO 4: stress combinado (context-summary + pares válidos + cierre huérfano)", () => {
    const input =
      "Respuesta.\n" +
      "</vibes-context-summary></vibes-context-summary>\n" +
      "<think>planes</think>\n" +
      "<think>otro\nmás razonamiento</think>\n" +
      "Y esta es la respuesta final.</think>";
    const out = normalizeMessageContent(input);
    expect(out).not.toContain("</think>");
    expect(out).not.toContain("vibes-context-summary");
    expect(out).toContain("Y esta es la respuesta final.");
  });

  it("CASO 5: doble cierre huerfano de context-summary", () => {
    const out = normalizeMessageContent("Bien.\n\n</vibes-context-summary></vibes-context-summary>");
    expect(out).not.toContain("vibes-context-summary");
    expect(out).toContain("Bien.");
  });

  it("CASO 6: vibes-edit con código que contiene <think>", () => {
    const input =
      "Edito el archivo:\n" +
      '<vibes-edit path="strip.js">\n' +
      "  text = text.replace(/<think>/g, '');\n" +
      "</vibes-edit>\n" +
      "Listo.</think>";
    const out = normalizeMessageContent(input);
    // El cierre huérfano posterior al tool block desaparece.
    expect(out).not.toMatch(/Listo\.\n*<\/think>/);
    expect(out).toContain("text.replace(/<think>/g");
    expect(out).toContain("Listo.");
    // El tool block completo se preserva.
    expect(out).toMatch(/<vibes-edit[\s\S]*<\/vibes-edit>/);
  });

  it("CASO 7: cierre huerfano simple sin nada antes", () => {
    expect(normalizeMessageContent("Texto normal.</think>")).toBe("Texto normal.");
  });

  it("CASO 8: <think> dentro de vibes-write + cierre huerfano posterior", () => {
    const input =
      '<vibes-write path="x.ts">\n' +
      "// <think>…</think> special handling\n" +
      "</vibes-write>\n" +
      "Cerrado.\n" +
      "</think>\n" +
      "Otra línea.";
    const out = normalizeMessageContent(input);
    // El cierre huérfano posterior al tool block desaparece.
    expect(out).not.toMatch(/Cerrado\.\n*<\/think>/);
    expect(out).toContain("Cerrado.");
    expect(out).toContain("Otra línea.");
    // El código del tool block (con `<think>` como texto de comentario) se preserva.
    expect(out).toContain("// <think>…</think> special handling");
    expect(out).toMatch(/<vibes-write[\s\S]*<\/vibes-write>/);
  });

  it("CASO 9: apertura huerfana <thought> en prosa", () => {
    const out = normalizeMessageContent("Antes <thought>meto basura y sigo escribiendo.");
    expect(out).not.toContain("<thought>");
    expect(out).toContain("meto basura y sigo escribiendo");
  });

  it("CASO 10: cierre huerfano tras vibes-shell", () => {
    const input =
      '<vibes-shell cmd="ls">\nfoo\nbar\n</vibes-shell>\n' +
      "Ya está.</think>";
    const out = normalizeMessageContent(input);
    expect(out).not.toContain("</think>");
    expect(out).toContain("foo");
    expect(out).toContain("bar");
    expect(out).toContain("Ya está.");
  });

  it("CASO 11: idempotente (aplicar dos veces = aplicar una vez)", () => {
    const out1 = normalizeMessageContent("A.</think>");
    const out2 = normalizeMessageContent(out1);
    expect(out2).toBe(out1);
  });

  it("CASO 12: no false positives con palabras 'think' sin tags", () => {
    const input = "Let's think about this. I think it's fine.";
    expect(normalizeMessageContent(input)).toBe(input);
  });

  it("CASO 13: tool block con tag <think> no se traga el cierre huerfano del final", () => {
    // Tres tools consecutivas con think dentro + cierre final huerfano
    const input =
      '<vibes-read path="a.ts"><think>("");</vibes-read>' +
      '<vibes-read path="b.ts"><think>("");</vibes-read>' +
      '<vibes-read path="c.ts"><think>("");</vibes-read>' +
      "Fin.</think>";
    const out = normalizeMessageContent(input);
    // El cierre huérfano final de la prosa desaparece.
    expect(out).not.toMatch(/Fin\.\n*<\/think>/);
    expect(out).toContain("Fin.");
    // El código de los tool blocks (con <think> como string) se preserva intacto.
    expect(out).toContain("<think>(\"\")");
    expect(out).toMatch(/<vibes-read[\s\S]*<\/vibes-read>[\s\S]*<\/vibes-read>/);
  });
});
