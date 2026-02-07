import { createRoute } from "@tanstack/react-router";
import TodosIndexPage from "../pages/todos_.index";
import { todosRoute } from "./todos";

export const todosIndexRoute = createRoute({
  getParentRoute: () => todosRoute,
  path: "/",
  component: TodosIndexPage,
});
