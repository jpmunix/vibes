import { createRoute, redirect } from "@tanstack/react-router";
import { rootRoute } from "./root";
import { z } from "zod";

export const workspaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/workspace",
  validateSearch: z.object({
    appId: z.number().optional(),
    chatId: z.number().optional(),
  }),
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/", search });
  },
});

