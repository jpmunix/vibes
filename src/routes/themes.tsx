import React, { Suspense } from "react";
import { PageLoader } from "@/components/PageLoader";
import { createRoute } from "@tanstack/react-router";
import { rootRoute } from "./root";

const ThemesPage = React.lazy(() => import("@/pages/themes"));

export const themesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/themes",
  component: () => (
    <Suspense fallback={<PageLoader />}>
    <ThemesPage />
    </Suspense>
  ),
});
