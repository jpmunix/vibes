// Stub for @opencode-ai/sdk — used by the cloud server instead of the real ESM-only SDK.
// The real SDK can't be require()'d because it only exports ESM.
// In web/cloud mode we spawn OpenCode as a binary via OpenCodeManager.
module.exports = {
  createOpencode: () => ({ config: {}, session: {} }),
  createOpencodeClient: () => ({}),
};
