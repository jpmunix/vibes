import { createRouter } from "@tanstack/react-router";
import { appDetailsRoute } from "./routes/app-details";
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
  workspaceRoute,
  settingsRoute.addChildren([settingsIndexRoute, selectorsPlaygroundRoute]),
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
