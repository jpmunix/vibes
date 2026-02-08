import React from "react";
import { OpenRouterSettings } from "./OpenRouterSettings";
import { SerperApiKeySettings } from "@/components/SerperApiKeySettings";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function ModelsAndConnectivity({
  isHighlighted,
}: {
  isHighlighted?: boolean;
}) {
  return (
    <div id="models-connectivity" className="space-y-12">
      {/* OpenRouter Section is already a Card-like component */}
      <OpenRouterSettings isHighlighted={isHighlighted} />

      {/* Serper / Web Search Section */}
      <div
        id="serper-settings"
        className={cn(
          "bg-card rounded-2xl shadow-sm p-8 border border-border transition-all duration-300",
          isHighlighted
            ? "ring-2 ring-primary ring-offset-4 ring-offset-muted/30"
            : "",
        )}
      >
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          Búsqueda Web e Información
        </h2>
        <p className="text-sm text-muted-foreground mb-8">
          Configura proveedores adicionales para dar superpoderes de navegación
          al asistente.
        </p>

        <div className="space-y-4">
          <Label className="text-lg font-semibold text-gray-900 dark:text-white">
            Serper API (Google Search)
          </Label>
          <div className="p-6 rounded-2xl bg-muted/30 border border-border">
            <SerperApiKeySettings />
            <p className="text-xs text-muted-foreground mt-4">
              Necesaria para que el asistente pueda buscar información
              actualizada en internet.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
