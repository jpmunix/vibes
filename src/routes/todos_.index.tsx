import React, { Suspense } from "react";
import { createRoute } from "@tanstack/react-router";
import { todosRoute } from "./todos";

const TodosIndexPage = React.lazy(() => import("../pages/todos_.index"));

export const todosIndexRoute = createRoute({
  getParentRoute: () => todosRoute,
  path: "/",
  component: () => (
    <Suspense>
      <TodosIndexPage />
    </Suspense>
  ),
});
