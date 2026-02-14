import { useCallback, useRef, useState } from "react";
import { useAtom, useSetAtom, useAtomValue } from "jotai";
import {
    planAtom,
    planCollapsedAtom,
    planReadOnlyAtom,
    planLoadingAtom,
    planInputValueAtom,
    type Plan,
    type PlanStage,
    type PlanTask,
} from "@/atoms/planAtoms";
import { selectedChatIdAtom } from "@/atoms/chatAtoms";
import { useSettings } from "@/hooks/useSettings";
import { useStreamChat } from "@/hooks/useStreamChat";
import { Button } from "@/components/ui/button";
import {
    ChevronDown,
    ChevronUp,
    Pencil,
    Trash2,
    Check,
    X,
    Loader2,
    ListChecks,
    Rocket,
    Send,
    CheckSquare,
    Square,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ipc } from "@/ipc/types";

// ---- Helpers ----

let nextId = 1;
function genId(prefix = "item") {
    return `${prefix}_${nextId++}_${Date.now()}`;
}

/**
 * Parse structured plan text from AI response into a Plan object.
 * Expected format:
 * # Objetivo: ...
 * ## Etapa 1: Title
 * Summary text
 * - [ ] Task 1
 * - [x] Task 2
 */
export function parsePlanFromText(text: string): Plan | null {
    const lines = text.split("\n");
    let objective = "";
    const stages: PlanStage[] = [];
    let currentStage: PlanStage | null = null;
    let summaryLines: string[] = [];

    for (const line of lines) {
        const trimmed = line.trim();

        // Objective line
        if (
            trimmed.startsWith("# Objetivo:") ||
            trimmed.startsWith("# Objetivo ")
        ) {
            objective = trimmed
                .replace(/^#\s*Objetivo[:\s]*/i, "")
                .trim();
            continue;
        }

        // Stage header
        const stageMatch = trimmed.match(
            /^##\s+(Etapa\s+\d+[:\s]*)?(.+)/i,
        );
        if (stageMatch) {
            // Save previous stage's summary
            if (currentStage) {
                if (!currentStage.summary && summaryLines.length > 0) {
                    currentStage.summary = summaryLines.join("\n").trim();
                }
                stages.push(currentStage);
            }
            summaryLines = [];
            currentStage = {
                id: genId("stage"),
                title: (stageMatch[2] || stageMatch[1] || "").trim(),
                summary: "",
                tasks: [],
            };
            continue;
        }

        // Task line with checkbox
        const taskMatch = trimmed.match(/^-\s*\[([ xX])\]\s+(.+)/);
        if (taskMatch && currentStage) {
            // Save accumulated summary before first task
            if (currentStage.tasks.length === 0 && summaryLines.length > 0) {
                currentStage.summary = summaryLines.join("\n").trim();
                summaryLines = [];
            }
            currentStage.tasks.push({
                id: genId("task"),
                text: taskMatch[2].trim(),
                checked: taskMatch[1].toLowerCase() === "x",
            });
            continue;
        }

        // Accumulate summary lines (non-empty, non-header, non-task)
        if (currentStage && trimmed && !trimmed.startsWith("#")) {
            summaryLines.push(trimmed);
        }
    }

    // Push last stage
    if (currentStage) {
        if (!currentStage.summary && summaryLines.length > 0) {
            currentStage.summary = summaryLines.join("\n").trim();
        }
        stages.push(currentStage);
    }

    if (stages.length === 0) return null;

    return { objective, stages };
}

/**
 * Convert plan back to text for the AI prompt.
 */
export function planToPromptText(
    plan: Plan,
    onlyChecked: boolean,
): string {
    const parts: string[] = [];
    if (plan.objective) {
        parts.push(`# Objetivo: ${plan.objective}`);
    }

    for (const stage of plan.stages) {
        const tasks = onlyChecked
            ? stage.tasks.filter((t) => t.checked)
            : stage.tasks;
        if (tasks.length === 0 && onlyChecked) continue;

        parts.push(`\n## ${stage.title}`);
        if (stage.summary) parts.push(stage.summary);
        for (const task of tasks) {
            parts.push(`- [${task.checked ? "x" : " "}] ${task.text}`);
        }
    }

    return parts.join("\n");
}

// ---- Sub-components ----

function PlanTaskItem({
    task,
    readOnly,
    onToggle,
    onEdit,
    onDelete,
}: {
    task: PlanTask;
    readOnly: boolean;
    onToggle: () => void;
    onEdit: (newText: string) => void;
    onDelete: () => void;
}) {
    const [editing, setEditing] = useState(false);
    const [editText, setEditText] = useState(task.text);
    const inputRef = useRef<HTMLInputElement>(null);

    const startEdit = () => {
        setEditText(task.text);
        setEditing(true);
        setTimeout(() => inputRef.current?.focus(), 50);
    };

    const confirmEdit = () => {
        if (editText.trim()) {
            onEdit(editText.trim());
        }
        setEditing(false);
    };

    const cancelEdit = () => {
        setEditText(task.text);
        setEditing(false);
    };

    return (
        <div
            className={cn(
                "group flex items-start gap-2 py-1.5 px-2 rounded-md transition-colors",
                "hover:bg-muted/40",
                task.checked && "opacity-70",
            )}
        >
            {/* Checkbox */}
            <button
                onClick={onToggle}
                disabled={readOnly}
                className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground transition-colors disabled:cursor-default"
                title={task.checked ? "Desmarcar" : "Marcar"}
            >
                {task.checked ? (
                    <CheckSquare className="h-4 w-4 text-teal-500" />
                ) : (
                    <Square className="h-4 w-4" />
                )}
            </button>

            {/* Text / Edit input */}
            {editing ? (
                <div className="flex-1 flex items-center gap-1">
                    <input
                        ref={inputRef}
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") confirmEdit();
                            if (e.key === "Escape") cancelEdit();
                        }}
                        className="flex-1 bg-transparent border-b border-teal-400 text-sm outline-none py-0.5"
                    />
                    <button onClick={confirmEdit} className="text-teal-500 hover:text-teal-400">
                        <Check className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={cancelEdit} className="text-muted-foreground hover:text-foreground">
                        <X className="h-3.5 w-3.5" />
                    </button>
                </div>
            ) : (
                <span
                    className={cn(
                        "flex-1 text-sm leading-relaxed",
                        task.checked && "line-through text-muted-foreground",
                    )}
                >
                    {task.text}
                </span>
            )}

            {/* Actions (only visible on hover, hidden in read-only) */}
            {!readOnly && !editing && (
                <div className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                        onClick={startEdit}
                        className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                        title="Editar tarea"
                    >
                        <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                        onClick={onDelete}
                        className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                        title="Eliminar tarea"
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                    </button>
                </div>
            )}
        </div>
    );
}

