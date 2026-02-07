import { defineConfig } from "vite";
import path from "path";

// Configuration for different workers
const workersConfig: Record<string, string[]> = {
  tsc_worker: ["node:fs", "node:path", "node:worker_threads", "typescript"],
  context_worker: [
    "node:fs",
    "node:fs/promises",
    "node:path",
    "node:worker_threads",
    "electron-log",
    "glob",
    "onnxruntime-node",
    "@xenova/transformers",
  ],
  embeddings_worker: [
    "node:worker_threads",
    "electron-log",
    "onnxruntime-node",
    "@xenova/transformers",
  ],
};

// Electron Forge VitePlugin calls this config multiple times with different entries
// We use a function config to detect which worker is being built
export default defineConfig(() => {
  // Default to tsc_worker if not specified
  const entry = process.env.VITE_WORKER_ENTRY || "workers/tsc/tsc_worker.ts";
  const workerName = entry.includes("context_worker")
    ? "context_worker"
    : entry.includes("embeddings_worker")
      ? "embeddings_worker"
      : "tsc_worker";
  const external = workersConfig[workerName] || [];

  return {
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    build: {
      sourcemap: true,
      lib: {
        entry: path.resolve(__dirname, entry),
        name: workerName,
        fileName: workerName,
        formats: ["cjs"],
      },
      rollupOptions: {
        external,
      },
    },
  };
});
