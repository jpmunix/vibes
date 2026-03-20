import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { LightbulbIcon } from "lucide-react";
import { ErrorComponentProps } from "@tanstack/react-router";
import { usePostHog } from "posthog-js/react";
import { ipc } from "@/ipc/types";

export function ErrorBoundary({ error }: ErrorComponentProps) {
  const [isLoading, setIsLoading] = useState(false);
  const posthog = usePostHog();

  useEffect(() => {
    console.error("An error occurred in the route:", error);
    posthog.captureException(error);
  }, [error]);

  const handleReportBug = async () => {
    setIsLoading(true);
    try {
      // Get system debug info
      const debugInfo = await ipc.system.getSystemDebugInfo();

      // Create a formatted email body with the debug info and error information
      const emailBody = `
== Error Details ==
- Error Name: ${error?.name || "Unknown"}
- Error Message: ${error?.message || "Unknown"}
${error?.stack ? `\nStack Trace:\n${error.stack.slice(0, 500)}` : ""}

== System Information ==
- App Version: ${debugInfo.vibesVersion}
- Platform: ${debugInfo.platform}
- Architecture: ${debugInfo.architecture}
- Node Version: ${debugInfo.nodeVersion || "Not available"}
- PNPM Version: ${debugInfo.pnpmVersion || "Not available"}
- Node Path: ${debugInfo.nodePath || "Not available"}
- Telemetry ID: ${debugInfo.telemetryId || "Not available"}

== Logs ==
${debugInfo.logs.slice(-500) || "No logs available"}
`;

      const subject = encodeURIComponent(`[bug] Error en Vibes: ${error?.name || "Unknown"}`);
      const body = encodeURIComponent(emailBody);
      const mailtoUrl = `mailto:pablo@minube.com?subject=${subject}&body=${body}`;

      // Open the email client with the pre-filled report
      await ipc.system.openExternalUrl(mailtoUrl);
    } catch (err) {
      console.error("Failed to prepare bug report:", err);
      // Fallback to opening a simple email
      ipc.system.openExternalUrl("mailto:pablo@minube.com?subject=" + encodeURIComponent("[bug] Error en Vibes"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen w-full p-6 bg-background text-foreground">
      <div className="max-w-md w-full bg-card text-card-foreground p-6 rounded-lg shadow-lg border border-border">
        <h2 className="text-xl font-bold mb-4 text-foreground">
          ¡Lo sentimos, eso no debería haber pasado!
        </h2>

        <p className="text-sm mb-3 text-muted-foreground">Hubo un error al cargar la aplicación...</p>

        {error && (
          <div className="bg-muted p-4 rounded-md mb-6">
            <p className="text-sm mb-1 text-foreground">
              <strong>Nombre del error:</strong> {error.name}
            </p>
            <p className="text-sm text-foreground">
              <strong>Mensaje del error:</strong> {error.message}
            </p>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <Button onClick={handleReportBug} disabled={isLoading}>
            {isLoading ? "Preparando informe..." : "Informar de un error"}
          </Button>
        </div>

        <div className="mt-4 p-3 bg-primary/10 border border-primary/30 rounded-md flex items-center gap-2">
          <LightbulbIcon className="h-4 w-4 text-primary flex-shrink-0" />
          <p className="text-sm text-primary">
            <strong>Consejo:</strong> Intenta cerrar y volver a abrir Vibes como
            solución temporal.
          </p>
        </div>
      </div>
    </div>
  );
}
