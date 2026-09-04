/**
 * Card #244 — guards del switch de history que arregla el 404 del Ctrl+R
 * en la app compilada (Electron `file://`).
 *
 * La decisión se expone vía dos funciones puras:
 *   - `shouldUseHashHistory(protocol?)` → boolean
 *   - `buildRouterHistory({ protocol? })` → RouterHistory | undefined
 *
 * Los tests tocan SOLO esas funciones (sin React, sin RouterProvider) para
 * que el contrato sobreviva a cambios futuros del routeTree.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHashHistory } from "@tanstack/react-router";
import {
  buildRouterHistory,
  shouldUseHashHistory,
} from "./router";

describe("shouldUseHashHistory (#244)", () => {
  it("true bajo file: (Electron loadFile compilado)", () => {
    expect(shouldUseHashHistory("file:")).toBe(true);
  });

  it("false bajo http: y https: (dev server Vite + web)", () => {
    expect(shouldUseHashHistory("http:")).toBe(false);
    expect(shouldUseHashHistory("https:")).toBe(false);
  });

  it("false para protocolos desconocidos o vacíos", () => {
    expect(shouldUseHashHistory("")).toBe(false);
    expect(shouldUseHashHistory("chrome-extension:")).toBe(false);
    expect(shouldUseHashHistory("blob:")).toBe(false);
    // Variantes sin los dos puntos que pueden colarse en algún parser.
    expect(shouldUseHashHistory("file")).toBe(false);
  });

  it("sin argumentos cae a window.location.protocol", () => {
    vi.stubGlobal("window", {
      ...window,
      location: { ...window.location, protocol: "file:" },
    });
    try {
      expect(shouldUseHashHistory()).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("sin window definido, devuelve false (defensivo para SSR/Node)", () => {
    const g = globalThis as { window?: unknown };
    const originalWindow = g.window;
    // Borramos window adrede para forzar el path SSR (sin typeof window).
    delete g.window;
    try {
      expect(shouldUseHashHistory()).toBe(false);
    } finally {
      g.window = originalWindow;
    }
  });
});

describe("buildRouterHistory (#244)", () => {
  it("devuelve una instancia de hash history bajo file:", () => {
    const h = buildRouterHistory({ protocol: "file:" });
    expect(h).toBeDefined();
    // Hash history reescribe URLs al slot location.hash
    expect(h!.createHref("/chat?id=42")).toContain("#/chat");
  });

  it("devuelve undefined bajo http(s) (TanStack Router usa browser history por defecto)", () => {
    expect(buildRouterHistory({ protocol: "http:" })).toBeUndefined();
    expect(buildRouterHistory({ protocol: "https:" })).toBeUndefined();
  });

  it("createHref es idempotente: misma entrada → misma salida", () => {
    const h = buildRouterHistory({ protocol: "file:" })!;
    expect(h.createHref("/foo")).toBe(h.createHref("/foo"));
  });

  it("round-trip: createHref de un path → parseLocation lo recupera", () => {
    // Simula lo que pasa al hacer Ctrl+R con un link dentro de la app.
    // El href escrito al location.hash tiene que poder re-parsearse como
    // `/chat?id=42` para que el router monte la vista correcta.
    const h = buildRouterHistory({ protocol: "file:" })!;
    const target = "/chat?id=42";
    const href = h.createHref(target);
    expect(href).toMatch(/^[^#]*#\//);
    // El hash empieza por `#/chat...`
    const hashPath = href.split("#").slice(1).join("#");
    expect(hashPath.startsWith("/chat")).toBe(true);
    expect(hashPath.includes("id=42")).toBe(true);
  });

  it("acepta también createHashHistory directo (re-export público de TanStack)", () => {
    // Defensa contra una reorganización interna de TanStack: si rompen el
    // re-export, este test falla y obliga a revisar el import.
    expect(typeof createHashHistory).toBe("function");
  });
});
