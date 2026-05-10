// ESM loader hooks — intercept electron, electron-log, and ESM-only packages.
// This runs at the Node.js module resolution level, before any code executes.

const SHIMMED = new Set(["electron", "electron-log"]);

const ELECTRON_SRC = `
if (!globalThis.__vibesIpcRegistry) globalThis.__vibesIpcRegistry = new Map();
import path from "node:path";
export const ipcMain = {
  handle(ch, fn) { globalThis.__vibesIpcRegistry.set(ch, fn); },
  removeHandler(ch) { globalThis.__vibesIpcRegistry.delete(ch); },
};
export const app = {
  getPath(n) {
    if (n==="userData") return process.env.VIBES_USER_DATA||path.resolve("./userData");
    if (n==="sessionData") return process.env.VIBES_SESSION_DATA||path.resolve("./sessionData");
    return path.resolve("./"+n);
  },
  getVersion:()=>"1.0.0-cloud", isReady:()=>true, getName:()=>"Vibes",
  isPackaged:false, quit(){}, relaunch(){}, on(){},
};
export const dialog = {
  showOpenDialog:async()=>({canceled:true,filePaths:[]}),
  showMessageBox:async()=>({response:0}),
  showErrorBox(){},
};
export const shell = { openPath:async()=>"", openExternal:async()=>{}, showItemInFolder(){} };
export const BrowserWindow = { getAllWindows:()=>[], fromWebContents:()=>null };
export const Menu = { buildFromTemplate:()=>({}) };
export const safeStorage = {
  isEncryptionAvailable:()=>false,
  encryptString:(s)=>Buffer.from(s),
  decryptString:(b)=>b.toString(),
};
export const nativeTheme = { themeSource:"system", shouldUseDarkColors:true };
export default { ipcMain,app,dialog,shell,BrowserWindow,Menu,safeStorage,nativeTheme };
`;

const ELECTRON_LOG_SRC = `
const mk=()=>{const l={scope:()=>l,info:console.log,warn:console.warn,
error:console.error,debug:console.debug,log:console.log,verbose(){},silly(){},
transports:{file:{level:false},console:{level:false}}};return l;};
const log=mk(); export default log;
`;

// Stub for @opencode-ai/sdk — ESM-only package that can't be require()'d.
// In web mode we use OpenCodeManager (spawns binary) instead of the SDK.
const OPENCODE_SDK_SRC = `
export function createOpencode() { return { config:{}, session:{} }; }
export function createOpencodeClient() { return {}; }
export default { createOpencode, createOpencodeClient };
`;

export function resolve(specifier, context, nextResolve) {
  if (SHIMMED.has(specifier)) {
    return { url: "vibes-shim://" + specifier, shortCircuit: true };
  }
  // Intercept @opencode-ai/sdk and any sub-paths
  if (specifier === "@opencode-ai/sdk" || specifier.startsWith("@opencode-ai/sdk/")) {
    return { url: "vibes-shim://opencode-sdk", shortCircuit: true };
  }
  return nextResolve(specifier, context);
}

export function load(url, context, nextLoad) {
  if (url === "vibes-shim://electron") {
    return { format: "module", source: ELECTRON_SRC, shortCircuit: true };
  }
  if (url === "vibes-shim://electron-log") {
    return { format: "module", source: ELECTRON_LOG_SRC, shortCircuit: true };
  }
  if (url === "vibes-shim://opencode-sdk") {
    return { format: "module", source: OPENCODE_SDK_SRC, shortCircuit: true };
  }
  return nextLoad(url, context);
}
