import { defineConfig } from "vite";
import path from "path";

// https://vitejs.dev/config
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    minify: false, // Desactiva la minificación de nombres de variables
    sourcemap: true, // Te ayudará a ver errores reales en la consola
    rollupOptions: {
      external: [
        "better-sqlite3",
        "onnxruntime-web",
        "onnxruntime-node",
        "onnxruntime-common",
        '@xenova/transformers',
        '@huggingface/jinja',
        "sharp",
        "semver",
        "bindings",
        "file-uri-to-path",
        "@mapbox/node-pre-gyp",
        "detect-libc",
        "prebuild-install",
      ],
    },
  },
  plugins: [
    {
      name: "restart",
      closeBundle() {
        process.stdin.emit("data", "rs");
      },
    },
  ],
});
