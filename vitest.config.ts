import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

// B6: mismos aliases que vite.main.config.mts — los paquetes @vibes/* se
// consumen desde su fuente TypeScript (no hay dist hasta la Fase 5).
const VIBES_CORE = resolve(__dirname, "../vibes-core/packages");
const vibesAliases: Record<string, string> = {
  // subpaths primero (más específicos)
  "@vibes/providers/sqlite": resolve(VIBES_CORE, "providers/src/sqlite/index.ts"),
  "@vibes/providers/openai-compatible": resolve(VIBES_CORE, "providers/src/openai-compatible/index.ts"),
  "@vibes/providers/openrouter": resolve(VIBES_CORE, "providers/src/openrouter/index.ts"),
  "@vibes/runtime-impl": resolve(VIBES_CORE, "runtime-impl/src/index.ts"),
  "@vibes/runtime": resolve(VIBES_CORE, "runtime/src/index.ts"),
  "@vibes/shared": resolve(VIBES_CORE, "shared/src/index.ts"),
  // Subpath puro (sin side-effects de Node): el catálogo de tools, para la UI.
  // Va ANTES de @vibes/tools porque Vite hace match por prefijo.
  "@vibes/tools/catalog": resolve(VIBES_CORE, "tools/src/catalog.ts"),
  "@vibes/tools": resolve(VIBES_CORE, "tools/src/index.ts"),
  "@vibes/workspace": resolve(VIBES_CORE, "workspace/src/index.ts"),
  "@vibes/bridge": resolve(VIBES_CORE, "bridge/src/index.ts"),
};

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "happy-dom",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    globals: true,
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
      ...vibesAliases,
    },
  },
  server: {
    watch: {
      usePolling: false,
      ignored: ["**"], // Ignora todos los cambios de archivos
    },
  },
});
