import React, { Suspense } from "react";
import { createRoute } from "@tanstack/react-router";
import { rootRoute } from "./root";
import { z } from "zod";

const ChatPage = React.lazy(() => import("../pages/chat"));

export const chatRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/chat",
  component: () => (
    <Suspense>
      <ChatPage />
    </Suspense>
  ),
  validateSearch: z.object({
    id: z.number().optional(),
    autoStart: z.boolean().optional(),
  }),
});
