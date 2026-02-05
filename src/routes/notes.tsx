import { createRoute } from "@tanstack/react-router";
import { rootRoute } from "./root";
import NotesPage from "../pages/notes";

export const notesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/notes",
  component: NotesPage,
});
