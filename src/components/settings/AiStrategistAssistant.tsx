import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/hooks/useSettings";
import { ipc } from "@/ipc/types";
import { DEFAULT_STRATEGIST_MODEL } from "@/lib/schemas";
import { Sparkles, Loader2, Check, X } from "@/components/ui/icons";
import { showError, showSuccess } from "@/lib/toast";

const SKILL_SYSTEM_PROMPT = `Eres un Ingeniero de AI y Diseñador de Instrucciones experto. Tu tarea es generar o perfeccionar un archivo de directrices de comportamiento para un agente AI (llamado "Skill").

El resultado DEBE estar en formato Markdown e incluir obligatoriamente el siguiente bloque frontmatter YAML al principio, delimitado por "---":
---
name: slug-en-minusculas (usa solo letras minúsculas, números y guiones)
description: Breve descripción de una sola línea de para qué sirve este skill
allowed-tools:
  - herramienta_1
  - herramienta_2
---

A continuación del frontmatter, el contenido DEBE estructurarse bajo un encabezado principal "# Instrucciones", donde especificarás con máximo detalle, claridad y rigor el comportamiento, restricciones y reglas del agente al interactuar con el código o realizar la tarea encomendada.

Reglas críticas de formato y contenido:
- Mantén las reglas y descripciones sumamente claras, sin ambigüedades.
- No uses marcadores de posición ni placeholders.
- Estructura las instrucciones usando secciones claras, viñetas y ejemplos de buenas prácticas.
- El frontmatter YAML es obligatorio al principio y debe ser sintácticamente válido.
- Responde ÚNICAMENTE con el contenido final del archivo SKILL.md generado, sin introducciones ni comentarios explicativos fuera del Markdown.`;

const PROMPT_SYSTEM_PROMPT = `Eres un Ingeniero de Prompts experto. Tu tarea es generar o perfeccionar un prompt de sistema o instrucciones para un modelo de lenguaje (LLM).

El prompt generado debe ser estructurado, claro y altamente efectivo. Debe definir claramente:
1. El Rol o Actitud del agente.
2. El Objetivo o Tarea principal.
3. Las Reglas y Restricciones detalladas que debe seguir el modelo.
4. El Formato de Salida esperado (si aplica, con ejemplos).

Reglas críticas:
- Escribe de forma directa y asertiva, utilizando imperativos claros ("Haz", "Evita", "Debes").
- Estructura el texto con Markdown limpio (encabezados, listas de viñetas, bloques de código).
- Evita explicaciones meta-lingüísticas; responde ÚNICAMENTE con el prompt optimizado final, sin preámbulos ni comentarios.`;

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";

interface AiStrategistAssistantProps {
    type: "skill" | "prompt";
    currentContent: string;
    onAccept: (newContent: string) => void;
}

