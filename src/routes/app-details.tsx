import React, { Suspense } from "react";
import { PageLoader } from "@/components/PageLoader";
import { createRoute } from "@tanstack/react-router";
import { rootRoute } from "./root";
import { z } from "zod";

const AppDetailsPage = React.lazy(() => import("../pages/app-details"));

export const appDetailsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/app-details",
  component: () => (
    <Suspense fallback={<PageLoader />}>
      <AppDetailsPage />
    </Suspense>
  ),
  validateSearch: z.object({
    appId: z.number().optional(),
  }),
});
