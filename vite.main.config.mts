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
    rollupOptions: {
      external: [
        "better-sqlite3",
        "onnxruntime-node",
        "onnxruntime-common",
        "sharp",
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
