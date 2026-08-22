import React, { Suspense } from "react";
import { PageLoader } from "@/components/PageLoader";
import { createRoute } from "@tanstack/react-router";
import { rootRoute } from "./root";
import { z } from "zod";

const AppFoldersPage = React.lazy(() => import("../pages/app-folders"));

/**
 * #95 — Workspace multi-proyecto: página de gestión de folders vinculados.
 * Ruta plana con `validateSearch` (mismo patrón que app-details), para
 * acceder vía navigate({ to: "/app-folders", search: { appId } }).
 */
export const appFoldersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/app-folders",
  component: () => (
    <Suspense fallback={<PageLoader />}>
      <AppFoldersPage />
    </Suspense>
  ),
  validateSearch: z.object({
    appId: z.number(),
  }),
});
