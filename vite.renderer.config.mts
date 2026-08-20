import path from "path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig, type PluginOption } from "vite";
import { vibesAliases } from "./vite.vibes-aliases.mts";

// Bundle analysis: se activa con ANALYZE=1 (npm run build:analyze).
// Genera dist/renderer-stats.html (treemap interactivo, gzip incluido).
const ANALYZE = process.env.ANALYZE === "1";

const ReactCompilerConfig = {};

// https://vite.dev/config/
export default defineConfig({
  define: {
    "import.meta.env.VITE_APP_FLAVOR": JSON.stringify(
      process.env.VIBES_FLAVOR || "default",
    ),
  },
  server: {
    // HMR enabled for faster development iteration.
  },
  plugins: [
    react({
      babel: {
        plugins: [["babel-plugin-react-compiler", ReactCompilerConfig]],
      },
    }),
    tailwindcss(),
    // Debe ir el último para ver todos los tamaños tras los transforms.
    ...(ANALYZE
      ? [
          visualizer({
            filename: "dist/renderer-stats.html",
            title: "Vibes renderer bundle",
            template: "treemap",
            gzipSize: true,
          }) as PluginOption,
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // El crawler de optimizeDeps del dev server escanea TODO src/ y, al
      // encontrarse los imports @vibes/* en src/ipc/runtime/*.ts, los resuelve
      // con ESTOS aliases. Sin ellos, un re-scan (p. ej. al cambiar
      // package-lock.json) lanza "could not be resolved".
      ...vibesAliases,
    },
  },
  optimizeDeps: {
    // Forzamos a Vite a no pre-bundlear los imports @vibes/* — viven en
    // el repo hermano (vibes-core) y se sirven como TS source. Si el
    // optimizeDeps los mete en el prebundle, los imports @vibes/tools/catalog
    // (subpath puro) y otros no resuelven porque el alias no llega al
    // análisis de imports pre-empaquetado.
    exclude: [
      "@vibes/tools",
      "@vibes/tools/catalog",
      "@vibes/shared",
      "@vibes/runtime",
      "@vibes/runtime-impl",
      "@vibes/workspace",
      "@vibes/bridge",
      "@vibes/providers/sqlite",
      "@vibes/providers/openai-compatible",
      "@vibes/providers/openrouter",
    ],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return;

          // Map of node_modules path patterns to chunk names
          const chunkGroups: [string[], string][] = [
            [["react-dom", "react/"], "vendor-react"],
            [["monaco-editor", "@monaco-editor/"], "vendor-editor"],
            [["shiki", "react-shiki"], "vendor-shiki"],
            [["framer-motion"], "vendor-motion"],

            [
              ["lexical", "@lexical/", "lexical-beautiful-mentions"],
              "vendor-lexical",
            ],
            [["konva", "react-konva"], "vendor-konva"],
            [["firebase", "@firebase/"], "vendor-firebase"],
            [["react-markdown", "remark-gfm"], "vendor-markdown"],
            [
              ["@tanstack/react-query", "@tanstack/react-router"],
              "vendor-tanstack",
            ],
            [["@radix-ui/"], "vendor-radix"],
            [["ai/", "@ai-sdk/"], "vendor-ai"],
          ];

          for (const [patterns, chunkName] of chunkGroups) {
            if (patterns.some((p) => id.includes(`node_modules/${p}`))) {
              return chunkName;
            }
          }
        },
      },
    },
  },
});
