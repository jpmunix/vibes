import log from "electron-log";
import { createTypedHandler } from "./base";
import { designContracts } from "../types/design";
import { getVibesAppPath } from "../../paths/paths";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { promises as fsPromises } from "node:fs";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const execFileAsync = promisify(execFile);
const logger = log.scope("design_handlers");

// =============================================================================
// In-memory cache for getdesign list (TTL: 24 hours)
// =============================================================================

interface DesignListCache {
  data: { id: string; description: string }[];
  fetchedAt: number;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
let designListCache: DesignListCache | null = null;

/**
 * Parses the output of `npx getdesign list`.
 * Each line has the format: "brand - Description text here."
 */
function parseDesignList(stdout: string): { id: string; description: string }[] {
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line.includes(" - "))
    .map((line) => {
      const dashIndex = line.indexOf(" - ");
      return {
        id: line.substring(0, dashIndex).trim(),
        description: line.substring(dashIndex + 3).trim(),
      };
    });
}

/**
 * Writes DESIGN.md content to docs/DESIGN.md inside an app folder.
 */
async function writeDesignToApp(appPath: string, content: string): Promise<void> {
  const fullAppPath = getVibesAppPath(appPath);
  const docsDir = path.join(fullAppPath, "docs");
  const designMdPath = path.join(docsDir, "DESIGN.md");

  await fsPromises.mkdir(docsDir, { recursive: true });
  await fsPromises.writeFile(designMdPath, content, "utf-8");
  logger.info(`[Design] Wrote DESIGN.md to ${designMdPath} (${content.length} chars)`);
  // DESIGN.md is NOT registered in opencode.json — it's injected into SPECS.md
  // only on the first message of a chat to avoid bloating every subsequent request.
}

/**
 * Ensures `docs/DESIGN.md` is listed in the project's `opencode.json` `instructions` array.
 * Creates the file if it doesn't exist; merges if it does.
 */
export async function patchOpencodeJsonInstructions(projectDir: string, instructionPath: string): Promise<void> {
  const ocJsonPath = path.join(projectDir, "opencode.json");

  let config: Record<string, any> = {};
  try {
    const existing = await fsPromises.readFile(ocJsonPath, "utf-8");
    config = JSON.parse(existing);
  } catch {
    // File doesn't exist or is invalid — start fresh
  }

  // Ensure instructions is an array
  if (!Array.isArray(config.instructions)) {
    config.instructions = [];
  }

  // Add the instruction path if not already present
  if (!config.instructions.includes(instructionPath)) {
    config.instructions.push(instructionPath);
  }

  await fsPromises.writeFile(ocJsonPath, JSON.stringify(config, null, 2), "utf-8");
  logger.info(`[Design] Updated opencode.json — instructions: ${JSON.stringify(config.instructions)}`);
}

