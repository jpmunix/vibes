import type { ForgeConfig } from "@electron-forge/shared-types";
import { MakerDeb } from "@electron-forge/maker-deb";
import { VitePlugin } from "@electron-forge/plugin-vite";
import { FusesPlugin } from "@electron-forge/plugin-fuses";
import { FuseV1Options, FuseVersion } from "@electron/fuses";
import { AutoUnpackNativesPlugin } from "@electron-forge/plugin-auto-unpack-natives";
import MakerZIP from "@electron-forge/maker-zip";

const ignore = (file: string): boolean => {
  if (!file || file === "/") return false;

  // ─── SCAFFOLD: BLINDADO ───────────────────────────────────────────────
  // Los scaffolds son las plantillas que se copian a cada app nueva.
  // Se incluye TODO excepto node_modules y .git (regenerables).
  // IMPORTANTE: este bloque va ANTES de cualquier regla de extensión
  // para que nunca se filtren archivos críticos (.ts, .mts, etc.).
  if (
    file.startsWith("/scaffold") ||
    file.startsWith("/scaffold-vue") ||
    file.startsWith("/scaffold-astro") ||
    file.startsWith("/scaffold-svelte")
  ) {
    if (
      file.includes("/node_modules") ||
      file.includes("/.git")
    ) {
      return true; // Ignorar: regenerable
    }
    return false; // Incluir: es parte de la plantilla
  }

  if (
    file.includes("/node_modules/styled-jsx") ||
    file.includes("/node_modules/geist")
  ) {
    return false;
  }

  // Ignore date-fns/fp (1500+ unused files, functional programming API)
  // Prevents ENOTEMPTY race condition in electron-packager
  if (file.includes("/node_modules/date-fns/fp")) {
    return true;
  }

  // 2. LISTA DE PERMITIDOS: Cosas que SIEMPRE deben estar en la app
  // Si el archivo empieza por alguna de estas rutas, devolvemos FALSE (NO ignorar)
  const allowedPaths = [
    "/node_modules",
    "/.vite",
    "/worker",
    "/assets",
    "/package.json",
  ];

  if (allowedPaths.some((path) => file.startsWith(path))) {
    // No queremos archivos .cpp o .h que solo sirven para compilar
    if (file.endsWith(".cpp") || file.endsWith(".h") || file.endsWith(".ts")) {
      if (!file.includes("node_modules")) return true;
    }

    return false; // Se queda en la app
  }

  // Cualquier archivo fuera de las rutas permitidas se ignora
  return true;
};

const isEndToEndTestBuild = process.env.E2E_TEST_BUILD === "true";
// FusesPlugin cannot flip fuses on a foreign-platform Electron binary.
// Set CROSS_COMPILE=true when building for a different OS (e.g. darwin from linux).
const isCrossCompile = process.env.CROSS_COMPILE === "true";

// ─── Build Profile ───────────────────────────────────────────────────────
// VIBES_PROFILE=vibes → standalone "Vibes" app (can run alongside minube-vibes)
const isVibesProfile = process.env.VIBES_PROFILE === "vibes";

const config: ForgeConfig = {
  packagerConfig: {
    name: isVibesProfile ? "vibes" : undefined,
    executableName: isVibesProfile ? "vibes" : undefined,
    protocols: [
      {
        name: "Vibes",
        schemes: ["dyad"],
      },
    ],
    icon: isVibesProfile ? "./assets/icon-vibes/logo" : "./assets/icon/logo",
    asar: {
      // styled-jsx y geist se desempaquetan para evitar problemas de Object.defineProperty en macOS ARM64
      unpack:
        "{**/node_modules/styled-jsx/**/*,**/node_modules/geist/**/*}",
    },
    ignore,
    afterPack: require("./scripts/afterPack").default,
    extraResource: [
      "node_modules/dugite/git",
      "node_modules/@vscode",
    ],
  },
  rebuildConfig: {},
  makers: [
    new MakerZIP({}, ["darwin"]),
    new MakerDeb({
      options: {
        name: isVibesProfile ? "vibes" : undefined,
        productName: isVibesProfile ? "Vibes" : undefined,
        mimeType: ["x-scheme-handler/dyad"],
        icon: isVibesProfile ? "./assets/icon-vibes/logo.png" : "./assets/icon/logo.png",
      },
    }),
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
      ],
      renderer: [
        {
          name: "main_window",
          config: "vite.renderer.config.mts",
        },
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application.
    // Skipped during cross-compilation because flipFuses cannot read
    // a foreign-platform Electron binary.
    ...(isCrossCompile
      ? []
      : [
          new FusesPlugin({
            version: FuseVersion.V1,
            [FuseV1Options.RunAsNode]: false,
            [FuseV1Options.EnableCookieEncryption]: true,
            [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
            [FuseV1Options.EnableNodeCliInspectArguments]: isEndToEndTestBuild,
            [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
            [FuseV1Options.OnlyLoadAppFromAsar]: true,
          }),
        ]),
  ],
};

export default config;
