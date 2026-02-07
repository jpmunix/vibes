import { createRoute } from "@tanstack/react-router";
import TodosPage from "../pages/todos";
import { rootRoute } from "./root";

export const todosRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/todos",
  component: TodosPage,
});