export function registerDesignHandlers() {
  logger.debug("Registering design handlers");

  // ─── List available designs ───────────────────────────────────────────────
  createTypedHandler(designContracts.listDesigns, async () => {
    // Return cached data if still fresh
    if (designListCache && Date.now() - designListCache.fetchedAt < CACHE_TTL_MS) {
      logger.info(`[Design] Returning cached design list (${designListCache.data.length} items)`);
      return designListCache.data;
    }

    logger.info("[Design] Fetching design list via npx getdesign list...");

    try {
      const { stdout } = await execFileAsync("npx", ["-y", "getdesign@latest", "list"], {
        timeout: 30_000,
        env: { ...process.env },
      });

      const designs = parseDesignList(stdout);
      logger.info(`[Design] Parsed ${designs.length} designs from getdesign list`);

      // Update cache
      designListCache = {
        data: designs,
        fetchedAt: Date.now(),
      };

      return designs;
    } catch (error: any) {
      logger.error("[Design] Failed to fetch design list:", error.message);

      // If we have stale cache, return it rather than failing
      if (designListCache) {
        logger.warn("[Design] Returning stale cached data due to fetch error");
        return designListCache.data;
      }

      throw new Error(`Error al obtener la lista de diseños: ${error.message}`);
    }
  });

  // ─── Add a brand design to a project ──────────────────────────────────────
  // Runs `npx getdesign add <brand>` in a temp directory, then copies the
  // resulting DESIGN.md to <appPath>/docs/DESIGN.md. This avoids the CLI's
  // relative-path quirks with --out.
  createTypedHandler(designContracts.addDesign, async (_, { brand, appPath }) => {
    logger.info(`[Design] Adding design "${brand}" to app "${appPath}"`);

    // Create a temp dir where getdesign will write its output
    const tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "vibes-design-"));

    try {
      await execFileAsync(
        "npx",
        ["-y", "getdesign@latest", "add", brand, "--force"],
        {
          timeout: 30_000,
          cwd: tmpDir,
          env: { ...process.env },
        },
      );

      // getdesign writes DESIGN.md in the CWD
      const tmpDesignPath = path.join(tmpDir, "DESIGN.md");
      if (!fs.existsSync(tmpDesignPath)) {
        throw new Error(`getdesign did not create DESIGN.md in ${tmpDir}`);
      }

      const content = await fsPromises.readFile(tmpDesignPath, "utf-8");
      logger.info(`[Design] Downloaded DESIGN.md for "${brand}" (${content.length} chars)`);

      // Write to the actual app docs/ folder
      await writeDesignToApp(appPath, content);

      return { content };
    } catch (error: any) {
      logger.error(`[Design] Failed to add design "${brand}":`, error.message);
      throw new Error(`Error al instalar el diseño "${brand}": ${error.message}`);
    } finally {
      // Cleanup temp dir
      try {
        await fsPromises.rm(tmpDir, { recursive: true, force: true });
      } catch { /* best effort */ }
    }
  });

  // ─── Write custom (uploaded/pasted) DESIGN.md to a project ────────────────
  createTypedHandler(designContracts.writeCustomDesign, async (_, { content, appPath }) => {
    logger.info(`[Design] Writing custom DESIGN.md to app "${appPath}" (${content.length} chars)`);

    try {
      await writeDesignToApp(appPath, content);
      return { written: true };
    } catch (error: any) {
      logger.error("[Design] Failed to write custom DESIGN.md:", error.message);
      throw new Error(`Error al guardar el diseño personalizado: ${error.message}`);
    }
  });

  // ─── Read docs/DESIGN.md from a project ───────────────────────────────────
  createTypedHandler(designContracts.readDesign, async (_, { appPath }) => {
    try {
      const fullAppPath = getVibesAppPath(appPath);
      const designMdPath = path.join(fullAppPath, "docs", "DESIGN.md");
      const content = await fsPromises.readFile(designMdPath, "utf-8");
      return { content };
    } catch {
      return { content: null };
    }
  });

  // ─── Read AGENTS.md from the project root ──────────────────────────────────
  createTypedHandler(designContracts.readAgentsMd, async (_, { appPath }) => {
    try {
      const fullAppPath = getVibesAppPath(appPath);
      const agentsMdPath = path.join(fullAppPath, "AGENTS.md");
      const content = await fsPromises.readFile(agentsMdPath, "utf-8");
      return { content };
    } catch {
      return { content: null };
    }
  });

  // ─── Read docs/SPECS.md from a project ──────────────────────────────────
  createTypedHandler(designContracts.readSpecsMd, async (_, { appPath }) => {
    try {
      const fullAppPath = getVibesAppPath(appPath);
      const specsMdPath = path.join(fullAppPath, "docs", "SPECS.md");
      const content = await fsPromises.readFile(specsMdPath, "utf-8");
      return     const SYSTEM_PROMPT = `Actúa como un Arquitecto de Sistemas de Diseño (Design Systems Lead) y experto en UI/UX.

Tu objetivo: Analizar la captura de pantalla adjunta y aplicar ingeniería inversa para generar un archivo DESIGN.md completo, adhiriéndote estrictamente a la especificación estándar de DESIGN.md. Este archivo será la fuente de verdad tanto para humanos como para agentes de IA.

REGLA ESTRICTA DE SALIDA: No devuelvas NINGUNA introducción, saludo, conclusión, ni texto adicional fuera del archivo generado. Devuelve ÚNICA Y EXCLUSIVAMENTE el contenido del archivo DESIGN.md puro. SIN bloques de código envolventes (no uses \\\`\\\`\\\`markdown ni \\\`\\\`\\\`).

REGLA DE NEUTRALIDAD: Bajo ningún concepto incluyas nombres comerciales, marcas registradas o frameworks específicos (ej. Material, Tailwind, Bootstrap). Basa tu resultado EXCLUSIVAMENTE en la evidencia visual.

### 1. Fase de Análisis e Inferencia Visual
Antes de generar el contenido, infiere de la captura de pantalla:
* Atmósfera y Brand: ¿Es denso, espacioso, minimalista, corporativo, lúdico?
* Colores: Identifica roles semánticos (primary, secondary, neutral, etc.). Usa nombres evocadores en la prosa.
* Tipografía: Infiere las fuentes (o equivalentes genéricas), tamaños, pesos y alturas de línea para titulares (headlines) y cuerpo (body).
* Layout y Espaciado: ¿Usa una escala de 8px? ¿Márgenes amplios o compactos?
* Formas (Shapes) y Elevación: Observa los radios de borde (border-radius) y cómo las sombras construyen jerarquía (flat vs. sombras profundas).

### 2. Estructura Exacta de Salida
El archivo DESIGN.md debe tener exactamente estas dos partes, en este orden:

#### PARTE 1: YAML Front Matter (Machine-readable tokens)
Debe estar al inicio del archivo, delimitado por --- arriba y abajo. Usa los valores inferidos y referencias de tokens (ej. {colors.primary}). Sigue este esquema estricto:

---
version: alpha
name: [Nombre neutral inferido]
colors:
  primary: "#HEX"
  secondary: "#HEX"
  neutral: "#HEX"
typography:
  headline-md:
    fontFamily: [Fuente Inferida]
    fontSize: [Tamaño px/rem]
    fontWeight: [Peso]
    lineHeight: [Número/Dimensión]
    letterSpacing: [Dimensión]
  body-md:
    # ...
rounded:
  sm: 4px
  md: 8px
  full: 9999px
spacing:
  base: 16px
  sm: 8px
  lg: 32px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#FFFFFF"
    rounded: "{rounded.md}"
---

#### PARTE 2: Markdown Body (Semantic & Human-readable)
Explica la lógica y proporciona contexto para aplicar los tokens. Puedes usar un encabezado # para el título del documento. DEBES usar los siguientes encabezados ## EXACTAMENTE en este orden (omite los irrelevantes, pero mantén la secuencia):

## Overview
Visión holística del look and feel, personalidad y respuesta emocional de la UI.

## Colors
Explica la paleta. Usa colores semánticos como: primary, secondary, tertiary, neutral.

## Typography
Describe la estrategia tipográfica, pesos y jerarquías (Headlines, Body, Labels).

## Layout
Modelo de diseño (grilla fluida, anchos fijos) y ritmo de espaciado.

## Elevation & Depth
Estrategia de sombras, capas tonales o bordes para lograr jerarquía visual.

## Shapes
Lenguaje de las formas (ej. Arquitectura afilada con esquinas de 0px, o bordes amigables de 8px).

## Components
Guía de estilo para componentes atómicos observados en la imagen (Botones, Inputs, Chips, etc.). Define variantes si es posible (ej. button-primary, button-secondary).

## Do's and Don'ts
Lineamientos prácticos, mejores prácticas de contraste y errores a evitar.

### 3. Límites (Guardrails)
* CERO RELLENO CONVERSACIONAL: Empieza directamente con --- y termina con el último texto del markdown.
* Sé preciso: Usa valores exactos (HEX, px, rem) entre paréntesis en la prosa cuando sea útil.
* Sé funcional y evocativo en las descripciones.\`;

    try {
      const data = await openRouterCompletion({
        model,
        title: "design-screenshot-analysis",
        temperature: 0.2,
        max_tokens: 8000,
        messages: [
          {
            role: "system",
            content: SYSTEM_PROMPT,
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Analiza esta captura de pantalla y genera el archivo DESIGN.md completo. Recuerda: SOLO el contenido del archivo, sin texto adicional.",
              },
              {
                type: "image_url",
                image_url: {
                  url: imageDataUrl,
                },
              },
            ],
          },
        ] as any,
      });

      let content = data?.choices?.[0]?.message?.content?.trim() || "";

      // Strip any accidental markdown code fences the model might add
      if (content.startsWith("```")) {
        // Remove opening fence (```markdown, ```yaml, ```, etc.)
        content = content.replace(/^```[a-z]*\n?/, "");
        // Remove closing fence
        content = content.replace(/\n?```\s*$/, "");
      }

      if (!content || content.length < 50) {
        throw new Error("La IA no generó contenido suficiente para el DESIGN.md");
      }

      logger.info(`[Design] Generated DESIGN.md from screenshot (${content.length} chars)`);
      return { content };
    } catch (error: any) {
      logger.error("[Design] Failed to generate DESIGN.md from screenshot:", error.message);
      // Detect OpenRouter vision-not-supported error
      if (error.message?.includes("support image input") || error.message?.includes("image_url")) {
        throw new Error("El modelo seleccionado no soporta imágenes. Cambia a un modelo con visión (ej. Claude, GPT-4o, Gemini) e inténtalo de nuevo.");
      }
      throw new Error(`Error al generar el diseño desde la captura: ${error.message}`);
    }
  });
}
