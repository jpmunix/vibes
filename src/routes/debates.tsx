import React, { Suspense } from "react";
import { createRoute } from "@tanstack/react-router";
import { rootRoute } from "./root";
import { z } from "zod";

const DebatesPage = React.lazy(() => import("../pages/debates.tsx"));

export const debatesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/debates",
  component: () => (
    <Suspense>
      <DebatesPage />
    </Suspense>
  ),
  validateSearch: z.object({
    id: z.number().optional(),
  }),
});
