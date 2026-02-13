import React, { Suspense } from "react";
import { Route } from "@tanstack/react-router";
import { rootRoute } from "./root";

const HubPage = React.lazy(() => import("../pages/hub"));

export const hubRoute = new Route({
  getParentRoute: () => rootRoute,
  path: "/hub",
  component: () => (
    <Suspense>
    <HubPage />
    </Suspense>
  ),
});
