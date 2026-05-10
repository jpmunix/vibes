// CJS stub for electron — used when handlers require("electron") in CJS mode.
const path = require("node:path");

if (!globalThis.__vibesIpcRegistry) globalThis.__vibesIpcRegistry = new Map();

const ipcMain = {
  handle(ch, fn) { globalThis.__vibesIpcRegistry.set(ch, fn); },
  removeHandler(ch) { globalThis.__vibesIpcRegistry.delete(ch); },
  on() { return ipcMain; },
  once() { return ipcMain; },
  removeListener() { return ipcMain; },
  removeAllListeners() { return ipcMain; },
};

const app = {
  getPath(n) {
    if (n === "userData") return process.env.VIBES_USER_DATA || path.resolve("./userData");
    if (n === "sessionData") return process.env.VIBES_SESSION_DATA || path.resolve("./sessionData");
    return path.resolve("./" + n);
  },
  getVersion: () => "1.0.0-cloud",
  isReady: () => true,
  getName: () => "Vibes",
  isPackaged: false,
  quit() {},
  relaunch() {},
  on() {},
};

module.exports = {
  ipcMain,
  app,
  dialog: {
    showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
    showMessageBox: async () => ({ response: 0 }),
    showErrorBox() {},
  },
  shell: { openPath: async () => "", openExternal: async () => {}, showItemInFolder() {} },
  BrowserWindow: { getAllWindows: () => [], fromWebContents: () => null },
  Menu: { buildFromTemplate: () => ({}) },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (s) => Buffer.from(s),
    decryptString: (b) => b.toString(),
  },
  nativeTheme: { themeSource: "system", shouldUseDarkColors: true },
};
