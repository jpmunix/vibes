import { defineConfig } from "vite";
import path from "path";

// https://vitejs.dev/config
//
// W1 (Fase 1): aliases para consumir el runtime vibes-core desde su fuente
// TypeScript. Los paquetes @vibes/* exportan "./src/index.ts" como main
// (no hay dist hasta la Fase 5), así que los apuntamos directamente.
// No usamos deps "file:" en package.json porque vibes-core declara sus
// dependencias internas con el protocolo "workspace:*" (pnpm), que npm no
// entiende y rompería `npm install` aquí.
const VIBES_CORE = path.resolve(__dirname, "../vibes-core/packages");
const vibesAliases: Record<string, string> = {
  // subpaths primero (más específicos)
  "@vibes/providers/sqlite": path.join(VIBES_CORE, "providers/src/sqlite/index.ts"),
  "@vibes/providers/openai-compatible": path.join(VIBES_CORE, "providers/src/openai-compatible/index.ts"),
  "@vibes/providers/openrouter": path.join(VIBES_CORE, "providers/src/openrouter/index.ts"),
  "@vibes/runtime-impl": path.join(VIBES_CORE, "runtime-impl/src/index.ts"),
  "@vibes/runtime": path.join(VIBES_CORE, "runtime/src/index.ts"),
  "@vibes/shared": path.join(VIBES_CORE, "shared/src/index.ts"),
  "@vibes/tools": path.join(VIBES_CORE, "tools/src/index.ts"),
  "@vibes/workspace": path.join(VIBES_CORE, "workspace/src/index.ts"),
  "@vibes/bridge": path.join(VIBES_CORE, "bridge/src/index.ts"),
};

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      ...vibesAliases,
    },
  },
  build: {
    minify: true,
    sourcemap: true, // Te ayudará a ver errores reales en la consola
    rollupOptions: {
      external: [
        "better-sqlite3",
        "@huggingface/jinja",
        "sharp",
        "semver",
        "bindings",
        "file-uri-to-path",
        "@mapbox/node-pre-gyp",
        "detect-libc",
        "prebuild-install",
        // Externalize AST tools to avoid bundling issues
        "recast",
        "ast-types",
        "@babel/parser",
        "@babel/traverse",
        "@babel/types",
        // Externalize libSQL native bindings (Bunny Edge SQL)
        "@libsql/client",
        "@libsql/linux-x64-gnu",
        "@libsql/linux-x64-musl",
        "@libsql/darwin-arm64",
        "@libsql/darwin-x64",
        "@libsql/win32-x64-msvc",
      ],
    },
  },
  plugins: [
    {
      name: "restart",
      closeBundle() {
        // Prevent auto-restarts on backend file changes so AI/developer doesn't get interrupted.
        // The developer can type 'rs' in the terminal manually to restart the backend.
        console.log(
          '\n[Backend Modificado] 🛠️ Backend actualizado. Escribe "rs" en esta terminal y presiona ENTER para reiniciar Electron de forma manual.\n',
        );
      },
    },
  ],
});
