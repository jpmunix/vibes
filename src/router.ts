import * as React from "react";
import {
  createHashHistory,
  createRouter,
  useNavigate,
} from "@tanstack/react-router";
import { ErrorBoundary } from "./components/ErrorBoundary";

import { appDetailsRoute } from "./routes/app-details";
import { appSettingsRoute } from "./routes/app-settings";
import { chatRoute } from "./routes/chat";
import { homeRoute } from "./routes/home";
import { hubRoute } from "./routes/hub";
import { libraryRoute } from "./routes/library";
import { rootRoute } from "./routes/root";
import { settingsRoute } from "./routes/settings";
import { workspaceRoute } from "./routes/workspace";
import { settingsIndexRoute } from "./routes/settings/index";
import { selectorsPlaygroundRoute } from "./routes/settings/selectors-playground";

const routeTree = rootRoute.addChildren([
  homeRoute,
  hubRoute,
  libraryRoute,
  chatRoute,
  appDetailsRoute,
  appSettingsRoute,
  workspaceRoute,
  settingsRoute.addChildren([settingsIndexRoute, selectorsPlaygroundRoute]),
]);

export function NotFoundRedirect() {
  const navigate = useNavigate();

  React.useEffect(() => {
    // `replace: true` evita que la URL inválida quede en el historial del
    // navegador; a NotFoundRedirect se llega desde `/#/algo-que-no-existe`,
    // no queremos que el back del navegador vuelva a ella.
    navigate({ to: "/", replace: true });
  }, [navigate]);

  return null;
}

/**
 * Decide si el router principal debe usar **hash history** en vez del
 * browser history por defecto de TanStack Router.
 *
 * Con la app compilada (Electron `loadFile()`) el renderer se sirve como
 * `file:///.../index.html`, sin un servidor HTTP que reescriba rutas
 * desconocidas a `index.html`. Si navegas a `/chat?id=42` y das Ctrl+R,
 * Chromium pide `file:///.../chat?id=42`, que **no existe como fichero**
 * y revienta con un 404.
 *
 * Con hash history la ruta vive en el fragmento (`#/chat?id=42`), así
 * que el Ctrl+R siempre apunta al mismo `index.html` y sobrevive a la
 * recarga. En dev (`http://localhost:*`) y en web (`https://...`) sí
 * hay servidor que reescribe, así que mantenemos browser history para
 * que las URLs queden limpias y compartibles.
 *
 * Exportado como función pura para poder testearlo sin tocar
 * `window.location`.
 */
export function shouldUseHashHistory(protocol?: string): boolean {
  const p = protocol ?? (typeof window !== "undefined" ? window.location.protocol : "");
  return p === "file:";
}

/**
 * Devuelve la instancia de history apropiada para el transporte actual,
 * o `undefined` para que TanStack Router use su browser history por
 * defecto (http/https).
 *
 * Función (no constante) para poder construir un router contra un
 * protocolo simulado en tests, sin mutar `window.location`.
 */
export function buildRouterHistory(opts?: { protocol?: string }) {
  return shouldUseHashHistory(opts?.protocol) ? createHashHistory() : undefined;
}

export const router = createRouter({
  routeTree,
  history: buildRouterHistory(),
  defaultNotFoundComponent: NotFoundRedirect,
  defaultErrorComponent: ErrorBoundary,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
