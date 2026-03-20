import React, { Suspense } from "react";
import { PageLoader } from "@/components/PageLoader";
import { Route } from "@tanstack/react-router";
import { rootRoute } from "./root";

const HubPage = React.lazy(() => import("../pages/hub"));

export const hubRoute = new Route({
  getParentRoute: () => rootRoute,
  path: "/hub",
  component: () => (
    <Suspense fallback={<PageLoader />}>
    <HubPage />
    </Suspense>
  ),
});
