import { createRoute } from "@tanstack/react-router";
import { rootRoute } from "./root";
import DebatesPage from "../pages/debates.tsx";
import { z } from "zod";

export const debatesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/debates",
  component: DebatesPage,
  validateSearch: z.object({
    id: z.number().optional(),
  }),
});
