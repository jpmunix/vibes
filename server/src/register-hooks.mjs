// Register ESM loader hooks for electron/electron-log (handles ESM import)
import { register } from "node:module";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
register("./hooks.mjs", import.meta.url);

// Patch CJS Module._resolveFilename for packages that need shimming in CJS mode.
// This is needed because tsx loads handler .ts files as CJS (root has no "type":"module"),
// and their `import x from "electron"` gets transpiled to `require("electron")`.
const require = createRequire(import.meta.url);
const Module = require("node:module");
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CJS_SHIM_MAP = {
  "electron": path.resolve(__dirname, "shims/electron.cjs"),
  "electron-log": path.resolve(__dirname, "shims/electron-log.cjs"),
  "@opencode-ai/sdk": path.resolve(__dirname, "shims/opencode-sdk.cjs"),
};

const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  // Skip shimming when the shim itself is doing the import (avoid circular)
  const parentFile = parent?.filename || "";
  if (parentFile.includes("opencode-sdk.cjs") && (request === "@opencode-ai/sdk" || request.startsWith("@opencode-ai/sdk/"))) {
    return origResolve.call(this, request, parent, isMain, options);
  }
  // Exact match
  if (CJS_SHIM_MAP[request]) return CJS_SHIM_MAP[request];
  // Sub-path match for @opencode-ai/sdk/*
  if (request.startsWith("@opencode-ai/sdk/")) return CJS_SHIM_MAP["@opencode-ai/sdk"];
  return origResolve.call(this, request, parent, isMain, options);
};
