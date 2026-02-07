import { createRoute } from "@tanstack/react-router";
import TodoDetailPage from "../pages/todos_.$appId";
import { todosRoute } from "./todos";

export const todoDetailRoute = createRoute({
  getParentRoute: () => todosRoute,
  path: "$appId",
  component: TodoDetailPage,
});
