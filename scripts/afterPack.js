const fs = require("fs");
const path = require("path");

/**
 * afterPack hook para Electron Forge
 * Copia las librerías nativas de Sharp, @xenova/transformers, better-sqlite3 y otros
 * paquetes con dependencias nativas al bundle de macOS
 * para evitar errores de "Cannot find module" o "Library not loaded" en runtime
 */
exports.default = async function afterPack(context) {
  const { electronPlatformName, appOutDir, arch } = context;

  // Linux: fix executable permissions for dugite git binary
  if (electronPlatformName === "linux") {
    await fixLinuxGitPermissions(appOutDir);
    return;
  }

  // Solo ejecutar para macOS (Sharp, @xenova, etc.)
  if (electronPlatformName !== "darwin") {
    console.log(`[afterPack] Skipping platform-specific fixes for ${electronPlatformName}`);
    return;
  }

  console.log(`[afterPack] Running Sharp library fix for macOS ${arch}`);

  // Determinar la arquitectura correcta de Sharp
  const sharpArch = arch === "arm64" ? "arm64" : "x64";
  const sharpPlatform = `darwin-${sharpArch}`;

  try {
    // Rutas dentro del app bundle
    const appPath = path.join(appOutDir, "minube-vibes.app");
    const resourcesPath = path.join(appPath, "Contents", "Resources");
    const asarUnpackedPath = path.join(resourcesPath, "app.asar.unpacked");

    // Ruta de Sharp en node_modules dentro del bundle
    const sharpInBundle = path.join(asarUnpackedPath, "node_modules", "sharp");

    // También verificar Sharp dentro de @xenova/transformers
    const sharpInXenova = path.join(
      asarUnpackedPath,
      "node_modules",
      "@xenova",
      "transformers",
      "node_modules",
      "sharp",
    );

    // Buscar Sharp en el sistema de archivos local (donde se hizo npm install)
    const localNodeModules = path.join(process.cwd(), "node_modules");
    const sharpLocalPaths = [
      path.join(localNodeModules, "sharp"),
      path.join(
        localNodeModules,
        "@xenova",
        "transformers",
        "node_modules",
        "sharp",
      ),
      // También buscar en node_modules/@img si existen
      path.join(localNodeModules, "@img", `sharp-${sharpPlatform}`),
      path.join(localNodeModules, "@img", `sharp-libvips-${sharpPlatform}`),
    ];

    // Encontrar el Sharp local que tenga vendor/
    let sourceSharpPath = null;
    let sourceVendorPath = null;

    console.log(
      `[afterPack] Searching for Sharp with platform: ${sharpPlatform}`,
    );

    for (const sharpPath of sharpLocalPaths) {
      console.log(`[afterPack] Checking: ${sharpPath}`);
      if (fs.existsSync(sharpPath)) {
        const vendorPath = path.join(sharpPath, "vendor");
        if (fs.existsSync(vendorPath)) {
          sourceSharpPath = sharpPath;
          sourceVendorPath = vendorPath;
          console.log(`[afterPack] ✓ Found Sharp vendor at: ${sharpPath}`);
          break;
        } else {
          console.log(`[afterPack]   Sharp exists but no vendor/ subdirectory`);
        }
      } else {
        console.log(`[afterPack]   Path does not exist`);
      }
    }

    // Si no encontramos vendor/, buscar recursivamente en node_modules
    if (!sourceVendorPath) {
      console.log(
        "[afterPack] Vendor not found in expected paths, searching recursively...",
      );
      const { execSync } = require("child_process");
      try {
        const findResult = execSync(
          `find "${localNodeModules}" -path "*/sharp/vendor" -type d 2>/dev/null | head -1`,
          { encoding: "utf-8" },
        ).trim();

        if (findResult) {
          sourceVendorPath = findResult;
          sourceSharpPath = path.dirname(findResult);
          console.log(
            `[afterPack] ✓ Found Sharp vendor via recursive search: ${sourceVendorPath}`,
          );
        }
      } catch (err) {
        console.log(`[afterPack] Recursive search failed: ${err.message}`);
      }
    }

    if (!sourceVendorPath) {
      console.error(
        "[afterPack] ERROR: Could not find Sharp vendor directory anywhere",
      );
      console.error("[afterPack] Searched paths:", sharpLocalPaths);
      console.error("[afterPack] Platform:", sharpPlatform);
      console.error("[afterPack] Arch:", arch);

      // Listar lo que SÍ existe en node_modules/sharp para debug
      const mainSharp = path.join(localNodeModules, "sharp");
      if (fs.existsSync(mainSharp)) {
        console.error("[afterPack] Contents of node_modules/sharp:");
        try {
          const contents = fs.readdirSync(mainSharp);
          console.error(contents.join(", "));
        } catch {
          console.error("Could not read directory");
        }
      }

      throw new Error(
        `Sharp vendor directory not found. Expected platform: ${sharpPlatform}`,
      );
    }

    // Copiar vendor/ a ambas ubicaciones de Sharp en el bundle
    const targetPaths = [sharpInBundle, sharpInXenova].filter((p) =>
      fs.existsSync(p),
    );

    if (targetPaths.length === 0) {
      console.warn(
        "[afterPack] WARNING: No Sharp installations found in bundle",
      );
      return;
    }

    for (const targetSharp of targetPaths) {
      const sourceVendor = path.join(sourceSharpPath, "vendor");
      const targetVendor = path.join(targetSharp, "vendor");

      // Crear directorio vendor si no existe
      if (!fs.existsSync(targetVendor)) {
        fs.mkdirSync(targetVendor, { recursive: true });
      }

      // Copiar todos los archivos de vendor/
      console.log(
        `[afterPack] Copying vendor from ${sourceVendor} to ${targetVendor}`,
      );
      copyRecursiveSync(sourceVendor, targetVendor);

      // Verificar que se copiaron las librerías necesarias
      const expectedLib = path.join(
        targetVendor,
        "*",
        sharpPlatform,
        "lib",
        "libvips-cpp.42.dylib",
      );
      console.log(`[afterPack] Expected library path: ${expectedLib}`);
    }

    console.log("[afterPack] ✓ Sharp libraries copied successfully");

    // Copiar @xenova/transformers completo
    await copyTransformersPackage(asarUnpackedPath);

    // Copiar better-sqlite3 bindings
    await copySQLiteBindings(asarUnpackedPath);

    // Copiar onnxruntime-node bindings
    await copyOnnxRuntimeBindings(asarUnpackedPath);

    console.log("[afterPack] ✅ All native dependencies copied successfully");
  } catch (error) {
    console.error("[afterPack] ERROR copying native dependencies:", error);
    throw error;
  }
};

