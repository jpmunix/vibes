import { createRouter } from "@tanstack/react-router";
import { appDetailsRoute } from "./routes/app-details";
import { chatRoute } from "./routes/chat";
import { homeRoute } from "./routes/home";
import { hubRoute } from "./routes/hub";
import { libraryRoute } from "./routes/library";
import { notesRoute } from "./routes/notes";
import { noteDetailRoute } from "./routes/notes_.$noteId";
import { notesIndexRoute } from "./routes/notes_.index";
import { rootRoute } from "./routes/root";
import { settingsRoute } from "./routes/settings";

import { themesRoute } from "./routes/themes";
import { todosRoute } from "./routes/todos";
import { todoDetailRoute } from "./routes/todos_.$appId";
import { todosIndexRoute } from "./routes/todos_.index";
import { debatesRoute } from "./routes/debates";
import { workspaceRoute } from "./routes/workspace";

import { settingsIndexRoute } from "./routes/settings/index";
import { promptsSettingsRoute } from "./routes/settings/prompts";
import { aiQueryLogsRoute } from "./routes/settings/ai-query-logs";

const routeTree = rootRoute.addChildren([
  homeRoute,
  hubRoute,
  libraryRoute,
  themesRoute,
  chatRoute,
  notesRoute.addChildren([notesIndexRoute, noteDetailRoute]),
  todosRoute.addChildren([todosIndexRoute, todoDetailRoute]),
  appDetailsRoute,
  debatesRoute,
  workspaceRoute,
  settingsRoute.addChildren([settingsIndexRoute, promptsSettingsRoute, aiQueryLogsRoute]),
]);

import { useNavigate } from "@tanstack/react-router";
// src/components/NotFoundRedirect.tsx
import * as React from "react";
import { ErrorBoundary } from "./components/ErrorBoundary";

export function NotFoundRedirect() {
  const navigate = useNavigate();

  React.useEffect(() => {
    // Navigate to the main route ('/') immediately on mount
    // 'replace: true' prevents the invalid URL from being added to browser history
    navigate({ to: "/", replace: true });
  }, [navigate]); // Dependency array ensures this runs only once

  // Optionally render null or a loading indicator while redirecting
  // The redirect is usually very fast, so null is often fine.
  return null;
  // Or: return <div>Redirecting...</div>;
}

export const router = createRouter({
  routeTree,
  defaultNotFoundComponent: NotFoundRedirect,
  defaultErrorComponent: ErrorBoundary,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
