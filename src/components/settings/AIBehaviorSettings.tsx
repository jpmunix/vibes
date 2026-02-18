import React from "react";
import { useSettings } from "@/hooks/useSettings";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ReasoningEffortSelector } from "@/components/ReasoningEffortSelector";
import { MaxChatTurnsSelector } from "@/components/MaxChatTurnsSelector";
import { ChatLanguageSelector } from "@/components/ChatLanguageSelector";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useNavigate } from "@tanstack/react-router";
import { AiQueryLogRotationSelector } from "@/components/AiQueryLogRotationSelector";

export function AIBehaviorSettings({
  isHighlighted,
}: {
  isHighlighted?: boolean;
}) {
  const { settings, updateSettings } = useSettings();
  const navigate = useNavigate();

  const handleToggle = async (
    field: "enableLocalSmartContext",
    value: boolean,
  ) => {
    await updateSettings({ [field]: value } as any, { showToast: true });
  };

  return (
    <div
      id="ai-behavior"
      className={cn(
        "bg-card rounded-2xl shadow-sm p-8 border border-border transition-[border-color,box-shadow] duration-300",
        isHighlighted
          ? "ring-2 ring-primary ring-offset-4 ring-offset-muted/30"
          : "",
      )}
    >
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
        Configuración del Asistente
      </h2>
      <p className="text-sm text-muted-foreground mb-8">
        Personaliza cómo el asistente procesa la información y se comunica
        contigo.
      </p>

      <div className="space-y-12">
        {/* Reasoning & Turns */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          <div className="space-y-4">
            <Label className="text-lg font-semibold text-gray-900 dark:text-white">
              Esfuerzo de razonamiento
            </Label>
            <div className="rounded-2xl p-5 bg-muted/30 border border-border w-fit">
              <ReasoningEffortSelector />
            </div>
          </div>

          <div className="space-y-4">
            <Label className="text-lg font-semibold text-gray-900 dark:text-white">
              Turnos máximos de chat
            </Label>
            <div className="rounded-2xl p-5 bg-muted/30 border border-border w-fit">
              <MaxChatTurnsSelector />
            </div>
          </div>
        </div>

        {/* Language Section */}
        <div className="pt-8 border-t border-border">
          <div className="space-y-4">
            <Label className="text-lg font-semibold text-gray-900 dark:text-white">
              Idioma del asistente
            </Label>
            <div className="p-5 rounded-2xl bg-muted/30 border border-border w-fit">
              <ChatLanguageSelector />
            </div>
            <p className="text-sm text-muted-foreground">
              El asistente priorizará este idioma en sus respuestas y
              explicaciones.
            </p>
          </div>
        </div>

        {/* Features Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-8 border-t border-border">
          <div className="p-6 rounded-2xl bg-muted/30 border border-border flex flex-col justify-between gap-4">
            <div>
              <Label className="text-base font-bold text-gray-900 dark:text-white">
                Smart Context local
              </Label>
              <p className="text-xs text-muted-foreground mt-1">
                Ranking de archivos relevantes sin servidores externos.
              </p>
            </div>
            <Switch
              checked={settings?.enableLocalSmartContext !== false}
              onCheckedChange={(checked) =>
                handleToggle("enableLocalSmartContext", checked)
              }
            />
          </div>
        </div>


        {/* Prompts Navigation */}
        <div className="pt-8 border-t border-border">
          <div
            className="flex items-center justify-between p-6 rounded-2xl bg-primary/5 border border-primary/20 hover:bg-primary/10 transition-colors cursor-pointer group"
            onClick={() => navigate({ to: "/settings/prompts" })}
          >
            <div>
              <h3 className="text-lg font-bold text-primary">
                Prompts del Asistente
              </h3>
              <p className="text-sm text-primary/70 mt-1">
                Personaliza las instrucciones del sistema y las plantillas de
                IA.
              </p>
            </div>
            <Button
              variant="ghost"
              className="text-primary hover:text-primary hover:bg-transparent font-bold"
            >
              Configurar →
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
