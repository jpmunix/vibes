import path from "path";

/**
 * Aliases compartidos para consumir el runtime vibes-core desde su fuente
 * TypeScript. Los paquetes @vibes/* exportan "./src/index.ts" como main
 * (no hay dist hasta la Fase 5), así que los apuntamos directamente.
 *
 * Se usan tanto en vite.main.config.mts (build del main process) como en
 * vite.renderer.config.mts (dev server del renderer). El renderer los
 * necesita porque el crawler de optimizeDeps de Vite escanea TODO src/ y,
 * al encontrarse los imports @vibes/* en src/ipc/runtime/*.ts, los intenta
 * resolver con SUS propios aliases; sin estos aliases, cualquier
 * re-optimización de dependencias (p. ej. al cambiar package-lock.json y
 * por tanto el lockfileHash) lanza "could not be resolved".
 *
 * No usamos deps "file:" en package.json porque vibes-core declara sus
 * dependencias internas con el protocolo "workspace:*" (pnpm), que npm no
 * entiende y rompería `npm install` aquí.
 */
export const VIBES_CORE = path.resolve(__dirname, "../vibes-core/packages");

export const vibesAliases: Record<string, string> = {
  // subpaths primero (más específicos)
  "@vibes/providers/sqlite": path.join(
    VIBES_CORE,
    "providers/src/sqlite/index.ts",
  ),
  "@vibes/providers/openai-compatible": path.join(
    VIBES_CORE,
    "providers/src/openai-compatible/index.ts",
  ),
  "@vibes/providers/openrouter": path.join(
    VIBES_CORE,
    "providers/src/openrouter/index.ts",
  ),
  // Subpath puro (sin side-effects de Node): el catálogo de tools. La UI
  // (renderer) lo importa directamente para labels/metadata sin arrastrar
  // los built-in (node:fs, node:path) al bundle del navegador.
  // IMPORTANTE: debe ir ANTES de "@vibes/tools" — Vite matchea por prefijo
  // y si "@vibes/tools" va primero resuelve a index.ts/catalog (ENOTDIR).
  "@vibes/tools/catalog": path.join(VIBES_CORE, "tools/src/catalog.ts"),
  "@vibes/runtime-impl": path.join(VIBES_CORE, "runtime-impl/src/index.ts"),
  "@vibes/runtime": path.join(VIBES_CORE, "runtime/src/index.ts"),
  "@vibes/shared": path.join(VIBES_CORE, "shared/src/index.ts"),
  "@vibes/tools": path.join(VIBES_CORE, "tools/src/index.ts"),
  "@vibes/workspace": path.join(VIBES_CORE, "workspace/src/index.ts"),
  "@vibes/bridge": path.join(VIBES_CORE, "bridge/src/index.ts"),
};
