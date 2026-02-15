import React, { Suspense } from "react";
import { PageLoader } from "@/components/PageLoader";
import { createRoute } from "@tanstack/react-router";
import { todosRoute } from "./todos";

const TodoDetailPage = React.lazy(() => import("../pages/todos_.$appId"));

export const todoDetailRoute = createRoute({
  getParentRoute: () => todosRoute,
  path: "$appId",
  component: () => (
    <Suspense fallback={<PageLoader />}>
      <TodoDetailPage />
    </Suspense>
  ),
});