export function AiStrategistAssistant({ type, currentContent, onAccept }: AiStrategistAssistantProps) {
    const { settings } = useSettings();
    const [isOpen, setIsOpen] = useState(false);
    const [instruction, setInstruction] = useState("");
    const [isGenerating, setIsGenerating] = useState(false);
    const [proposal, setProposal] = useState<string | null>(null);

    const handleGenerate = async () => {
        if (!instruction.trim()) return;
        
        setIsGenerating(true);
        try {
            const systemPrompt = type === "skill" ? SKILL_SYSTEM_PROMPT : PROMPT_SYSTEM_PROMPT;
            const model = settings?.strategistModel || DEFAULT_STRATEGIST_MODEL;

            let prompt = "";
            if (currentContent && currentContent.trim()) {
                prompt = `Contenido actual:
\`\`\`
${currentContent}
\`\`\`

Instrucciones del usuario para modificar o refinar este contenido:
"${instruction}"`;
            } else {
                prompt = `Instrucciones del usuario para crear un nuevo contenido desde cero:
"${instruction}"`;
            }

            const response = await ipc.misc.playgroundCompletion({
                model,
                prompt: `${systemPrompt}\n\n${prompt}`
            });

            if (response && response.text) {
                setProposal(response.text);
                showSuccess("Propuesta generada con éxito");
            } else {
                throw new Error("No se recibió texto de respuesta");
            }
        } catch (e: any) {
            console.error(e);
            showError("Error al generar propuesta: " + e.message);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleAccept = () => {
        if (proposal) {
            onAccept(proposal);
            setProposal(null);
            setInstruction("");
            setIsOpen(false);
            showSuccess("Propuesta aplicada al editor");
        }
    };

    const handleDiscard = () => {
        setProposal(null);
    };

    const handleOpenChange = (open: boolean) => {
        setIsOpen(open);
        if (!open) {
            setInstruction("");
            setProposal(null);
        }
    };

    const model = settings?.strategistModel || DEFAULT_STRATEGIST_MODEL;

    return (
        <Dialog open={isOpen} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                <Button 
                    variant="outline" 
                    size="sm" 
                    className="gap-1.5 text-xs text-primary border-primary/20 hover:bg-primary/5 hover:border-primary/40 rounded-lg h-7 font-medium"
                >
                    <Sparkles className="h-3.5 w-3.5" />
                    Generar con IA
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[875px] max-h-[80vh] p-6 rounded-2xl shadow-2xl bg-popover border border-border flex flex-col">
                <DialogHeader className="pb-3 border-b border-border/50">
                    <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-primary animate-pulse" />
                        Generar con IA
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-4 flex-1 flex flex-col min-h-0">
                    {!proposal ? (
                        <div className="space-y-3 flex-1 flex flex-col min-h-0">
                            <div className="space-y-1.5 flex-1 flex flex-col min-h-0">
                                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                                    ¿Qué deseas que haga el modelo?
                                </label>
                                <textarea 
                                    className="w-full flex-1 min-h-[220px] rounded-xl border border-border bg-muted/10 px-3 py-2 text-sm placeholder:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary/30 font-sans leading-relaxed custom-scrollbar"
                                    placeholder={type === "skill" 
                                        ? "ej: 'añade reglas para formatear con Prettier, estructurado y claro'" 
                                        : "ej: 'haz que responda de manera formal y estructurada en formato markdown'"
                                    }
                                    value={instruction}
                                    onChange={e => setInstruction(e.target.value)}
                                    disabled={isGenerating}
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-3 flex-1 flex flex-col min-h-0">
                            <div className="space-y-1.5 flex-1 flex flex-col min-h-0">
                                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                                    Propuesta del Estratega:
                                </label>
                                <textarea 
                                    readOnly
                                    className="w-full flex-1 min-h-[380px] rounded-xl border border-border bg-muted/5 px-3 py-2.5 font-mono text-xs leading-relaxed focus:outline-none custom-scrollbar"
                                    value={proposal}
                                />
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter className="pt-3 border-t border-border/50 justify-between items-center gap-2">
                    <div className="flex items-center">
                        <span className="text-[10px] text-muted-foreground/60 font-mono">
                            {model}
                        </span>
                    </div>

                    <div className="flex gap-2">
                        {!proposal ? (
                            <>
                                <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="rounded-lg h-9"
                                    onClick={() => handleOpenChange(false)}
                                    disabled={isGenerating}
                                >
                                    Cancelar
                                </Button>
                                <Button 
                                    size="sm" 
                                    className="gap-1.5 rounded-lg h-9 font-medium"
                                    onClick={handleGenerate}
                                    disabled={!instruction.trim() || isGenerating}
                                >
                                    {isGenerating ? (
                                        <>
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                            Generando...
                                        </>
                                    ) : (
                                        <>
                                            <Sparkles className="h-3.5 w-3.5" />
                                            Generar Propuesta
                                        </>
                                    )}
                                </Button>
                            </>
                        ) : (
                            <>
                                <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="rounded-lg h-9 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                    onClick={handleDiscard}
                                    disabled={isGenerating}
                                >
                                    Descartar
                                </Button>
                                <Button 
                                    variant="outline"
                                    size="sm" 
                                    className="gap-1.5 rounded-lg h-9 font-medium"
                                    onClick={handleGenerate}
                                    disabled={isGenerating}
                                >
                                    {isGenerating ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                        <Sparkles className="h-3.5 w-3.5" />
                                    )}
                                    Regenerar
                                </Button>
                                <Button 
                                    size="sm" 
                                    className="gap-1.5 rounded-lg h-9 font-medium bg-emerald-600 hover:bg-emerald-500 text-white border-none"
                                    onClick={handleAccept}
                                    disabled={isGenerating}
                                >
                                    <Check className="h-3.5 w-3.5" />
                                    Aceptar y Aplicar
                                </Button>
                            </>
                        )}
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