function PlanStageSection({
    stage,
    readOnly,
    onUpdateStage,
    onDeleteStage,
}: {
    stage: PlanStage;
    readOnly: boolean;
    onUpdateStage: (updated: PlanStage) => void;
    onDeleteStage: () => void;
}) {
    const [editingTitle, setEditingTitle] = useState(false);
    const [titleText, setTitleText] = useState(stage.title);

    const toggleTask = (taskId: string) => {
        onUpdateStage({
            ...stage,
            tasks: stage.tasks.map((t) =>
                t.id === taskId ? { ...t, checked: !t.checked } : t,
            ),
        });
    };

    const editTask = (taskId: string, newText: string) => {
        onUpdateStage({
            ...stage,
            tasks: stage.tasks.map((t) =>
                t.id === taskId ? { ...t, text: newText } : t,
            ),
        });
    };

    const deleteTask = (taskId: string) => {
        onUpdateStage({
            ...stage,
            tasks: stage.tasks.filter((t) => t.id !== taskId),
        });
    };

    const checkedCount = stage.tasks.filter((t) => t.checked).length;

    return (
        <div className="mb-3">
            {/* Stage header */}
            <div className="flex items-center gap-2 mb-1">
                {editingTitle && !readOnly ? (
                    <div className="flex-1 flex items-center gap-1">
                        <input
                            autoFocus
                            value={titleText}
                            onChange={(e) => setTitleText(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    onUpdateStage({ ...stage, title: titleText.trim() || stage.title });
                                    setEditingTitle(false);
                                }
                                if (e.key === "Escape") {
                                    setTitleText(stage.title);
                                    setEditingTitle(false);
                                }
                            }}
                            className="flex-1 bg-transparent border-b border-teal-400 text-sm font-semibold outline-none"
                        />
                    </div>
                ) : (
                    <h4
                        className={cn(
                            "text-sm font-semibold text-foreground",
                            !readOnly && "cursor-pointer hover:text-teal-500 transition-colors",
                        )}
                        onClick={() => {
                            if (!readOnly) {
                                setTitleText(stage.title);
                                setEditingTitle(true);
                            }
                        }}
                    >
                        {stage.title}
                    </h4>
                )}
                <span className="text-xs text-muted-foreground">
                    {checkedCount}/{stage.tasks.length}
                </span>
                {!readOnly && (
                    <button
                        onClick={onDeleteStage}
                        className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Eliminar etapa"
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                    </button>
                )}
            </div>

            {/* Summary */}
            {stage.summary && (
                <p className="text-xs text-muted-foreground mb-1.5 pl-1">
                    {stage.summary}
                </p>
            )}

            {/* Tasks */}
            <div className="pl-1">
                {stage.tasks.map((task) => (
                    <PlanTaskItem
                        key={task.id}
                        task={task}
                        readOnly={readOnly}
                        onToggle={() => toggleTask(task.id)}
                        onEdit={(newText) => editTask(task.id, newText)}
                        onDelete={() => deleteTask(task.id)}
                    />
                ))}
            </div>
        </div>
    );
}

