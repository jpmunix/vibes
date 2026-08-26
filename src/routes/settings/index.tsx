import React, { Suspense } from "react";
import { createRoute } from "@tanstack/react-router";
import { settingsRoute } from "../settings";
import { PageLoader } from "@/components/PageLoader";

const SettingsPage = React.lazy(() => import("../../pages/settings"));

export const settingsIndexRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/",
  component: () => (
    <Suspense fallback={<PageLoader />}>
      <SettingsPage />
    </Suspense>
  ),
});
