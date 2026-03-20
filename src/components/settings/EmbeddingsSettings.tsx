import React, { useState } from "react";
import { useSettings } from "@/hooks/useSettings";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Info, Database, Zap } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { EMBEDDING_MODELS } from "@/ipc/shared/embedding_model_constants";

interface EmbeddingsSettingsProps {
    isHighlighted?: boolean;
}

export function EmbeddingsSettings({ isHighlighted }: EmbeddingsSettingsProps) {
    const { settings, updateSettings } = useSettings();
    const [isModalOpen, setIsModalOpen] = useState(false);

    const isEnabled = settings?.embeddingsEnabled ?? false;
    const selectedModel =
        settings?.embeddingsModel ?? "openai/text-embedding-3-small";

    const handleToggle = async (checked: boolean) => {
        await updateSettings({ embeddingsEnabled: checked });
    };

    const handleModelChange = async (value: string) => {
        await updateSettings({ embeddingsModel: value });
    };

    const currentModelInfo =
        EMBEDDING_MODELS.find((m) => m.id === selectedModel) || EMBEDDING_MODELS[0];

    return (
        <div
            id="embeddings-settings"
            className={`bg-card rounded-2xl shadow-sm p-8 border transition-[border-color,box-shadow] duration-300 ${isHighlighted
                ? "border-primary ring-2 ring-primary ring-offset-4 ring-offset-muted/30"
                : "border-border hover:border-border/80"
                }`}
        >
            <div className="flex items-center gap-3 justify-between mb-8">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <Database className="w-6 h-6 text-primary" />
                        Búsqueda Semántica
                    </h2>
                    <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
                        Mejora drásticamente la capacidad térmica de Vibes de comprender el
                        código. Utiliza modelos de IA (embeddings) para encontrar archivos y debates
                        basándose en su *significado* semántico, no solo en coincidencias
                        de texto.
                    </p>
                </div>
            </div>

            <div className="space-y-6">
                <div className="flex items-start justify-between gap-8 p-4 rounded-xl bg-muted/30 border border-border">
                    <div className="flex-1">
                        <Label
                            htmlFor="embeddings-toggle"
                            className="text-base font-semibold text-gray-900 dark:text-white"
                        >
                            Habilitar Contexto Semántico
                        </Label>
                        <p className="text-sm text-muted-foreground mt-1">
                            Al activarlo, Vibes indexará localmente tu código usando el modelo
                            seleccionado para realizar búsquedas inteligentes. Requiere acceso
                            a internet y consume créditos de OpenRouter (uso muy bajo).
                        </p>
                    </div>
                    <Switch
                        id="embeddings-toggle"
                        checked={isEnabled}
                        onCheckedChange={handleToggle}
                    />
                </div>

                {isEnabled && (
                    <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="flex-1">
                                <div className="flex items-center gap-2">
                                    <Label className="text-sm font-semibold text-gray-900 dark:text-white">
                                        Modelo de Embeddings
                                    </Label>
                                    <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                                        <DialogTrigger asChild>
                                            <button className="text-muted-foreground hover:text-primary transition-colors">
                                                <Info className="w-4 h-4" />
                                            </button>
                                        </DialogTrigger>
                                        <DialogContent>
                                            <DialogHeader>
                                                <DialogTitle>Sobre los modelos de Embeddings</DialogTitle>
                                            </DialogHeader>
                                            <div className="space-y-4 text-sm text-muted-foreground">
                                                <p>
                                                    Los modelos de embeddings transforman el texto en
                                                    vectores matemáticos para buscar similitudes por
                                                    significado en lugar de solo palabras clave exactas.
                                                </p>
                                                <div className="bg-muted p-4 rounded-lg space-y-2">
                                                    <h4 className="font-semibold text-foreground">
                                                        Modelo actual: {currentModelInfo.name}
                                                    </h4>
                                                    <ul className="list-disc pl-4 space-y-1">
                                                        <li>Proveedor: {currentModelInfo.provider}</li>
                                                        <li>
                                                            Dimensiones: {currentModelInfo.dims} (A
                                                            mayor dimensión, más precisión pero mayor coste y
                                                            tamaño)
                                                        </li>
                                                    </ul>
                                                </div>
                                                <p>
                                                    <strong className="text-foreground">Recomendación:</strong>{" "}
                                                    El modelo por defecto (<code>text-embedding-3-small</code>)
                                                    ofrece el mejor balance entre precisión, velocidad
                                                    y costo ultra bajo para indexar código.
                                                </p>
                                            </div>
                                        </DialogContent>
                                    </Dialog>
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Selecciona el motor neuronal para indexar tu proyecto.
                                </p>
                            </div>

                            <div className="w-full sm:w-[280px]">
                                <Select
                                    value={selectedModel}
                                    onValueChange={handleModelChange}
                                >
                                    <SelectTrigger className="w-full bg-background">
                                        <SelectValue placeholder="Selecciona un modelo" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {EMBEDDING_MODELS.map((model) => (
                                            <SelectItem key={model.id} value={model.id}>
                                                <div className="flex flex-col">
                                                    <span>{model.name}</span>
                                                    <span className="text-[10px] text-muted-foreground">
                                                        {model.provider} · {model.dims} dims
                                                    </span>
                                                </div>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="mt-4 flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 p-2.5 rounded-lg border border-amber-500/20">
                            <Zap className="w-4 h-4 shrink-0" />
                            <span>
                                <strong>Nota:</strong> Cambiar de modelo requerirá reindexar
                                todo el proyecto y debates. Se invalidará la caché anterior.
                            </span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
