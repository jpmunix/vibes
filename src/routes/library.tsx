import React, { Suspense } from "react";
import { PageLoader } from "@/components/PageLoader";
import { Route } from "@tanstack/react-router";
import { rootRoute } from "./root";

const LibraryPage = React.lazy(() => import("@/pages/library"));

export const libraryRoute = new Route({
  getParentRoute: () => rootRoute,
  path: "/library",
  component: () => (
    <Suspense fallback={<PageLoader />}>
    <LibraryPage />
    </Suspense>
  ),
});
