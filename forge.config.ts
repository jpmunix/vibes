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
    file.startsWith("/scaffold-svelte") ||
    file.startsWith("/scaffold-tools")
  ) {
    if (
      file.includes("/node_modules") ||
      file.includes("/.git")
    ) {
      return true; // Ignorar: regenerable
    }
    return false; // Incluir: es parte de la plantilla
  }

  // styled-jsx y geist se desempaquetan para macOS ARM64 — SIEMPRE incluir
  if (
    file.includes("/node_modules/styled-jsx") ||
    file.includes("/node_modules/geist")
  ) {
    return false;
  }

  // ─── NODE_MODULES: FILTRO PESADO ──────────────────────────────────────
  // Antes se incluía TODO node_modules (~5 GB, 224K archivos).
  // Ahora se excluyen directorios ocultos, devDependencies y fuentes C++.
  if (file.startsWith("/node_modules")) {
    // 1. Directorios ocultos: caché de pnpm/vite/etc (~2.7 GB, 130K archivos)
    //    .pnpm (1.4 GB), .ignored (1.0 GB), .vite (276 MB), .cache, etc.
    if (file.startsWith("/node_modules/.")) {
      return true;
    }

    // 2. date-fns/fp: 1500+ archivos de API funcional no usada
    //    También previene race condition ENOTEMPTY en electron-packager
    if (file.includes("/date-fns/fp")) {
      return true;
    }

    // 3. devDependencies: nunca se necesitan en runtime (~400 MB)
    //    Estos paquetes son herramientas de build, test o lint.
    //    electron-packager incluye su propia copia de Electron.
    const devOnlyPackages = [
      "electron/",
      "@electron-forge/",
      "@electron/fuses/",
      "@playwright/",
      "@types/",
      "@typescript-eslint/",
      "@typescript/",
      "@vitest/",
      "babel-plugin-react-compiler/",
      "drizzle-kit/",
      "eslint/",
      "eslint-plugin-import/",
      "happy-dom/",
      "husky/",
      "lint-staged/",
      "oxfmt/",
      "@oxfmt/",
      "oxlint/",
      "@oxlint/",
      "@oxlint-darwin/",
      "@oxlint-linux/",
      "@oxlint-win32/",
      "@oxc-resolver/",
      "rimraf/",
      "typescript/",
      "vitest/",
      "vite/",
    ];

    for (const pkg of devOnlyPackages) {
      if (file.startsWith(`/node_modules/${pkg}`)) {
        return true;
      }
    }

    // 4. Fuentes C++ / headers — solo sirven para compilar nativos
    if (file.endsWith(".cpp") || file.endsWith(".h")) {
      return true;
    }

    return false; // Dependencia de producción → incluir
  }

  // ─── RUTAS RAÍZ PERMITIDAS ────────────────────────────────────────────
  const allowedPaths = [
    "/.vite",
    "/worker",
    "/assets",
    "/package.json",
  ];

  if (allowedPaths.some((path) => file.startsWith(path))) {
    // Excluir fuentes .ts del worker (ya compilados en .vite/build)
    if (file.endsWith(".ts") && !file.endsWith(".d.ts")) {
      return true;
    }
    return false;
  }

  // Cualquier archivo fuera de las rutas permitidas se ignora
  return true;
};

const isEndToEndTestBuild = process.env.E2E_TEST_BUILD === "true";
// FusesPlugin cannot flip fuses on a foreign-platform Electron binary.
// Set CROSS_COMPILE=true when building for a different OS (e.g. darwin from linux).
const isCrossCompile = process.env.CROSS_COMPILE === "true";

// ─── Build Profile ───────────────────────────────────────────────────────
import { getActiveFlavor } from "./src/flavors";

const activeFlavor = getActiveFlavor();

const config: ForgeConfig = {
  packagerConfig: {
    name: activeFlavor.name,
    executableName: activeFlavor.executableName,
    protocols: [
      {
        name: activeFlavor.productName,
        schemes: ["dyad"],
      },
    ],
    icon: `./assets/${activeFlavor.iconFolder}/logo`,
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
  rebuildConfig: {
    onlyModules: [],
  },
  makers: [
    new MakerZIP({}, ["darwin"]),
    new MakerDeb({
      options: {
        name: activeFlavor.name,
        productName: activeFlavor.productName,
        mimeType: ["x-scheme-handler/dyad"],
        icon: `./assets/${activeFlavor.iconFolder}/logo.png`,
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
