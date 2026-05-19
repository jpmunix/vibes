import React, { useState, useEffect } from "react";
import { useAtomValue } from "jotai";
import { currentAppAtom } from "@/atoms/appAtoms";
import { ipc } from "@/ipc/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pencil, Plus, Trash2, Check, BookOpen, Globe, Folder } from "@/components/ui/icons";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { showError, showSuccess } from "@/lib/toast";
import { UnifiedSelector } from "@/components/ui/UnifiedSelector";

interface SkillData {
    name: string;
    path: string;
}

export function SkillsSettings() {
    const currentApp = useAtomValue(currentAppAtom);
    const [apps, setApps] = useState<{ id: number; name: string; path: string }[]>([]);
    const [selectedScope, setSelectedScope] = useState<string>("global");
    const [skills, setSkills] = useState<SkillData[]>([]);
    const [loading, setLoading] = useState(false);

    // List all apps registered in Vibes
    useEffect(() => {
        ipc.app.listApps()
            .then(res => {
                if (res && res.apps) {
                    setApps(res.apps.map(a => ({
                        id: a.id,
                        name: a.name,
                        path: a.path || ""
                    })));
                }
            })
            .catch(err => {
                console.error("Error listing apps for skills selector:", err);
            });
    }, []);

    // Set default scope based on the active project
    useEffect(() => {
        if (currentApp) {
            setSelectedScope(String(currentApp.id));
        } else {
            setSelectedScope("global");
        }
    }, [currentApp]);

    const loadSkills = async () => {
        setLoading(true);
        try {
            if (selectedScope === "global") {
                const globalSkills = await ipc.settings.listGlobalSkills();
                setSkills(globalSkills);
            } else {
                const appId = Number(selectedScope);
                const appData = await ipc.app.getApp(appId);
                const skillFiles = appData.files.filter(f => f.startsWith(".claude/skills/") && f.endsWith("/SKILL.md"));
                
                const loadedSkills = skillFiles.map(path => {
                    const parts = path.split("/");
                    const name = parts[parts.length - 2];
                    return { name, path };
                });
                setSkills(loadedSkills);
            }
        } catch (e) {
            console.error("Error loading skills:", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadSkills();
    }, [selectedScope]);

    const getResolvedPath = () => {
        if (selectedScope === "global") {
            return "~/.config/opencode/skills/";
        }
        const app = apps.find(a => String(a.id) === selectedScope);
        return app ? `${app.path}/.claude/skills/` : "";
    };

    const scopeOptions = [
        { 
            value: "global", 
            label: "Global (Vibes)", 
            description: "Disponible en todos los proyectos",
            leftIcon: <Globe className="h-3.5 w-3.5 text-primary" />
        },
        ...apps.map(app => ({
            value: String(app.id),
            label: `Proyecto: ${app.name}`,
            description: app.path,
            leftIcon: <Folder className="h-3.5 w-3.5 text-muted-foreground" />
        }))
    ];

    return (
        <div className="space-y-6">
            {/* Control Panel Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 border border-border bg-card rounded-xl shadow-sm">
                <div className="space-y-1 min-w-0">
                    <h3 className="typo-subsection-title text-foreground">Skills (Agentes de Conocimiento)</h3>
                    <p className="typo-mono-xs text-muted-foreground truncate" title={getResolvedPath()}>
                        {getResolvedPath()}
                    </p>
                </div>
                <div className="flex items-center gap-2.5 self-end sm:self-auto">
                    <UnifiedSelector
                        value={selectedScope}
                        onChange={setSelectedScope}
                        options={scopeOptions}
                        triggerVariant="default"
                        triggerSize="sm"
                        popoverWidth="w-[280px]"
                        itemLayout="default"
                    />
                    <SkillDialog scope={selectedScope} onSave={loadSkills} />
                </div>
            </div>

            {/* List Section */}
            {loading ? (
                <div className="py-12 text-center text-muted-foreground typo-caption">
                    Cargando skills...
                </div>
            ) : skills.length === 0 ? (
                <div className="py-12 text-center border border-dashed border-border/80 rounded-xl bg-muted/2">
                    <BookOpen className="h-8 w-8 mx-auto text-muted-foreground/30 mb-3" />
                    <p className="typo-caption text-muted-foreground">No hay skills configurados en este ámbito.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {skills.map(skill => (
                        <div key={skill.path} className="flex items-center justify-between p-4 border border-border/50 rounded-xl bg-card hover:bg-muted/3 hover:border-primary/20 hover:shadow-sm transition-all duration-200 group">
                            <div className="flex items-start gap-3.5 overflow-hidden">
                                <div className="mt-0.5 bg-primary/8 p-2 rounded-lg shrink-0">
                                    <BookOpen className="h-4.5 w-4.5 text-primary" />
                                </div>
                                <div className="min-w-0">
                                    <h4 className="typo-label text-foreground font-medium truncate">{skill.name}</h4>
                                    <p className="typo-mono-xs opacity-50 truncate mt-1">
                                        {selectedScope === "global" ? `${skill.name}/` : `.claude/skills/${skill.name}/`}
                                    </p>
                                </div>
                            </div>
                            <div className="flex gap-1 ml-4 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-200 shrink-0">
                                <SkillDialog scope={selectedScope} existingSkill={skill} onSave={loadSkills} />
                                <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="text-destructive hover:text-destructive-foreground hover:bg-destructive/10 h-8 w-8 rounded-lg"
                                    onClick={async () => {
                                        if (confirm(`¿Eliminar el skill "${skill.name}"?`)) {
                                            try {
                                                if (selectedScope === "global") {
                                                    await ipc.settings.deleteGlobalSkill({ filePath: skill.name });
                                                } else {
                                                    await ipc.app.deleteAppFile({ 
                                                        appId: Number(selectedScope), 
                                                        filePath: `.claude/skills/${skill.name}` 
                                                    });
                                                }
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

function SkillDialog({ scope, existingSkill, onSave }: { scope: string, existingSkill?: SkillData, onSave: () => void }) {
    const [open, setOpen] = useState(false);
    const [name, setName] = useState(existingSkill?.name || "");
    const [content, setContent] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (open && existingSkill) {
            setIsLoading(true);
            if (scope === "global") {
                ipc.settings.readGlobalSkill({ filePath: existingSkill.path })
                    .then(setContent)
                    .catch(() => showError("No se pudo cargar el skill global"))
                    .finally(() => setIsLoading(false));
            } else {
                ipc.app.readAppFile({ appId: Number(scope), filePath: existingSkill.path })
                    .then(setContent)
                    .catch(() => showError("No se pudo cargar el skill local"))
                    .finally(() => setIsLoading(false));
            }
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
    }, [open, existingSkill, scope]);

    const handleSave = async () => {
        if (!name.trim() || !content.trim()) return;
        
        setIsLoading(true);
        try {
            const skillSlug = name.toLowerCase().replace(/[^a-z0-9_-]/g, "");
            
            if (scope === "global") {
                const filePath = `${skillSlug}/SKILL.md`;
                
                // If renaming, delete old first
                if (existingSkill && existingSkill.name !== skillSlug) {
                    await ipc.settings.deleteGlobalSkill({ filePath: existingSkill.name }).catch(() => {});
                }
                
                await ipc.settings.editGlobalSkill({
                    filePath,
                    content
                });
            } else {
                const appId = Number(scope);
                const filePath = `.claude/skills/${skillSlug}/SKILL.md`;
                
                // If renaming, delete old first
                if (existingSkill && existingSkill.name !== skillSlug) {
                    await ipc.app.deleteAppFile({ appId, filePath: `.claude/skills/${existingSkill.name}` }).catch(() => {});
                }
                
                await ipc.app.editAppFile({
                    appId,
                    filePath,
                    content
                });
            }
            
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
                    <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground hover:bg-muted h-8 w-8 rounded-lg">
                        <Pencil className="h-4 w-4" />
                    </Button>
                ) : (
                    <Button size="sm" className="gap-2 rounded-lg font-medium">
                        <Plus className="h-4 w-4" />
                        Crear Skill
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[720px] max-h-[85vh] flex flex-col rounded-2xl">
                <DialogHeader>
                    <DialogTitle className="text-xl font-semibold text-foreground">
                        {existingSkill ? "Editar Skill" : "Crear Skill"}
                    </DialogTitle>
                </DialogHeader>
                
                <div className="flex-1 overflow-y-auto space-y-4 py-4 pr-1">
                    <div className="space-y-1.5">
                        <label className="typo-label text-muted-foreground text-xs font-medium uppercase tracking-wider">Nombre del Skill</label>
                        <Input 
                            placeholder="ej: mis-preferencias-de-codigo" 
                            value={name} 
                            onChange={e => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))} 
                            disabled={isLoading}
                            className="rounded-lg border-border"
                        />
                        <p className="typo-caption text-muted-foreground/75">Identificador único (letras, números y guiones).</p>
                    </div>
                    
                    <div className="space-y-1.5 flex-1 flex flex-col min-h-[350px]">
                        <label className="typo-label text-muted-foreground text-xs font-medium uppercase tracking-wider">Contenido (SKILL.md)</label>
                        <textarea 
                            className="flex-1 w-full rounded-lg border border-border bg-background px-3 py-2.5 typo-mono-xs ring-offset-background placeholder:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono text-sm leading-relaxed"
                            value={content}
                            onChange={e => setContent(e.target.value)}
                            disabled={isLoading}
                            spellCheck={false}
                        />
                    </div>
                </div>
                
                <DialogFooter className="pt-3 border-t border-border/40 gap-2">
                    <Button variant="outline" className="rounded-lg" onClick={() => setOpen(false)} disabled={isLoading}>Cancelar</Button>
                    <Button className="rounded-lg" onClick={handleSave} disabled={!name.trim() || !content.trim() || isLoading}>
                        <Check className="h-4 w-4 mr-2" /> Guardar Skill
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
