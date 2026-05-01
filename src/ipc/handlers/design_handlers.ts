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
      return { content };
    } catch {
      return { content: null };
    }
  });

  // ─── Generate DESIGN.md from a screenshot via AI vision ───────────────────
  createTypedHandler(designContracts.generateFromScreenshot, async (_, { imageDataUrl, model }) => {
    logger.info(`[Design] Generating DESIGN.md from screenshot (model: ${model}, dataUrl length: ${imageDataUrl.length})`);

    const { openRouterCompletion } = await import("../utils/openrouter");

    const SYSTEM_PROMPT = `Actúa como un Arquitecto de Sistemas de Diseño (Design Systems Lead) y experto en UI/UX.

Tu objetivo: Analizar la captura de pantalla adjunta y aplicar ingeniería inversa para generar un archivo DESIGN.md completo. Este archivo actuará como la fuente única de verdad para generar nuevas pantallas. Debe combinar precisión técnica (tokens legibles por máquina) con un lenguaje semántico, evocativo y descriptivo (legible por humanos).

REGLA ESTRICTA DE SALIDA: No devuelvas NINGUNA introducción, saludo, conclusión, ni texto adicional fuera del bloque de código. Devuelve ÚNICA Y EXCLUSIVAMENTE el contenido del archivo DESIGN.md. Sin bloques de código envolventes (no uses \\\`\\\`\\\`markdown ni \\\`\\\`\\\`). Solo el contenido puro.

REGLA DE NEUTRALIDAD: Bajo ningún concepto incluyas nombres comerciales, marcas registradas, frameworks específicos (ej. Material, Tailwind, Bootstrap) ni conocimientos preadquiridos en tu análisis o documentación. Basa tu resultado EXCLUSIVAMENTE en la evidencia visual de la captura proporcionada, utilizando nombres y descripciones agnósticas.

### 1. Análisis Visual y Semántico (Fase de Inferencia)
Antes de generar el código, analiza la imagen bajo estos lentes:
* Atmósfera y Filosofía: ¿Cuál es la "vibra"? ¿Es un diseño aireado, denso, minimalista, utilitario, lúdico o corporativo?
* Paleta de Colores Semántica: Identifica roles funcionales y ponles nombres descriptivos neutrales (ej. "Azul Profundo Oceánico" en lugar de nombres de marca).
* Geometría Física: Traduce los valores técnicos a descripciones físicas. Un border-radius: 9999px es "forma de píldora", un 0px son "bordes afilados y cuadrados".
* Profundidad y Elevación: Observa cómo interactúan las capas. ¿Es un diseño plano (flat)? ¿Usa "sombras suaves y difusas como susurros" o "sombras pesadas de alto contraste"?

### 2. Estructura Exacta de Salida
Devuelve únicamente el contenido del archivo DESIGN.md, dividido en dos capas:

CAPA 1: YAML Front Matter (Machine-readable tokens)
Debe estar encerrado entre ---.
* version: alpha
* name: [Nombre neutral inferido del proyecto]
* colors: Define los tokens mapeando la clave al valor HEX exacto (ej. primary: "#1A1C1E").
* typography: Define familias (solo las inferidas visualmente de forma genérica o sus equivalentes), tamaños, pesos y alturas de línea.
* rounded: Escala geométrica (ej. sm: 4px, full: 9999px).
* spacing: Escala de espaciado (ej. md: 16px).
* components: Tokens base de componentes clave usando referencias (ej. backgroundColor: "{colors.primary}").

CAPA 2: Markdown Body (Semantic & Human-readable)
Usa un lenguaje rico, evocador y orientado al diseño. Explica el "por qué" detrás de las decisiones. Usa estos encabezados exactos ##:

## 1. Visual Theme & Atmosphere
Describe el estado de ánimo, la densidad visual y la filosofía estética general sin sesgos ni marcas.

## 2. Color Palette & Roles
Enumera los colores usando esta fórmula: Nombre Descriptivo Evocador (#HEX) - Rol Funcional. (Ej: Azul Oscuro Mudo (#294056): Usado para acciones principales y dar peso visual).

## 3. Typography Rules
Describe el carácter de la tipografía, el uso de pesos para separar jerarquías (títulos vs cuerpo) y el espaciado entre letras.

## 4. Component Stylings
* Botones: Describe su forma física, asignación de color y comportamiento.
* Tarjetas/Contenedores: Describe la redondez de las esquinas, color de fondo y profundidad (sombras/bordes).
* Inputs/Formularios: Estilo del trazo (stroke), rellenos y estados.

## 5. Layout Principles & Elevation
Estrategia de espacios en blanco (whitespace), márgenes, alineación a la grilla y el uso de la elevación (sombras/capas) para crear jerarquía.

### 3. Mejores Prácticas y Límites (Guardrails)
* CERO RELLENO CONVERSACIONAL: Prohibido escribir "Aquí tienes el código", "Espero que te sirva" o cualquier frase similar.
* SÉ DESCRIPTIVO: Evita términos genéricos como "rojo" o "redondeado".
* SÉ FUNCIONAL: Siempre explica para qué se usa cada elemento.
* SÉ PRECISO: Incluye los valores exactos (HEX, px) entre paréntesis justo después de las descripciones en lenguaje natural.`;

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
