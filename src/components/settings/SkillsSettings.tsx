import React, { useState, useEffect } from "react";
import { useAtomValue } from "jotai";
import { currentAppAtom } from "@/atoms/appAtoms";
import { appClient } from "@/ipc/types/app";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pencil, Plus, Trash2, Check, BookOpen } from "@/components/ui/icons";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { showError, showSuccess } from "@/lib/toast";

interface SkillData {
    name: string;
    path: string;
}

export function SkillsSettings() {
    const currentApp = useAtomValue(currentAppAtom);
    const [skills, setSkills] = useState<SkillData[]>([]);
    const [loading, setLoading] = useState(false);
    
    const loadSkills = async () => {
        if (!currentApp) return;
        setLoading(true);
        try {
            const appData = await appClient.getApp(currentApp.id);
            const skillFiles = appData.files.filter(f => f.startsWith(".opencode/skills/") && f.endsWith("/SKILL.md"));
            
            const loadedSkills = skillFiles.map(path => {
                const parts = path.split("/");
                const name = parts[parts.length - 2];
                return { name, path };
            });
            setSkills(loadedSkills);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadSkills();
    }, [currentApp]);

    if (!currentApp) {
        return (
            <div className="space-y-6">
                <div className="p-6 bg-muted/20 border border-border/50 rounded-lg text-center">
                    <BookOpen className="h-8 w-8 mx-auto text-muted-foreground/50 mb-3" />
                    <h3 className="typo-subsection-title mb-1">Skills del Proyecto</h3>
                    <p className="typo-caption text-muted-foreground">
                        Abre un proyecto para gestionar sus skills. Los skills son herramientas personalizadas que le enseñan al agente cómo usar librerías específicas o realizar tareas en tu proyecto.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="typo-subsection-title">Skills (Agentes de Conocimiento)</h3>
                    <p className="typo-caption mt-1">
                        Proyecto activo: <strong>{currentApp.name}</strong>. Los skills definen patrones y herramientas personalizadas.
                    </p>
                </div>
                <SkillDialog appId={currentApp.id} onSave={loadSkills} />
            </div>

            {loading ? (
                <div className="py-8 text-center text-muted-foreground typo-caption">
                    Cargando skills...
                </div>
            ) : skills.length === 0 ? (
                <div className="py-8 text-center border border-dashed rounded-lg">
                    <p className="typo-caption text-muted-foreground">No hay skills configurados en este proyecto.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {skills.map(skill => (
                        <div key={skill.path} className="flex items-center justify-between p-4 border border-border/50 rounded-lg bg-muted/5 group hover:border-primary/30 transition-colors">
                            <div className="flex items-start gap-3 overflow-hidden">
                                <div className="mt-0.5 bg-primary/10 p-2 rounded-md">
                                    <BookOpen className="h-4 w-4 text-primary" />
                                </div>
                                <div className="min-w-0">
                                    <h4 className="typo-label truncate">{skill.name}</h4>
                                    <p className="typo-mono-xs opacity-50 truncate mt-1">
                                        .opencode/skills/{skill.name}/
                                    </p>
                                </div>
                            </div>
                            <div className="flex gap-1 ml-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                <SkillDialog appId={currentApp.id} existingSkill={skill} onSave={loadSkills} />
                                <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="text-red-500 hover:text-red-600 hover:bg-red-500/10 h-8 w-8"
                                    onClick={async () => {
                                        if (confirm(`¿Eliminar el skill ${skill.name}?`)) {
                                            try {
                                                await appClient.deleteAppFile({ 
                                                    appId: currentApp.id, 
                                                    filePath: `.opencode/skills/${skill.name}` 
                                                });
                                                showSuccess("Skill eliminado");
                                                loadSkills();
                                            } catch(e) {
                                                showError("Error al eliminar skill");
                                            }
                                        }
                                    }}
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function SkillDialog({ appId, existingSkill, onSave }: { appId: number, existingSkill?: SkillData, onSave: () => void }) {
    const [open, setOpen] = useState(false);
    const [name, setName] = useState(existingSkill?.name || "");
    const [content, setContent] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (open && existingSkill) {
            setIsLoading(true);
            appClient.readAppFile({ appId, filePath: existingSkill.path })
                .then(setContent)
                .catch(() => showError("No se pudo cargar el skill"))
                .finally(() => setIsLoading(false));
        } else if (open && !existingSkill) {
            setName("");
            setContent(`---
name: nombre-del-skill
description: Breve descripción de para qué sirve este skill
allowed-tools:
  - read
  - write
---

# Instrucciones

Escribe aquí cómo debe comportarse el agente cuando use este skill...`);
        }
    }, [open, existingSkill, appId]);

    const handleSave = async () => {
        if (!name.trim() || !content.trim()) return;
        
        setIsLoading(true);
        try {
            const skillSlug = name.toLowerCase().replace(/[^a-z0-9_-]/g, "");
            const filePath = `.opencode/skills/${skillSlug}/SKILL.md`;
            
            // If renaming, delete old first
            if (existingSkill && existingSkill.name !== skillSlug) {
                await appClient.deleteAppFile({ appId, filePath: `.opencode/skills/${existingSkill.name}` }).catch(() => {});
            }
            
            await appClient.editAppFile({
                appId,
                filePath,
                content
            });
            
            showSuccess("Skill guardado con éxito");
            setOpen(false);
            onSave();
        } catch (e: any) {
            showError("Error al guardar: " + e.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {existingSkill ? (
                    <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground hover:bg-muted h-8 w-8">
                        <Pencil className="h-4 w-4" />
                    </Button>
                ) : (
                    <Button size="sm" className="gap-2">
                        <Plus className="h-4 w-4" />
                        Crear Skill
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[700px] max-h-[85vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>{existingSkill ? "Editar Skill" : "Crear Skill"}</DialogTitle>
                </DialogHeader>
                
                <div className="flex-1 overflow-y-auto space-y-4 py-4 pr-2">
                    <div className="space-y-2">
                        <label className="typo-label">Nombre del Skill</label>
                        <Input 
                            placeholder="mi-skill-personalizado" 
                            value={name} 
                            onChange={e => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))} 
                            disabled={isLoading}
                        />
                        <p className="typo-caption">Se usará como identificador en la carpeta del proyecto.</p>
                    </div>
                    
                    <div className="space-y-2 flex-1 flex flex-col">
                        <label className="typo-label">Contenido (SKILL.md)</label>
                        <textarea 
                            className="flex-1 min-h-[400px] w-full rounded-md border border-input bg-background px-3 py-2 typo-mono-xs ring-offset-background placeholder:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono"
                            value={content}
                            onChange={e => setContent(e.target.value)}
                            disabled={isLoading}
                            spellCheck={false}
                        />
                    </div>
                </div>
                
                <DialogFooter className="pt-2">
                    <Button variant="outline" onClick={() => setOpen(false)} disabled={isLoading}>Cancelar</Button>
                    <Button onClick={handleSave} disabled={!name.trim() || !content.trim() || isLoading}>
                        <Check className="h-4 w-4 mr-2" /> Guardar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
