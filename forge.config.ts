import { windowsSign } from "./windowsSign";
import type { ForgeConfig } from "@electron-forge/shared-types";
import { MakerDeb } from "@electron-forge/maker-deb";
import { VitePlugin } from "@electron-forge/plugin-vite";
import { FusesPlugin } from "@electron-forge/plugin-fuses";
import { FuseV1Options, FuseVersion } from "@electron/fuses";
import { AutoUnpackNativesPlugin } from "@electron-forge/plugin-auto-unpack-natives";
import MakerZIP from "@electron-forge/maker-zip";

const ignore = (file: string) => {
  if (!file || file === "/") return false;

  if (
    file.includes("/node_modules/@img") ||
    file.includes("/node_modules/@xenova") ||
    file.includes("/node_modules/sharp") ||
    file.includes("/node_modules/styled-jsx") ||
    file.includes("/node_modules/geist")
  ) {
    return false;
  }

  if (file.includes("/node_modules/@xenova/transformers/node_modules")) {
    return true;
  }

  // 2. LISTA DE PERMITIDOS: Cosas que SIEMPRE deben estar en la app
  // Si el archivo empieza por alguna de estas rutas, devolvemos FALSE (NO ignorar)
  const allowedPaths = [
    "/node_modules",
    "/.vite",
    "/drizzle",
    "/scaffold",
    "/worker",
    "/assets", // Asegúrate de incluir tus iconos/recursos aquí
    "/package.json",
  ];

  if (allowedPaths.some((path) => file.startsWith(path))) {
    // Aquí puedes añadir excepciones si quieres borrar archivos pesados de node_modules
    // Por ejemplo: no queremos archivos .cpp o .h que solo sirven para compilar
    if (file.endsWith(".cpp") || file.endsWith(".h") || file.endsWith(".ts")) {
      // Pero ojo, no borres archivos .js o .node (los binarios)
      if (!file.includes("node_modules")) return true;
    }

    return false; // Se queda en la app
  }
};

const isEndToEndTestBuild = process.env.E2E_TEST_BUILD === "true";
const isGitHubActions = process.env.GITHUB_ACTIONS === "true";

const config: ForgeConfig = {
  packagerConfig: {
    windowsSign: isGitHubActions ? windowsSign : undefined,
    protocols: [
      {
        name: "Dyad",
        schemes: ["dyad"],
      },
    ],
    icon: "./assets/icon/logo",

    osxSign: undefined,
    osxNotarize: undefined,
    asar: {
      // Incluye todos los paquetes @img/* para soporte multiplataforma (Linux y macOS)
      // styled-jsx se desempaqueta para evitar problemas de Object.defineProperty en macOS ARM64
      unpack:
        "{**/node_modules/@img/**/*,**/node_modules/@xenova/**/*,**/node_modules/sharp/**/*,**/node_modules/color/**/*,**/node_modules/color-string/**/*,**/node_modules/color-name/**/*,**/node_modules/color-convert/**/*,**/node_modules/simple-swizzle/**/*,**/node_modules/better-sqlite3/**/*,**/node_modules/onnxruntime-node/**/*,**/node_modules/styled-jsx/**/*,**/node_modules/geist/**/*}",
    },
    ignore,
    afterPack: require("./scripts/afterPack").default,
    extraResource: [
      //   "node_modules/better-sqlite3",
      "node_modules/dugite/git",
      "node_modules/@vscode",
      "drizzle", //   "node_modules/@huggingface",
      //   "node_modules/sharp",
      //   "node_modules/color",
      //   "node_modules/color-string",
      //   "node_modules/color-name",
      //   "node_modules/color-convert",
      //   "node_modules/simple-swizzle",
      //   "node_modules/onnxruntime-web",
      //   "node_modules/onnxruntime-node"
    ],
    // ignore: [/node_modules\/(?!(better-sqlite3|bindings|file-uri-to-path)\/)/],
  },
  rebuildConfig: {
    extraModules: ["better-sqlite3", "onnxruntime-node", "sharp"],
    force: false,
  },
  makers: [
    // new MakerSquirrel(
    //   // @ts-expect-error - incorrect types exported by MakerSquirrel
    //   isGitHubActions
    //     ? {
    //         windowsSign,
    //         iconUrl:
    //           "https://raw.githubusercontent.com/dyad-sh/dyad/main/assets/icon/logo.ico",
    //         setupIcon: "./assets/icon/logo.ico",
    //       }
    //     : {
    //         iconUrl:
    //           "https://raw.githubusercontent.com/dyad-sh/dyad/main/assets/icon/logo.ico",
    //         setupIcon: "./assets/icon/logo.ico",
    //       },
    // ),
    new MakerZIP({}, ["darwin"]),
    // new MakerRpm({
    //   options: {
    //     icon: "./assets/icon/logo.png",
    //   },
    // }),
    new MakerDeb({
      options: {
        mimeType: ["x-scheme-handler/dyad"],
        icon: "./assets/icon/logo.png",
      },
    }),
    // new MakerAppImage({
    //   icon: "./assets/icon/logo.png",
    // }),
  ],
  publishers: [
    {
      name: "@electron-forge/publisher-github",
      config: {
        repository: {
          owner: "dyad-sh",
          name: "dyad",
        },
        draft: true,
        force: true,
        prerelease: true,
      },
    },
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: "src/main.ts",
          config: "vite.main.config.mts",
          target: "main",
        },
        {
          entry: "src/preload.ts",
          config: "vite.preload.config.mts",
          target: "preload",
        },
        {
          entry: "workers/tsc/tsc_worker.ts",
          config: "vite.worker.config.mts",
          target: "main",
        },
        {
          entry: "workers/context/context_worker.ts",
          config: "vite.context-worker.config.mts",
          target: "main",
        },
        {
          entry: "workers/embeddings/embeddings_worker.ts",
          config: "vite.embeddings-worker.config.mts",
          target: "main",
        },
      ],
      renderer: [
        {
          name: "main_window",
          config: "vite.renderer.config.mts",
        },
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: isEndToEndTestBuild,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
