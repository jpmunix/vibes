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

    return (
        <div className="border border-border bg-muted/10 rounded-xl p-4 space-y-3 transition-all duration-200">
            {!isOpen ? (
                <Button 
                    variant="outline" 
                    size="sm" 
                    className="gap-2 w-full justify-center text-primary border-primary/20 hover:bg-primary/5 hover:border-primary/40 rounded-lg h-9 font-medium"
                    onClick={() => setIsOpen(true)}
                >
                    <Sparkles className="h-4 w-4" />
                    Generar o editar con Modelo Estratega
                </Button>
            ) : (
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-primary flex items-center gap-1.5 uppercase tracking-wider">
                            <Sparkles className="h-3.5 w-3.5 text-primary" />
                            Modelo Estratega
                        </span>
                        <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-6 w-6 text-muted-foreground hover:text-foreground rounded-lg"
                            onClick={() => {
                                setIsOpen(false);
                                setInstruction("");
                                setProposal(null);
                            }}
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    </div>

                    {!proposal ? (
                        <div className="space-y-2">
                            <textarea 
                                className="w-full h-20 rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 font-sans"
                                placeholder={type === "skill" 
                                    ? "Describe lo que quieres que haga el skill (ej: 'añade reglas para formatear con Prettier')" 
                                    : "Describe los cambios para el prompt (ej: 'haz que responda de manera formal y estructurada')"
                                }
                                value={instruction}
                                onChange={e => setInstruction(e.target.value)}
                                disabled={isGenerating}
                            />
                            <div className="flex justify-end gap-2">
                                <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="rounded-lg"
                                    onClick={() => {
                                        setIsOpen(false);
                                        setInstruction("");
                                    }}
                                    disabled={isGenerating}
                                >
                                    Cancelar
                                </Button>
                                <Button 
                                    size="sm" 
                                    className="rounded-lg gap-2"
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
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-3 animate-in fade-in-50 duration-200">
                            <div className="space-y-1.5">
                                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Propuesta del Estratega:</label>
                                <textarea 
                                    readOnly
                                    className="w-full h-48 rounded-lg border border-border bg-muted/40 px-3 py-2.5 font-mono text-xs leading-relaxed focus:outline-none"
                                    value={proposal}
                                />
                            </div>
                            <div className="flex justify-between items-center gap-2">
                                <Button 
                                    variant="outline" 
                                    size="sm" 
                                    className="rounded-lg text-muted-foreground hover:text-foreground"
                                    onClick={handleDiscard}
                                >
                                    Descartar
                                </Button>
                                <div className="flex gap-2">
                                    <Button 
                                        variant="outline" 
                                        size="sm" 
                                        className="rounded-lg gap-2 text-primary border-primary/20 hover:bg-primary/5"
                                        onClick={handleGenerate}
                                        disabled={isGenerating}
                                    >
                                        {isGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                                        Regenerar
                                    </Button>
                                    <Button 
                                        size="sm" 
                                        className="rounded-lg gap-2 bg-emerald-600 hover:bg-emerald-500 text-white border-none"
                                        onClick={handleAccept}
                                    >
                                        <Check className="h-3.5 w-3.5" />
                                        Aceptar y Aplicar
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
