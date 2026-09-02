import { describe, it, expect } from "vitest";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import {
  resolveVibesCore,
  isValidVibesCorePackages,
  vibesAliases,
  REQUIRED_VIBES_PACKAGES,
} from "../../../vite.vibes-aliases.mts";

function createMockPackagesTree(targetDir: string, packages = REQUIRED_VIBES_PACKAGES) {
  fs.mkdirSync(targetDir, { recursive: true });
  for (const pkg of packages) {
    const pkgDir = path.join(targetDir, pkg);
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.writeFileSync(
      path.join(pkgDir, "package.json"),
      JSON.stringify({ name: `@vibes/${pkg}` }),
    );
  }
}

describe("resolveVibesCore", () => {
  it("valida la integridad completa de los paquetes requeridos", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vibes-test-"));
    try {
      expect(isValidVibesCorePackages(tempDir)).toBe(false);

      // Incompleto (solo shared)
      fs.mkdirSync(path.join(tempDir, "shared"), { recursive: true });
      fs.writeFileSync(
        path.join(tempDir, "shared/package.json"),
        JSON.stringify({ name: "@vibes/shared" }),
      );
      expect(isValidVibesCorePackages(tempDir)).toBe(false);

      // Completo
      createMockPackagesTree(tempDir);
      expect(isValidVibesCorePackages(tempDir)).toBe(true);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("prioriza VIBES_CORE_DIR cuando está definido y es válido", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "vibes-env-test-"));
    try {
      const customCore = path.join(tempRoot, "custom-core");
      const customPackages = path.join(customCore, "packages");
      createMockPackagesTree(customPackages);

      const baseDir = path.join(tempRoot, "vibes-project");
      fs.mkdirSync(baseDir, { recursive: true });

      // Pasando la raíz del core (sin packages en el path)
      const resFromRoot = resolveVibesCore(baseDir, customCore);
      expect(resFromRoot).toBe(customPackages);

      // Pasando directamente el subdirectorio packages
      const resFromPackages = resolveVibesCore(baseDir, customPackages);
      expect(resFromPackages).toBe(customPackages);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("prioriza estructura contenedor ../core/packages sobre la plana", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "vibes-container-test-"));
    try {
      // Simulamos /container/vibes y /container/core
      const containerDir = path.join(tempRoot, "vibes-123-feature");
      const vibesApp = path.join(containerDir, "vibes");
      const coreSibling = path.join(containerDir, "core/packages");
      const flatCore = path.join(tempRoot, "vibes-core/packages");

      createMockPackagesTree(coreSibling);
      createMockPackagesTree(flatCore);
      fs.mkdirSync(vibesApp, { recursive: true });

      const resolved = resolveVibesCore(vibesApp, undefined);
      expect(resolved).toBe(coreSibling);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("hace fallback a estructura plana ../vibes-core/packages si no hay contenedor", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "vibes-flat-test-"));
    try {
      const vibesApp = path.join(tempRoot, "Vibes");
      const flatCore = path.join(tempRoot, "vibes-core/packages");

      createMockPackagesTree(flatCore);
      fs.mkdirSync(vibesApp, { recursive: true });

      const resolved = resolveVibesCore(vibesApp, undefined);
      expect(resolved).toBe(flatCore);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("lanza un error explícito si ningún candidato es válido", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "vibes-none-test-"));
    try {
      const vibesApp = path.join(tempRoot, "Vibes");
      fs.mkdirSync(vibesApp, { recursive: true });

      expect(() => resolveVibesCore(vibesApp, undefined)).toThrow(
        /No se pudo encontrar un árbol válido de @vibes\/\*/,
      );
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("exporta un catálogo coherente de alias @vibes/*", () => {
    expect(vibesAliases["@vibes/shared"]).toBeDefined();
    expect(vibesAliases["@vibes/runtime"]).toBeDefined();
    expect(vibesAliases["@vibes/runtime-impl"]).toBeDefined();
    expect(vibesAliases["@vibes/tools"]).toBeDefined();
    expect(vibesAliases["@vibes/tools/catalog"]).toBeDefined();
    expect(vibesAliases["@vibes/workspace"]).toBeDefined();
    expect(vibesAliases["@vibes/bridge"]).toBeDefined();
    expect(vibesAliases["@vibes/providers/libsql"]).toBeDefined();
    expect(vibesAliases["@vibes/providers/sqlite"]).toBeDefined();
  });
});
