import React, { Suspense } from "react";
import { PageLoader } from "@/components/PageLoader";
import { createRoute } from "@tanstack/react-router";
import { settingsRoute } from "../settings";

const PromptsSettings = React.lazy(() => import("../../pages/PromptsSettings"));

export const promptsSettingsRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/prompts",
  component: () => (
    <Suspense fallback={<PageLoader />}>
      <PromptsSettings />
    </Suspense>
  ),
});
