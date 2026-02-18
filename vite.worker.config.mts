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
};

// Electron Forge VitePlugin calls this config multiple times with different entries
// We use a function config to detect which worker is being built
export default defineConfig(() => {
  // Default to tsc_worker if not specified
  const entry = process.env.VITE_WORKER_ENTRY || "workers/tsc/tsc_worker.ts";
  const workerName = entry.includes("context_worker")
    ? "context_worker"
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
      minify: false,
      lib: {
        entry: path.resolve(__dirname, entry),
        name: workerName,
        fileName: () => `${workerName}.js`,
        formats: ["cjs"],
      },
      rollupOptions: {
        external,
        output: {
          entryFileNames: `[name].js`,
        },
      },
      emptyOutDir: false,
    },
  };
});
