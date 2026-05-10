/**
 * Vite config for the Web build (no Electron).
 *
 * Usage:
 *   npm run dev:web     — Vite dev server at :5173 with proxy to backend :3000
 *   npm run build:web   — Production build to dist/web/
 *
 * This is a standalone SPA build that proxies API calls to the backend.
 * The same React components are used — the only difference is the transport
 * layer (HTTP+Socket.io instead of Electron IPC).
 */
import path from "path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const ReactCompilerConfig = {};

export default defineConfig({
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
  define: {
    // Make sure Electron-specific code can be tree-shaken
    "process.versions.electron": "undefined",
  },
  server: {
    port: 5173,
    proxy: {
      // Backend API
      "/api": {
        target: "http://localhost:4800",
        changeOrigin: true,
      },
      // Socket.io (WebSocket upgrade)
      "/socket.io": {
        target: "http://localhost:4800",
        ws: true,
        changeOrigin: true,
      },
      // App preview proxy (WebSocket upgrade for HMR)
      "/preview": {
        target: "http://localhost:4800",
        ws: true,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist/web",
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return;

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
            [["socket.io-client"], "vendor-socketio"],
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
