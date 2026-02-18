import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    minify: false,
    sourcemap: true,
    lib: {
      entry: path.resolve(__dirname, "workers/context/context_worker.ts"),
      name: "context_worker",
      fileName: "context_worker",
      formats: ["cjs"],
    },
    rollupOptions: {
      external: [
        "node:worker_threads",
        "node:fs",
        "node:fs/promises",
        "node:path",
        "electron",
        "electron-log",
        "glob",
        "@huggingface/jinja",
        "sharp",
        // Linux
        "@img/sharp-linux-x64",
        "@img/sharp-libvips-linux-x64",
        // macOS
        "@img/sharp-darwin-x64",
        "@img/sharp-libvips-darwin-x64",
        "@img/sharp-darwin-arm64",
        "@img/sharp-libvips-darwin-arm64",
      ],
    },
  },
});
