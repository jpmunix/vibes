import React, { Suspense } from "react";
import { createRoute } from "@tanstack/react-router";
import { rootRoute } from "./root";

const TodosPage = React.lazy(() => import("../pages/todos"));

export const todosRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/todos",
  component: () => (
    <Suspense>
      <TodosPage />
    </Suspense>
  ),
});
