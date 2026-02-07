import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    minify: false, // Desactiva la minificación de nombres de variables
    sourcemap: true, // Te ayudará a ver errores reales en la consola
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
