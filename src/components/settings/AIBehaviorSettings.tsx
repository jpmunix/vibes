import React from "react";
import { useSettings } from "@/hooks/useSettings";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ThinkingBudgetSelector } from "@/components/ThinkingBudgetSelector";
import { MaxChatTurnsSelector } from "@/components/MaxChatTurnsSelector";
import { ChatLanguageSelector } from "@/components/ChatLanguageSelector";
import { cn } from "@/lib/utils";

export function AIBehaviorSettings({ isHighlighted }: { isHighlighted?: boolean }) {
    const { settings, updateSettings } = useSettings();

    const handleToggle = async (
        field: "enableLocalSmartContext" | "enableTokenStats" | "enableVerboseChatLogs",
        value: boolean
    ) => {
        await updateSettings({ [field]: value } as any);
    };

    return (
        <div
            id="ai-behavior"
            className={cn(
                "bg-card rounded-2xl shadow-sm p-8 border border-border transition-all duration-300",
                isHighlighted ? "ring-2 ring-primary ring-offset-4 ring-offset-muted/30" : ""
            )}
        >
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                Configuración del Asistente
            </h2>
            <p className="text-sm text-muted-foreground mb-8">
                Personaliza cómo el asistente procesa la información y se comunica contigo.
            </p>

            <div className="space-y-12">
                {/* Reasoning & Turns */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                    <div className="space-y-4">
                        <Label className="text-lg font-semibold text-gray-900 dark:text-white">
                            Presupuesto de pensamiento
                        </Label>
                        <div className="p-1 rounded-2xl bg-muted/30 border border-border w-fit">
                            <ThinkingBudgetSelector />
                        </div>
                    </div>

                    <div className="space-y-4">
                        <Label className="text-lg font-semibold text-gray-900 dark:text-white">
                            Turnos máximos de chat
                        </Label>
                        <div className="p-1 rounded-2xl bg-muted/30 border border-border w-fit">
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
                        <div className="p-1 rounded-2xl bg-muted/30 border border-border w-fit">
                            <ChatLanguageSelector />
                        </div>
                        <p className="text-sm text-muted-foreground">
                            El asistente priorizará este idioma en sus respuestas y explicaciones.
                        </p>
                    </div>
                </div>

                {/* Features Row */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-8 border-t border-border">
                    <div className="p-6 rounded-2xl bg-muted/30 border border-border flex flex-col justify-between gap-4">
                        <div>
                            <Label className="text-base font-bold text-gray-900 dark:text-white">Smart Context local</Label>
                            <p className="text-xs text-muted-foreground mt-1">
                                Ranking de archivos relevantes sin servidores externos.
                            </p>
                        </div>
                        <Switch
                            checked={settings?.enableLocalSmartContext !== false}
                            onCheckedChange={(checked) => handleToggle("enableLocalSmartContext", checked)}
                        />
                    </div>

                    <div className="p-6 rounded-2xl bg-muted/30 border border-border flex flex-col justify-between gap-4">
                        <div>
                            <Label className="text-base font-bold text-gray-900 dark:text-white">Métricas de tokens</Label>
                            <p className="text-xs text-muted-foreground mt-1">
                                Guarda el historial de consumo para las estadísticas.
                            </p>
                        </div>
                        <Switch
                            checked={settings?.enableTokenStats !== false}
                            onCheckedChange={(checked) => handleToggle("enableTokenStats", checked)}
                        />
                    </div>

                    <div className="p-6 rounded-2xl bg-muted/30 border border-border flex flex-col justify-between gap-4">
                        <div>
                            <Label className="text-base font-bold text-gray-900 dark:text-white">Logs verbosos</Label>
                            <p className="text-xs text-muted-foreground mt-1">
                                Información técnica detallada en el panel de chat.
                            </p>
                        </div>
                        <Switch
                            checked={!!settings?.enableVerboseChatLogs}
                            onCheckedChange={(checked) => handleToggle("enableVerboseChatLogs", checked)}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
