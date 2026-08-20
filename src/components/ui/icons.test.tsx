import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as Icons from "@/components/ui/icons";

/**
 * Contrato de iconos (Slice 1 — card #103).
 *
 * Por qué este test existe:
 * El chunk de arranque del renderer pasó de 1,291 KB a 323 KB al eliminar
 * `import * as Lucide` + `export * from "lucide-react"` de icons.tsx
 * (que metía los ~1570 iconos en el bundle). Si alguien reintroduce un
 * namespace-import o un `export *`, el bundle vuelve a engordar ~967 KB
 * sin que ningún test de comportamiento lo detecte (los iconos "funcionan").
 *
 * Este test ancla el contrato a nivel de fuente + runtime:
 * 1. icons.tsx NO usa `import *` / `export *` de lucide-react (guardia de tree-shaking).
 * 2. Las exportaciones esperadas siguen presentes (que no se pierdan en un refactor).
 * 3. Los brand SVGs siguen exportados y son componentes renderizables.
 */

const ICONS_PATH = resolve(__dirname, "./icons.tsx");

describe("icons.tsx — contrato de tree-shaking (Slice 1, card #103)", () => {
  it("NO contiene namespace-imports de lucide-react (import *)", () => {
    const src = readFileSync(ICONS_PATH, "utf8");
    expect(src).not.toMatch(/import\s+\*\s+as\s+\w+\s+from\s+["']lucide-react["']/);
  });

  it("NO contiene re-export wildcard de lucide-react (export *)", () => {
    const src = readFileSync(ICONS_PATH, "utf8");
    expect(src).not.toMatch(/export\s+\*\s+from\s+["']lucide-react["']/);
  });

  it("NO reintroduce iconoir-react (feature de doble tema eliminada)", () => {
    const src = readFileSync(ICONS_PATH, "utf8");
    expect(src).not.toMatch(/iconoir/);
  });
});

describe("icons.tsx — exportaciones presentes", () => {
  // Muestra de los iconos más usados en la app (regresión si se pierde alguno).
  const REQUIRED_ICONS = [
    "AlertCircle",
    "Check",
    "ChevronDown",
    "ChevronRight",
    "Copy",
    "Loader2",
    "Play",
    "Plus",
    "Search",
    "Send",
    "Settings",
    "Sparkles",
    "Trash2",
    "X",
    "Zap",
  ] as const;

  it.each(REQUIRED_ICONS)("exporta %s como componente", (name) => {
    const cmp = (Icons as Record<string, unknown>)[name];
    expect(cmp).toBeDefined();
    expect(typeof cmp).toMatch(/function|object/);
  });

  // Brand SVGs propios (no vienen de lucide).
  const BRAND_ICONS = [
    "NeonIcon",
    "GoogleIcon",
    "BunnyIcon",
    "SupabaseIcon",
    "PocketBaseIcon",
    "ReactIcon",
    "NextIcon",
    "VueIcon",
    "AstroIcon",
    "SvelteIcon",
  ] as const;

  it.each(BRAND_ICONS)("exporta el brand SVG %s", (name) => {
    const cmp = (Icons as Record<string, unknown>)[name];
    expect(cmp).toBeDefined();
    expect(typeof cmp).toMatch(/function|object/);
  });
});