// ---- Main PlanPanel ----

export function PlanPanel({ chatId }: { chatId?: number }) {
    const [plan, setPlan] = useAtom(planAtom);
    const [collapsed, setCollapsed] = useAtom(planCollapsedAtom);
    const [readOnly, setReadOnly] = useAtom(planReadOnlyAtom);
    const [loading, setLoading] = useAtom(planLoadingAtom);
    const [planInput, setPlanInput] = useAtom(planInputValueAtom);
    const { settings, updateSettings } = useSettings();
    const { streamMessage } = useStreamChat();

    // Don't render if no plan exists
    if (!plan) return null;

    const totalTasks = plan.stages.reduce((sum, s) => sum + s.tasks.length, 0);
    const checkedTasks = plan.stages.reduce(
        (sum, s) => sum + s.tasks.filter((t) => t.checked).length,
        0,
    );
    const hasChecked = checkedTasks > 0;
    const allChecked = checkedTasks === totalTasks && totalTasks > 0;

    const updateStage = (stageId: string, updated: PlanStage) => {
        setPlan((prev) => {
            if (!prev) return prev;
            return {
                ...prev,
                stages: prev.stages.map((s) => (s.id === stageId ? updated : s)),
            };
        });
    };

    const deleteStage = (stageId: string) => {
        setPlan((prev) => {
            if (!prev) return prev;
            return {
                ...prev,
                stages: prev.stages.filter((s) => s.id !== stageId),
            };
        });
    };

    const toggleAll = () => {
        const newChecked = !allChecked;
        setPlan((prev) => {
            if (!prev) return prev;
            return {
                ...prev,
                stages: prev.stages.map((s) => ({
                    ...s,
                    tasks: s.tasks.map((t) => ({ ...t, checked: newChecked })),
                })),
            };
        });
    };

    const handleDevelop = (onlySelected: boolean) => {
        if (!plan || !chatId) return;

        // Build prompt from plan
        const planText = planToPromptText(plan, onlySelected);
        const developPrompt = onlySelected
            ? `Implementa las siguientes tareas seleccionadas del plan:\n\n${planText}\n\nComienza a desarrollar cada tarea seleccionada ([x]) en orden. Genera el código necesario.`
            : `Implementa el siguiente plan completo:\n\n${planText}\n\nComienza a desarrollar cada tarea en orden. Genera el código necesario.`;

        // Switch to development mode
        const devMode = settings?.defaultChatMode === "local-agent" ? "local-agent" : "build";
        updateSettings({ selectedChatMode: devMode });

        // Make plan read-only and collapse
        setReadOnly(true);
        setCollapsed(true);

        // Send to chat
        streamMessage({
            prompt: developPrompt,
            chatId,
        });
    };

    const handlePlanInputSubmit = () => {
        if (!planInput.trim() || !chatId || loading) return;

        const modificationPrompt = `El usuario tiene el siguiente plan activo:\n\n${planToPromptText(plan, false)}\n\nEl usuario solicita el siguiente cambio al plan:\n${planInput}\n\nActualiza el plan completo con el cambio solicitado. Responde SOLO con el plan actualizado en el formato estructurado (# Objetivo, ## Etapa, - [ ] tarea).`;

        setLoading(true);
        setPlanInput("");

        // Send to AI for plan update
        streamMessage({
            prompt: modificationPrompt,
            chatId,
        });
    };

    return (
        <div
            className={cn(
                "border-t border-border bg-background/95 backdrop-blur-sm transition-all duration-200",
                collapsed ? "max-h-10" : "max-h-[50vh]",
            )}
        >
            {/* Header bar (always visible) */}
            <button
                onClick={() => setCollapsed(!collapsed)}
                className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted/30 transition-colors"
            >
                <div className="flex items-center gap-2">
                    <ListChecks className="h-4 w-4 text-teal-500" />
                    <span className="text-xs font-medium text-foreground">
                        Plan
                    </span>
                    {plan.objective && (
                        <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                            — {plan.objective}
                        </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                        ({checkedTasks}/{totalTasks})
                    </span>
                </div>
                {collapsed ? (
                    <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                )}
            </button>

            {/* Expanded content */}
            {!collapsed && (
                <div className="flex flex-col overflow-hidden">
                    {/* Scrollable plan stages */}
                    <div className="overflow-y-auto max-h-[35vh] px-3 pb-2">
                        {plan.stages.map((stage) => (
                            <PlanStageSection
                                key={stage.id}
                                stage={stage}
                                readOnly={readOnly}
                                onUpdateStage={(updated) => updateStage(stage.id, updated)}
                                onDeleteStage={() => deleteStage(stage.id)}
                            />
                        ))}
                    </div>

                    {/* Action bar (hidden in read-only mode) */}
                    {!readOnly && (
                        <div className="border-t border-border/50 px-3 py-2 space-y-2">
                            {/* Toggle all + Develop buttons */}
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={toggleAll}
                                    className="text-xs h-7 gap-1"
                                >
                                    {allChecked ? (
                                        <Square className="h-3.5 w-3.5" />
                                    ) : (
                                        <CheckSquare className="h-3.5 w-3.5" />
                                    )}
                                    {allChecked ? "Desmarcar todo" : "Marcar todo"}
                                </Button>

                                <div className="flex-1" />

                                {hasChecked && !allChecked && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleDevelop(true)}
                                        className="text-xs h-7 gap-1 border-teal-500/30 text-teal-600 dark:text-teal-400 hover:bg-teal-500/10"
                                    >
                                        <Rocket className="h-3.5 w-3.5" />
                                        Desarrollar selección ({checkedTasks})
                                    </Button>
                                )}

                                <Button
                                    size="sm"
                                    onClick={() => handleDevelop(false)}
                                    className="text-xs h-7 gap-1 bg-teal-600 hover:bg-teal-700 text-white"
                                >
                                    <Rocket className="h-3.5 w-3.5" />
                                    Desarrollar todo
                                </Button>
                            </div>

                            {/* Plan modification input */}
                            <div className="flex items-center gap-2">
                                <input
                                    value={planInput}
                                    onChange={(e) => setPlanInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" && !e.shiftKey) {
                                            e.preventDefault();
                                            handlePlanInputSubmit();
                                        }
                                    }}
                                    placeholder="Pide cambios al plan..."
                                    className="flex-1 text-xs bg-muted/50 border border-border/50 rounded-md px-2.5 py-1.5 outline-none focus:border-teal-500/50 transition-colors"
                                    disabled={loading}
                                />
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={handlePlanInputSubmit}
                                    disabled={!planInput.trim() || loading}
                                    className="h-7 w-7 p-0"
                                >
                                    {loading ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                        <Send className="h-3.5 w-3.5" />
                                    )}
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
