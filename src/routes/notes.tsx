import React, { Suspense } from "react";
import { createRoute } from "@tanstack/react-router";
import { rootRoute } from "./root";

const NotesPage = React.lazy(() => import("../pages/notes"));

export const notesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/notes",
  component: () => (
    <Suspense>
      <NotesPage />
    </Suspense>
  ),
});
