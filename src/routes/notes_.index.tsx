import { createRoute } from "@tanstack/react-router";
import { notesRoute } from "./notes";

export const notesIndexRoute = createRoute({
  getParentRoute: () => notesRoute,
  path: "/",
  component: () => (
    <div className="flex items-center justify-center h-screen">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-2">Notas</h1>
        <p className="text-muted-foreground">
          Selecciona o crea una nota para comenzar
        </p>
      </div>
    </div>
  ),
});