/**
 * Copia @xenova/transformers y verifica que todos sus archivos estén disponibles
 */
async function copyTransformersPackage(asarUnpackedPath) {
  console.log("[afterPack] Checking @xenova/transformers...");

  const transformersInBundle = path.join(
    asarUnpackedPath,
    "node_modules",
    "@xenova",
    "transformers",
  );

  if (!fs.existsSync(transformersInBundle)) {
    console.warn(
      "[afterPack] WARNING: @xenova/transformers not found in bundle",
    );
    return;
  }

  // Verificar que archivos críticos existan
  const criticalFiles = ["package.json", "src/transformers.js"];

  for (const file of criticalFiles) {
    const filePath = path.join(transformersInBundle, file);
    if (!fs.existsSync(filePath)) {
      console.error(
        `[afterPack] ERROR: Missing critical file in transformers: ${file}`,
      );
      throw new Error(`@xenova/transformers is incomplete: missing ${file}`);
    }
  }

  // Verificar que node_modules de transformers estén presentes (incluyendo sharp)
  const transformersNodeModules = path.join(
    transformersInBundle,
    "node_modules",
  );
  if (fs.existsSync(transformersNodeModules)) {
    console.log("[afterPack] ✓ @xenova/transformers node_modules found");

    // Listar subdependencias importantes
    try {
      const subdeps = fs.readdirSync(transformersNodeModules);
      const important = subdeps.filter(
        (d) => d === "sharp" || d === "onnxruntime-node" || d.startsWith("@"),
      );
      if (important.length > 0) {
        console.log(
          `[afterPack]   Found subdependencies: ${important.join(", ")}`,
        );
      }
    } catch (err) {
      console.warn(
        `[afterPack]   Could not list transformers subdependencies: ${err.message}`,
      );
    }
  } else {
    console.warn(
      "[afterPack] WARNING: @xenova/transformers/node_modules not found",
    );
  }

  console.log("[afterPack] ✓ @xenova/transformers verified");
}

