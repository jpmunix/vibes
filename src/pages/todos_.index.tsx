import { useLoadApps } from "@/hooks/useLoadApps";
import { useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";

export default function TodosIndexPage() {
  const navigate = useNavigate();
  const { apps, loading } = useLoadApps();

  useEffect(() => {
    if (!loading && apps.length > 0) {
      // Redirect to the first app's todos
      navigate({
        to: "/todos/$appId",
        params: { appId: String(apps[0].id) },
      });
    }
  }, [loading, apps, navigate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (apps.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <p className="text-lg">No tienes ninguna app</p>
        <p className="text-sm mt-2">
          Crea una app primero para usar el tablero de tareas
        </p>
      </div>
    );
  }

  return null;
}
