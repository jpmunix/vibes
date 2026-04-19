import React, { Suspense } from "react";
import { PageLoader } from "@/components/PageLoader";
import { createRoute } from "@tanstack/react-router";
import { settingsRoute } from "../settings";

const SelectorsPlayground = React.lazy(() => import("../../pages/settings/selectors-playground"));

export const selectorsPlaygroundRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/selectors",
  component: () => (
    <Suspense fallback={<PageLoader />}>
      <SelectorsPlayground />
    </Suspense>
  ),
});
