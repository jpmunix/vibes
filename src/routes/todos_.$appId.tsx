import React, { Suspense } from "react";
import { createRoute } from "@tanstack/react-router";
import { todosRoute } from "./todos";

const TodoDetailPage = React.lazy(() => import("../pages/todos_.$appId"));

export const todoDetailRoute = createRoute({
  getParentRoute: () => todosRoute,
  path: "$appId",
  component: () => (
    <Suspense>
      <TodoDetailPage />
    </Suspense>
  ),
});
