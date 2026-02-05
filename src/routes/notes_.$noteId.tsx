import { createRoute } from "@tanstack/react-router";
import { notesRoute } from "./notes";
import NoteDetailPage from "../pages/notes_.$noteId";

export const noteDetailRoute = createRoute({
  getParentRoute: () => notesRoute,
  path: "$noteId",
  component: NoteDetailPage,
});
