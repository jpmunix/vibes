// Bridge CJS → ESM for @opencode-ai/sdk.
// tsx transpiles `import { createOpencode } from "@opencode-ai/sdk"` to require(),
// but the SDK only provides ESM exports. We load the real SDK via dynamic import()
// which goes through the ESM resolver (no longer shimmed in hooks.mjs).
//
// The consuming code always awaits: `await createOpencode(...)`, so the lazy
// resolution is transparent.

let _sdk = null;
const _ready = import("@opencode-ai/sdk").then((m) => {
  _sdk = m;
}).catch((err) => {
  console.error("[opencode-sdk shim] Failed to load real SDK:", err.message);
});

// Lazy wrappers — each awaits the import before forwarding
async function createOpencode(...args) {
  await _ready;
  if (!_sdk?.createOpencode) throw new Error("@opencode-ai/sdk failed to load");
  return _sdk.createOpencode(...args);
}

function createOpencodeClient(...args) {
  if (!_sdk?.createOpencodeClient) {
    throw new Error("@opencode-ai/sdk not loaded yet — call createOpencode first");
  }
  return _sdk.createOpencodeClient(...args);
}

module.exports = { createOpencode, createOpencodeClient };
module.exports.default = module.exports;
