import React, { useState, useEffect } from "react";
import { useAtomValue } from "jotai";
import { currentAppAtom } from "@/atoms/appAtoms";
import { ipc } from "@/ipc/types";
import { Button } from "@/components/ui/button";
import { AiStrategistAssistant } from "./AiStrategistAssistant";
import { Input } from "@/components/ui/input";
import { Pencil, Plus, Trash2, Check, ChevronRight } from "@/components/ui/icons";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { showError, showSuccess } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { DeleteConfirmationDialog } from "@/components/DeleteConfirmationDialog";

interface SkillData {
    name: string;
    path: string;
    enabled: boolean;
}

interface SkillGroupProps {
    title: string;
    skills: SkillData[];
    scope: string;
    apps: { id: number; name: string; path: string }[];
    onDelete: (skill: SkillData, scope: string) => void;
    onToggleEnabled: (skill: SkillData, scope: string, checked: boolean) => void;
    onRefresh: () => void;
}

function SkillGroup({
    title,
    skills,
    scope,
    apps,
    onDelete,
    onToggleEnabled,
    onRefresh
}: SkillGroupProps) {
    const [expanded, setExpanded] = useState(false);

    return (
        <div className="space-y-2">
            <div
                className="flex items-center justify-between cursor-pointer group p-4 rounded-xl border border-border hover:bg-muted/50 transition-colors gap-4 bg-muted/20"
                onClick={() => setExpanded(e => !e)}
            >
                <div className="flex-1">
                    <h3 className="typo-label flex items-center gap-2">
                        {title}
                        <span className="text-muted-foreground typo-caption">({skills.length})</span>
                    </h3>
                </div>
                <ChevronRight
                    className={cn(
                        "size-5 text-muted-foreground/50 group-hover:text-foreground transition-transform duration-200 shrink-0",
                        expanded && "rotate-90"
                    )}
                />
            </div>

            {expanded && (
                <div className="pl-4 space-y-2">
                    {skills.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic py-2 pl-2">No hay skills creados.</p>
                    ) : (
                        skills.map(skill => (
                            <div key={skill.path} className={cn("flex items-center justify-between p-4 border border-border rounded-xl bg-card hover:bg-muted/30 transition-all duration-200 group gap-4", !skill.enabled && "opacity-60")}>
                                <div className="flex-1 flex items-center gap-3 min-w-0">
                                    <Switch
                                        checked={skill.enabled}
                                        onCheckedChange={(checked) => onToggleEnabled(skill, scope, checked)}
                                    />
                                    <div className="min-w-0">
                                        <h4 className="typo-label text-foreground font-medium truncate flex items-center gap-2">
                                            {skill.name}
                                            {!skill.enabled && (
                                                <span className="typo-micro px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-normal">
                                                    DESACTIVADO
                                                </span>
                                            )}
                                        </h4>
                                        <p className="typo-mono-xs text-muted-foreground/70 mt-1 truncate">
                                            {scope === "global" ? `${skill.name}/` : `.claude/skills/${skill.name}/`}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-200 shrink-0 ml-4">
                                    <SkillDialog apps={apps} existingSkill={skill} existingScope={scope} onSave={onRefresh} />
                                    <DeleteConfirmationDialog
                                        itemName={skill.name}
                                        itemType="Skill"
                                        onDelete={() => onDelete(skill, scope)}
                                        trigger={
                                            <Button 
                                                variant="ghost" 
                                                size="icon" 
                                                className="text-destructive hover:text-destructive-foreground hover:bg-destructive/10 h-8 w-8 rounded-lg"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        }
                                    />
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}

export function SkillsSettings() {
    const currentApp = useAtomValue(currentAppAtom);
    const [apps, setApps] = useState<{ id: number; name: string; path: string }[]>([]);
    const [globalSkills, setGlobalSkills] = useState<SkillData[]>([]);
    const [projectsWithSkills, setProjectsWithSkills] = useState<{ app: { id: number; name: string; path: string }; skills: SkillData[] }[]>([]);
    const [loading, setLoading] = useState(false);

    const loadAllSkills = async () => {
        setLoading(true);
        try {
            // 1. Load global skills
            const gSkills = await ipc.settings.listGlobalSkills();
            setGlobalSkills(gSkills);

            // 2. Load apps list
            const res = await ipc.app.listApps();
            const appsList = res?.apps || [];
            const mappedApps = appsList.map(a => ({
                id: a.id,
                name: a.name,
                path: a.path || ""
            }));
            setApps(mappedApps);

            // 3. Scan each app for local skills
            const projectsWithSkillsList: { app: { id: number; name: string; path: string }; skills: SkillData[] }[] = [];
            
            await Promise.all(mappedApps.map(async (app) => {
                try {
                    const appData = await ipc.app.getApp(app.id);
                    const skillFiles = (appData.files || []).filter(f => f.startsWith(".claude/skills/") && (f.endsWith("/SKILL.md") || f.endsWith("/SKILL.disabled")));
                    const loadedSkills = skillFiles.map(path => {
                        const parts = path.split("/");
                        const name = parts[parts.length - 2];
                        const enabled = path.endsWith("/SKILL.md");
                        return { name, path, enabled };
                    });
                    if (loadedSkills.length > 0) {
                        projectsWithSkillsList.push({
                            app,
                            skills: loadedSkills
                        });
                    }
                } catch (err) {
                    console.error(`Error loading skills for app ${app.name}:`, err);
                }
            }));
            
            setProjectsWithSkills(projectsWithSkillsList);
        } catch (e) {
            console.error("Error loading all skills:", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadAllSkills();
    }, []);

    const handleDelete = async (skill: SkillData, scope: string) => {
        try {
            if (scope === "global") {
                await ipc.settings.deleteGlobalSkill({ filePath: skill.name });
            } else {
                await ipc.app.deleteAppFile({ 
                    appId: Number(scope), 
                    filePath: `.claude/skills/${skill.name}` 
                });
            }
            showSuccess("Skill eliminado");
            loadAllSkills();
        } catch {
            showError("Error al eliminar skill");
        }
    };

    const handleToggleEnabled = async (skill: SkillData, scope: string, checked: boolean) => {
        try {
            const oldName = checked ? "SKILL.disabled" : "SKILL.md";
            const newName = checked ? "SKILL.md" : "SKILL.disabled";
            if (scope === "global") {
                await ipc.settings.renameGlobalSkill({
                    oldPath: `${skill.name}/${oldName}`,
                    newPath: `${skill.name}/${newName}`
                });
            } else {
                await ipc.app.renameAppFile({
                    appId: Number(scope),
                    oldPath: `.claude/skills/${skill.name}/${oldName}`,
                    newPath: `.claude/skills/${skill.name}/${newName}`
                });
            }
            showSuccess(checked ? "Skill activado" : "Skill desactivado");
            loadAllSkills();
        } catch {
            showError("Error al cambiar estado del skill");
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h3 className="text-sm font-semibold">Skills del Agente</h3>
                <SkillDialog apps={apps} currentAppId={currentApp?.id} onSave={loadAllSkills} />
            </div>

            {/* List Section */}
            {loading ? (
                <div className="py-12 text-center text-muted-foreground typo-caption">
                    Cargando skills...
                </div>
            ) : globalSkills.length === 0 && projectsWithSkills.length === 0 ? (
                <div className="py-12 text-center border border-dashed border-border/80 rounded-xl bg-muted/10">
                    <p className="typo-caption text-muted-foreground">No hay ningún skill configurado. Haz clic en "Crear Skill" para empezar.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {/* Global Skill Group */}
                    <SkillGroup 
                        title="Global" 
                        skills={globalSkills} 
                        scope="global" 
                        apps={apps} 
                        onDelete={handleDelete} 
                        onToggleEnabled={handleToggleEnabled}
                        onRefresh={loadAllSkills} 
                    />

                    {/* Local Skill Groups */}
                    {projectsWithSkills.map(project => (
                        <SkillGroup 
                            key={project.app.id}
                            title={`Proyecto: ${project.app.name}`} 
                            skills={project.skills} 
                            scope={String(project.app.id)} 
                            apps={apps} 
                            onDelete={handleDelete} 
                            onToggleEnabled={handleToggleEnabled}
                            onRefresh={loadAllSkills} 
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

interface SkillDialogProps {
    apps: { id: number; name: string; path: string }[];
    currentAppId?: number;
    existingSkill?: SkillData;
    existingScope?: string; // "global" or String(appId)
    onSave: () => void;
}

function SkillDialog({ apps, currentAppId, existingSkill, existingScope, onSave }: SkillDialogProps) {
    const [open, setOpen] = useState(false);
    const [name, setName] = useState(existingSkill?.name || "");
    const [content, setContent] = useState("");
    const [scope, setScope] = useState<string>("global");
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (open) {
            if (existingSkill && existingScope) {
                setName(existingSkill.name);
                setScope(existingScope);
                setIsLoading(true);
                if (existingScope === "global") {
                    ipc.settings.readGlobalSkill({ filePath: existingSkill.path })
                        .then(setContent)
                        .catch(() => showError("No se pudo cargar el skill global"))
                        .finally(() => setIsLoading(false));
                } else {
                    ipc.app.readAppFile({ appId: Number(existingScope), filePath: existingSkill.path })
                        .then(setContent)
                        .catch(() => showError("No se pudo cargar el skill local"))
                        .finally(() => setIsLoading(false));
                }
            } else {
                setName("");
                setScope("global");
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
        }
    }, [open, existingSkill, existingScope, currentAppId]);

    const handleSave = async () => {
        if (!name.trim() || !content.trim()) return;
        
        setIsLoading(true);
        try {
            const skillSlug = name.toLowerCase().replace(/[^a-z0-9_-]/g, "");
            const isEnabled = existingSkill ? existingSkill.enabled : true;
            const ext = isEnabled ? "SKILL.md" : "SKILL.disabled";
            
            if (scope === "global") {
                const filePath = `${skillSlug}/${ext}`;
                
                // If renaming or changing scope, delete old first
                if (existingSkill && (existingSkill.name !== skillSlug || existingScope !== scope)) {
                    if (existingScope === "global") {
                        await ipc.settings.deleteGlobalSkill({ filePath: existingSkill.name }).catch(() => {});
                    } else {
                        await ipc.app.deleteAppFile({ appId: Number(existingScope), filePath: `.claude/skills/${existingSkill.name}` }).catch(() => {});
                    }
                }
                
                await ipc.settings.editGlobalSkill({
                    filePath,
                    content
                });
            } else {
                const appId = Number(scope);
                const filePath = `.claude/skills/${skillSlug}/${ext}`;
                
                // If renaming or changing scope, delete old first
                if (existingSkill && (existingSkill.name !== skillSlug || existingScope !== scope)) {
                    if (existingScope === "global") {
                        await ipc.settings.deleteGlobalSkill({ filePath: existingSkill.name }).catch(() => {});
                    } else {
                        await ipc.app.deleteAppFile({ appId: Number(existingScope), filePath: `.claude/skills/${existingSkill.name}` }).catch(() => {});
                    }
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
            <DialogContent className="sm:max-w-[975px] max-h-[85vh] flex flex-col rounded-2xl">
                <DialogHeader>
                    <DialogTitle className="text-xl font-semibold text-foreground">
                        {existingSkill ? "Editar Skill" : "Crear Skill"}
                    </DialogTitle>
                </DialogHeader>
                
                <div className="flex-1 overflow-y-auto space-y-4 py-4 pr-1">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="typo-label text-muted-foreground text-xs font-medium uppercase tracking-wider">Nombre del Skill</label>
                            <Input 
                                placeholder="ej: mis-preferencias-de-codigo" 
                                value={name} 
                                onChange={e => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))} 
                                disabled={isLoading}
                                className="rounded-lg border-border"
                            />
                            <p className="typo-caption text-muted-foreground/75">Letras, números y guiones.</p>
                        </div>
                        
                        <div className="space-y-1.5">
                            <label className="typo-label text-muted-foreground text-xs font-medium uppercase tracking-wider">Ámbito (Scope)</label>
                            <Select 
                                value={scope} 
                                onValueChange={setScope}
                                disabled={!!existingSkill || isLoading}
                            >
                                <SelectTrigger className="w-full h-9 rounded-lg border-border bg-background">
                                    <SelectValue placeholder="Selecciona el ámbito" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="global">
                                        Global
                                    </SelectItem>
                                    {apps.map(app => (
                                        <SelectItem key={app.id} value={String(app.id)}>
                                            Proyecto: {app.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="typo-caption text-muted-foreground/75">Dónde guardar el skill.</p>
                        </div>
                    </div>
                    
                    <div className="space-y-1.5 flex-1 flex flex-col min-h-[350px]">
                        <div className="flex justify-between items-center mb-3">
                            <label className="typo-label text-muted-foreground text-xs font-medium uppercase tracking-wider">Contenido (SKILL.md)</label>
                            <AiStrategistAssistant type="skill" currentContent={content} onAccept={setContent} />
                        </div>
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
