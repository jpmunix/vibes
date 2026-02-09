const fs = require("fs");
const path = require("path");

/**
 * afterPack hook para Electron Forge
 * Copia las librerías nativas de Sharp (libvips) al bundle de macOS
 * para evitar errores de "Library not loaded" en runtime
 */
exports.default = async function afterPack(context) {
  const { electronPlatformName, appOutDir, arch } = context;

  // Solo ejecutar para macOS
  if (electronPlatformName !== "darwin") {
    console.log(`[afterPack] Skipping Sharp copy for ${electronPlatformName}`);
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
  } catch (error) {
    console.error("[afterPack] ERROR copying Sharp libraries:", error);
    throw error;
  }
};

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
