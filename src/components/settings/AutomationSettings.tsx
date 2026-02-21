import React from "react";
import { useSettings } from "@/hooks/useSettings";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { AutoFixModelSelector } from "@/components/AutoFixModelSelector";
import { showError } from "@/lib/toast";
import { cn } from "@/lib/utils";

export function AutomationSettings({
  isHighlighted,
}: {
  isHighlighted?: boolean;
}) {
  const { settings, updateSettings } = useSettings();

  const handleToggle = async (
    field: "enableBackgroundProblemAutoFix",
    value: boolean,
  ) => {
    try {
      await updateSettings({ [field]: value } as any, { showToast: true });
    } catch (error) {
      showError("No se pudo actualizar el ajuste");
    }
  };

  const handleUpdateNumberSetting = async (
    field: "autoFixMaxDurationMs" | "autoFixMaxAttempts",
    value: number,
    fallback: number,
  ) => {
    const parsed = Number.isFinite(value) && value > 0 ? value : fallback;
    await updateSettings({ [field]: parsed } as any, { showToast: true });
  };

  return (
    <div
      id="automation-settings"
      className={cn(
        "bg-card rounded-2xl shadow-sm p-8 border border-border transition-[border-color,box-shadow] duration-300",
        isHighlighted
          ? "ring-2 ring-primary ring-offset-4 ring-offset-muted/30"
          : "",
      )}
    >
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
        Agentes y Automatización
      </h2>
      <p className="text-sm text-muted-foreground mb-8">
        Configura el comportamiento autónomo del asistente para corregir errores
        automáticamente.
      </p>

      <div className="space-y-12">
        {/* Auto-fix Section */}
        <div className="space-y-6">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Auto-fix en segundo plano
              </h3>
              <p className="text-sm text-muted-foreground">
                El asistente intentará corregir errores de linting y ejecución
                automáticamente mientras trabajas.
              </p>
            </div>
            <Switch
              checked={settings?.enableBackgroundProblemAutoFix ?? false}
              onCheckedChange={(checked) =>
                handleToggle("enableBackgroundProblemAutoFix", checked)
              }
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-6 rounded-2xl bg-muted/30 border border-border">
            <div className="space-y-4">
              <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60">
                {" "}
                Modelo de corrección{" "}
              </Label>
              <AutoFixModelSelector />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60">
                  {" "}
                  Tiempo máx. (ms){" "}
                </Label>
                <Input
                  type="number"
                  min={1}
                  value={settings?.autoFixMaxDurationMs ?? 20000}
                  className="rounded-xl border-border bg-card h-11"
                  onChange={(e) =>
                    handleUpdateNumberSetting(
                      "autoFixMaxDurationMs",
                      Number(e.target.value),
                      20000,
                    )
                  }
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60">
                  {" "}
                  Intentos máx.{" "}
                </Label>
                <Input
                  type="number"
                  min={0}
                  value={settings?.autoFixMaxAttempts ?? 1}
                  className="rounded-xl border-border bg-card h-11"
                  onChange={(e) =>
                    handleUpdateNumberSetting(
                      "autoFixMaxAttempts",
                      Number(e.target.value),
                      1,
                    )
                  }
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
