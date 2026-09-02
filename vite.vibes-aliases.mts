import path from "path";
import fs from "fs";

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
 *
/**
 * Paquetes requeridos para considerar válido un directorio de packages de vibes-core.
 */
export const REQUIRED_VIBES_PACKAGES = [
  "shared",
  "runtime",
  "runtime-impl",
  "tools",
  "workspace",
  "bridge",
  "providers",
] as const;

/**
 * Normaliza y valida un directorio candidato a packages de vibes-core.
 */
export function isValidVibesCorePackages(dirPath: string): boolean {
  if (!fs.existsSync(dirPath)) return false;
  return REQUIRED_VIBES_PACKAGES.every((pkg) =>
    fs.existsSync(path.join(dirPath, pkg, "package.json")),
  );
}

/**
 * Resuelve la ruta al directorio `packages` de vibes-core con resolución en cascada:
 *   1. `VIBES_CORE_DIR` (env) — acepta tanto raíz de vibes-core como subdirectorio packages.
 *   2. `../core/packages` — estructura contenedor: /vibes-<card>/{vibes,core}.
 *   3. `../vibes-core/packages` — estructura plana / repo principal.
 */
export function resolveVibesCore(
  baseDir: string = __dirname,
  envCoreDir: string | undefined = process.env.VIBES_CORE_DIR,
): string {
  const candidates: string[] = [];

  if (envCoreDir) {
    const resolvedEnv = path.resolve(baseDir, envCoreDir);
    // Si apuntaron a la raíz de vibes-core en vez de packages:
    if (path.basename(resolvedEnv) !== "packages") {
      candidates.push(path.join(resolvedEnv, "packages"));
    }
    candidates.push(resolvedEnv);
  }

  candidates.push(path.resolve(baseDir, "../core/packages"));
  candidates.push(path.resolve(baseDir, "../vibes-core/packages"));

  for (const candidate of candidates) {
    if (isValidVibesCorePackages(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `[resolveVibesCore] No se pudo encontrar un árbol válido de @vibes/* (packages con [${REQUIRED_VIBES_PACKAGES.join(
      ", ",
    )}]). ` +
      `Candidatos comprobados:\n${candidates.map((c) => ` - ${c}`).join("\n")}`,
  );
}

export const VIBES_CORE = resolveVibesCore();

export const vibesAliases: Record<string, string> = {
  // subpaths primero (más específicos)
  "@vibes/providers/sqlite": path.join(
    VIBES_CORE,
    "providers/src/sqlite/index.ts",
  ),
  "@vibes/providers/libsql": path.join(
    VIBES_CORE,
    "providers/src/libsql/index.ts",
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