/**
 * Copia bindings nativos de better-sqlite3
 */
async function copySQLiteBindings(asarUnpackedPath) {
  console.log("[afterPack] Checking better-sqlite3...");

  const sqliteInBundle = path.join(
    asarUnpackedPath,
    "node_modules",
    "better-sqlite3",
  );

  if (!fs.existsSync(sqliteInBundle)) {
    console.warn("[afterPack] WARNING: better-sqlite3 not found in bundle");
    return;
  }

  // Verificar que el binding nativo .node exista
  const buildReleasePath = path.join(sqliteInBundle, "build", "Release");

  if (fs.existsSync(buildReleasePath)) {
    try {
      const files = fs.readdirSync(buildReleasePath);
      const nodeFiles = files.filter((f) => f.endsWith(".node"));

      if (nodeFiles.length > 0) {
        console.log(
          `[afterPack] ✓ better-sqlite3 native bindings found: ${nodeFiles.join(", ")}`,
        );
      } else {
        console.warn(
          "[afterPack] WARNING: No .node files found in better-sqlite3/build/Release",
        );
      }
    } catch (err) {
      console.warn(
        `[afterPack]   Could not verify sqlite3 bindings: ${err.message}`,
      );
    }
  } else {
    console.warn(
      "[afterPack] WARNING: better-sqlite3/build/Release directory not found",
    );
  }
}

/**
 * Copia bindings nativos de onnxruntime-node
 */
async function copyOnnxRuntimeBindings(asarUnpackedPath) {
  console.log("[afterPack] Checking onnxruntime-node...");

  const onnxInBundle = path.join(
    asarUnpackedPath,
    "node_modules",
    "onnxruntime-node",
  );

  if (!fs.existsSync(onnxInBundle)) {
    console.log("[afterPack] ℹ️  onnxruntime-node not found (may not be used)");
    return;
  }

  // Verificar bindings nativos
  const binPath = path.join(onnxInBundle, "bin");

  if (fs.existsSync(binPath)) {
    try {
      const files = fs.readdirSync(binPath);
      const nativeFiles = files.filter(
        (f) => f.endsWith(".node") || f.endsWith(".dylib") || f.endsWith(".so"),
      );

      if (nativeFiles.length > 0) {
        console.log(
          `[afterPack] ✓ onnxruntime-node bindings found: ${nativeFiles.join(", ")}`,
        );
      } else {
        console.warn(
          "[afterPack] WARNING: No native files found in onnxruntime-node/bin",
        );
      }
    } catch (err) {
      console.warn(
        `[afterPack]   Could not verify onnxruntime bindings: ${err.message}`,
      );
    }
  } else {
    console.warn(
      "[afterPack] WARNING: onnxruntime-node/bin directory not found",
    );
  }
}

/**
 * Copia recursivamente un directorio
 */
function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();

  if (isDirectory) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach((childItemName) => {
      copyRecursiveSync(
        path.join(src, childItemName),
        path.join(dest, childItemName),
      );
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

/**
 * Fixes executable permissions for the dugite git binary on Linux.
 * When Electron Forge packages the app, binaries in extraResource
 * can lose their executable bit. This restores chmod +x on all
 * files under resources/git/bin/ and resources/git/libexec/.
 */
async function fixLinuxGitPermissions(appOutDir) {
  console.log("[afterPack] Fixing git binary permissions for Linux...");

  const gitResourceDir = path.join(appOutDir, "resources", "git");

  if (!fs.existsSync(gitResourceDir)) {
    console.warn(
      `[afterPack] WARNING: Dugite git directory not found at ${gitResourceDir}`,
    );
    return;
  }

  // Directories that contain executables
  const execDirs = ["bin", "libexec"];
  let fixedCount = 0;

  for (const dir of execDirs) {
    const dirPath = path.join(gitResourceDir, dir);
    if (!fs.existsSync(dirPath)) continue;

    chmodRecursive(dirPath);
    fixedCount++;
  }

  console.log(
    `[afterPack] ✅ Fixed executable permissions in ${fixedCount} directories under resources/git/`,
  );
}

/**
 * Recursively sets 0o755 on all files in a directory.
 */
function chmodRecursive(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      fs.chmodSync(fullPath, 0o755);
      chmodRecursive(fullPath);
    } else if (entry.isFile()) {
      fs.chmodSync(fullPath, 0o755);
    }
  }
}

