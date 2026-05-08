import path from "path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const ReactCompilerConfig = {};

// https://vite.dev/config/
export default defineConfig({
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
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
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

            [["lexical", "@lexical/", "lexical-beautiful-mentions"], "vendor-lexical"],
            [["konva", "react-konva"], "vendor-konva"],
            [["firebase", "@firebase/"], "vendor-firebase"],
            [["react-markdown", "remark-gfm"], "vendor-markdown"],
            [["@tanstack/react-query", "@tanstack/react-router"], "vendor-tanstack"],
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
