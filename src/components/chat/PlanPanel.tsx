import { useCallback, useRef, useState } from "react";
import { useSetAtom, useAtomValue } from "jotai";
import {
    plansByChatIdAtom,
    planCollapsedByChatIdAtom,
    planLoadingByChatIdAtom,
    type Plan,
    type PlanStage,
    type PlanTask,
} from "@/atoms/planAtoms";
import { selectedChatIdAtom, isStreamingByIdAtom } from "@/atoms/chatAtoms";
import { selectedAppIdAtom } from "@/atoms/appAtoms";
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
    CheckSquare,
    Square,
    CheckCircle,
} from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { ipc } from "@/ipc/types";

// ---- Helpers ----

let nextId = 1;
function genId(prefix = "item") {
    return `${prefix}_${nextId++}_${Date.now()}`;
}

function updateMapAtom<K, V>(
    setter: (fn: (prev: Map<K, V>) => Map<K, V>) => void,
    key: K,
    value: V,
) {
    setter((prev) => {
        const next = new Map(prev);
        next.set(key, value);
        return next;
    });
}

/**
 * Parse structured plan text from AI response into a Plan object.
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
                "group flex items-start gap-2.5 py-1.5 px-2.5 rounded-md transition-colors",
                "hover:bg-muted/40",
                task.checked && "opacity-70",
            )}
        >
            {/* Checkbox */}
            <button
                onClick={onToggle}
                disabled={readOnly || task.isDeveloped}
                className="mt-px shrink-0 text-muted-foreground hover:text-foreground transition-colors disabled:cursor-default"
                title={task.isDeveloped ? "Desarrollado" : task.checked ? "Desmarcar" : "Marcar"}
            >
                {task.isDeveloped ? (
                    <CheckCircle className="h-3.5 w-3.5 text-primary" />
                ) : task.checked ? (
                    <CheckSquare className="h-3.5 w-3.5 text-primary" />
                ) : (
                    <Square className="h-3.5 w-3.5" />
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
                        className="flex-1 bg-transparent border-b border-primary text-sm outline-none py-0.5"
                    />
                    <button onClick={confirmEdit} className="text-primary hover:text-primary/80">
                        <Check className="h-3 w-3" />
                    </button>
                    <button onClick={cancelEdit} className="text-muted-foreground hover:text-foreground">
                        <X className="h-3 w-3" />
                    </button>
                </div>
            ) : (
                <span
                    className={cn(
                        "flex-1 text-sm leading-relaxed",
                        (task.checked || task.isDeveloped) && "text-muted-foreground",
                        task.isDeveloped && "line-through opacity-70",
                    )}
                >
                    {task.text}
                </span>
            )}

            {/* Actions (only visible on hover, hidden in read-only) */}
            {!readOnly && !editing && !task.isDeveloped && (
                <div className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                        onClick={startEdit}
                        className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                        title="Editar tarea"
                    >
                        <Pencil className="h-3 w-3" />
                    </button>
                    <button
                        onClick={onDelete}
                        className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                        title="Eliminar tarea"
                    >
                        <Trash2 className="h-3 w-3" />
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
            <div className="flex items-center gap-2 mb-0.5">
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
                            className="flex-1 bg-transparent border-b border-primary text-sm font-medium outline-none"
                        />
                    </div>
                ) : (
                    <h4
                        className={cn(
                            "text-sm font-medium text-foreground",
                            !readOnly && "cursor-pointer hover:text-primary transition-colors",
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
                <span className="text-xs text-muted-foreground/70">
                    {checkedCount}/{stage.tasks.length}
                </span>
                {!readOnly && (
                    <button
                        onClick={onDeleteStage}
                        className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Eliminar etapa"
                    >
                        <Trash2 className="h-3 w-3" />
                    </button>
                )}
            </div>

            {/* Summary */}
            {stage.summary && (
                <p className="text-xs text-muted-foreground/80 mb-1 pl-1 leading-relaxed">
                    {stage.summary}
                </p>
            )}

            {/* Tasks */}
            <div className="pl-0.5">
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
    const plans = useAtomValue(plansByChatIdAtom);
    const setPlans = useSetAtom(plansByChatIdAtom);
    const collapsedMap = useAtomValue(planCollapsedByChatIdAtom);
    const setCollapsed = useSetAtom(planCollapsedByChatIdAtom);

    const { settings, updateSettings } = useSettings();
    const { streamMessage } = useStreamChat();
    const streamingMap = useAtomValue(isStreamingByIdAtom);
    const isStreaming = chatId ? (streamingMap.get(chatId) ?? false) : false;
    const plan = chatId ? (plans.get(chatId) ?? null) : null;

    // Helper: update plan in atom AND persist to DB
    const savePlan = useCallback((newPlan: Plan) => {
        if (!chatId) return;
        updateMapAtom(setPlans, chatId, newPlan);
        // Persist to DB (fire-and-forget)
        ipc.chat.savePlanData({ chatId, planData: newPlan }).then(() => {
            window.dispatchEvent(new Event("plan-chat-db-update"));
        }).catch(err =>
            console.error("Failed to save plan:", err)
        );
    }, [chatId, setPlans]);

    if (!chatId) return null;

    const collapsed = collapsedMap.get(chatId) ?? true;

    // Don't render if no plan exists
    if (!plan) return null;

    const totalTasks = plan.stages.reduce((sum, s) => sum + s.tasks.length, 0);
    const completedTasks = plan.stages.reduce(
        (sum, s) => sum + s.tasks.filter((t) => t.checked || t.isDeveloped).length,
        0,
    );
    const selectedTasks = plan.stages.reduce(
        (sum, s) => sum + s.tasks.filter((t) => t.checked && !t.isDeveloped).length,
        0,
    );
    const hasChecked = selectedTasks > 0;
    const allChecked = completedTasks === totalTasks && totalTasks > 0;
    // When all tasks are done, the plan becomes fully read-only (reference only)
    const allCompleted = allChecked;
    const effectiveReadOnly = allCompleted;

    const updateStage = (stageId: string, updated: PlanStage) => {
        savePlan({
            ...plan,
            stages: plan.stages.map((s) => (s.id === stageId ? updated : s)),
        });
    };

    const deleteStage = (stageId: string) => {
        savePlan({
            ...plan,
            stages: plan.stages.filter((s) => s.id !== stageId),
        });
    };

    const toggleAll = () => {
        const newChecked = !allChecked;
        savePlan({
            ...plan,
            stages: plan.stages.map((s) => ({
                ...s,
                tasks: s.tasks.map((t) => t.isDeveloped ? t : ({ ...t, checked: newChecked })),
            })),
        });
    };

    const handleDevelop = (onlySelected: boolean) => {
        // Filter tasks to develop (checked AND not already developed)
        // If develop all (onlySelected=false), we select all non-developed tasks
        const tasksToDevelop = plan.stages
            .flatMap(s => s.tasks)
            .filter(t => !t.isDeveloped && (onlySelected ? t.checked : true));

        if (tasksToDevelop.length === 0) return;

        // Mark them as developed in the state and save to DB
        const taskIdsToMark = new Set(tasksToDevelop.map(t => t.id));
        savePlan({
            ...plan,
            stages: plan.stages.map(s => ({
                ...s,
                tasks: s.tasks.map(t => taskIdsToMark.has(t.id) ? { ...t, isDeveloped: true, checked: false } : t)
            }))
        });

        // Build prompt from plan (using the state BEFORE marking as developed, or logically what we want to send)
        // We want to send the tasks we just identified.
        // But planToPromptText iterates the plan.

        // Let's manually construct a plan object for prompt generation that represents "What to do"
        const promptPlan = {
            ...plan,
            stages: plan.stages.map(s => ({
                ...s,
                tasks: s.tasks.filter(t => taskIdsToMark.has(t.id))
            })).filter(s => s.tasks.length > 0)
        };

        const planText = planToPromptText(promptPlan, false); // effectively "all" of the filtered plan

        const developPrompt = `Implementa las siguientes tareas del plan:\n\n${planText}\n\nComienza a desarrollar cada tarea listada. Genera el código necesario.`;

        // Switch to agent mode for development
        updateSettings({ selectedChatMode: "agent" });

        // Collapse panel
        updateMapAtom(setCollapsed, chatId, true);

        // Send to chat
        streamMessage({
            prompt: developPrompt,
            chatId,
        });
    };



    return (
        <div
            className={cn(
                "flex flex-col overflow-hidden border-t border-border/60 bg-muted/20 transition-[max-height] duration-300 mb-1",
                collapsed ? "max-h-20" : "max-h-[60vh]",
            )}
        >
            {/* Header bar (always visible) */}
            <div className="w-full flex items-center justify-between px-4 py-2 bg-primary/[0.03] border-b border-primary/8 transition-colors">
                <button
                    onClick={() => updateMapAtom(setCollapsed, chatId, !collapsed)}
                    className="flex-1 flex items-center gap-2 cursor-pointer text-left min-w-0"
                >
                    <ListChecks className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-sm font-semibold text-foreground">
                        Plan
                    </span>
                    {plan.objective && (
                        <span className="text-xs text-muted-foreground truncate max-w-[250px] border-l border-border/50 pl-2 ml-0.5">
                            {plan.objective}
                        </span>
                    )}
                    <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-px rounded-full ml-1.5 shrink-0">
                        {completedTasks}/{totalTasks}
                    </span>
                    {allCompleted && (
                        <span className="text-xs font-medium text-primary flex items-center gap-1 ml-1.5 shrink-0">
                            <CheckCircle className="h-3.5 w-3.5" />
                            Completado
                        </span>
                    )}
                    <div className="ml-1">
                        {collapsed ? (
                            <ChevronUp className="h-3.5 w-3.5 text-muted-foreground/40" />
                        ) : (
                            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/40" />
                        )}
                    </div>
                </button>

                {!effectiveReadOnly && (
                    <div className="flex items-center gap-2 shrink-0">
                        <Button
                            size="sm"
                            disabled={isStreaming}
                            onClick={(e) => {
                                e.stopPropagation();
                                handleDevelop(hasChecked && !allChecked);
                            }}
                            className={cn(
                                "text-xs h-7 px-3 gap-1.5 text-white transition-all",
                                isStreaming && "opacity-50 cursor-not-allowed",
                                "bg-primary hover:bg-primary/90"
                            )}
                        >
                            <Rocket className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">
                                {hasChecked && !allChecked
                                    ? `Desarrollar (${selectedTasks})`
                                    : "Desarrollar"}
                            </span>
                        </Button>
                    </div>
                )}
            </div>

            {/* Expanded content */}
            {!collapsed && (
                <div className="flex flex-col overflow-hidden min-h-0 flex-1">
                    {/* Scrollable plan stages */}
                    <div className="flex-1 overflow-y-auto px-4 pt-3 pb-2">
                        {plan.stages.map((stage) => (
                            <PlanStageSection
                                key={stage.id}
                                stage={stage}
                                readOnly={effectiveReadOnly}
                                onUpdateStage={(updated) => updateStage(stage.id, updated)}
                                onDeleteStage={() => deleteStage(stage.id)}
                            />
                        ))}
                    </div>

                    {/* Action bar — compact toggle all */}
                    {!effectiveReadOnly && (
                        <div className="border-t border-border/40 px-4 py-2 bg-muted/10">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={toggleAll}
                                className="text-xs h-6 px-2 gap-1.5 hover:bg-primary/10 hover:text-primary transition-colors"
                            >
                                {allChecked ? (
                                    <Square className="h-3.5 w-3.5" />
                                ) : (
                                    <CheckSquare className="h-3.5 w-3.5" />
                                )}
                                {allChecked ? "Desmarcar todo" : "Marcar todo"}
                            </Button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
