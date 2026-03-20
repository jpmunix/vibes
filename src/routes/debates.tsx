import React, { Suspense } from "react";
import { PageLoader } from "@/components/PageLoader";
import { createRoute } from "@tanstack/react-router";
import { rootRoute } from "./root";
import { z } from "zod";

const DebatesPage = React.lazy(() => import("../pages/debates.tsx"));

export const debatesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/debates",
  component: () => (
    <Suspense fallback={<PageLoader />}>
      <DebatesPage />
    </Suspense>
  ),
  validateSearch: z.object({
    id: z.number().optional(),
  }),
});
