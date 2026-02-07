import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    sourcemap: true,
    lib: {
      entry: path.resolve(__dirname, "workers/embeddings/embeddings_worker.ts"),
      name: "embeddings_worker",
      fileName: "embeddings_worker",
      formats: ["cjs"],
    },
    rollupOptions: {
      external: [
        "node:worker_threads",
        "electron",
        "electron-log",
        "onnxruntime-node",
        "@xenova/transformers",
      ],
    },
  },
});
