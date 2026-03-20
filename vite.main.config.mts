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
    minify: true,
    sourcemap: true, // Te ayudará a ver errores reales en la consola
    rollupOptions: {
      external: [
        "better-sqlite3",
        "@huggingface/jinja",
        "sharp",
        "semver",
        "bindings",
        "file-uri-to-path",
        "@mapbox/node-pre-gyp",
        "detect-libc",
        "prebuild-install",
        // Externalize AST tools to avoid bundling issues
        "recast",
        "ast-types",
        "@babel/parser",
        "@babel/traverse",
        "@babel/types",
        // Externalize libSQL native bindings (Bunny Edge SQL)
        "@libsql/client",
        "@libsql/linux-x64-gnu",
        "@libsql/linux-x64-musl",
        "@libsql/darwin-arm64",
        "@libsql/darwin-x64",
        "@libsql/win32-x64-msvc",
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
