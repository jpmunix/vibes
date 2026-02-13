import React, { Suspense } from "react";
import { createRoute } from "@tanstack/react-router";
import { notesRoute } from "./notes";

const NoteDetailPage = React.lazy(() => import("../pages/notes_.$noteId"));

export const noteDetailRoute = createRoute({
  getParentRoute: () => notesRoute,
  path: "$noteId",
  component: () => (
    <Suspense>
      <NoteDetailPage />
    </Suspense>
  ),
});
