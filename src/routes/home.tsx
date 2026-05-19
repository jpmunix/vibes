import React, { Suspense } from "react";
import { PageLoader } from "@/components/PageLoader";
import { createRoute } from "@tanstack/react-router";
import { rootRoute } from "./root";
import { z } from "zod";

const WorkspacePage = React.lazy(() => import("../pages/workspace"));

export const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: () => (
    <Suspense fallback={<PageLoader />}>
      <WorkspacePage />
    </Suspense>
  ),
  validateSearch: z.object({
    appId: z.number().optional(),
    chatId: z.number().optional(),
  }),
});
