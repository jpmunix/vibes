import React, { Suspense } from "react";
import { PageLoader } from "@/components/PageLoader";
import { createRoute } from "@tanstack/react-router";
import { rootRoute } from "./root";
import { z } from "zod";

const AppSettingsPage = React.lazy(() => import("../pages/app-settings"));

/**
 * #234 — Workspace settings page (rename of #95's /app-folders).
 *
 * Same flat-route shape as app-details, with `appId` injected via the
 * `validateSearch` schema. Reached via
 * `navigate({ to: "/app-settings", search: { appId } })`.
 */
export const appSettingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/app-settings",
  component: () => (
    <Suspense fallback={<PageLoader />}>
      <AppSettingsPage />
    </Suspense>
  ),
  validateSearch: z.object({
    appId: z.number(),
  }),
});
