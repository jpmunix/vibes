import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import type { Todo } from "@/ipc/types";
import { useEffect, useState, useRef } from "react";
import { DeleteConfirmationDialog } from "@/components/DeleteConfirmationDialog";
import { cn } from "@/lib/utils";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Code,
  FileText,
  Loader2,
  Sparkles,
  Trash2,
  ChevronDown,
  ChevronRight,
  GripVertical,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { VanillaMarkdownParser } from "@/components/chat/DyadMarkdownParser";

interface TodoEditModalProps {
  todo: Todo | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (
    todoId: number,
    content: string,
    description: string | null,
    prompt: string | null,
    checklist: { id: string; content: string; completed: boolean }[] | null,
    closeModal?: boolean,
  ) => void;
  onDelete: (todoId: number) => void;
  onDevelop: (todoId: number, prompt?: string) => void;
  onRefine: (todoId: number) => Promise<string>;
}

export function TodoEditModal({
  todo,
  open,
  onOpenChange,
  onSave,
  onDelete,
  onDevelop,
  onRefine,
}: TodoEditModalProps) {
  const [content, setContent] = useState("");
  const [description, setDescription] = useState("");
  const [developPrompt, setDevelopPrompt] = useState("");
  const [isRefining, setIsRefining] = useState(false);
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(false);
  const [isDevelopExpanded, setIsDevelopExpanded] = useState(false);
  const [isSubtasksExpanded, setIsSubtasksExpanded] = useState(true);
  const [checklist, setChecklist] = useState<
    { id: string; content: string; completed: boolean }[]
  >([]);
  const [isAddingSubtask, setIsAddingSubtask] = useState(false);
  const [newSubtaskContent, setNewSubtaskContent] = useState("");
  const subtaskInputRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  useEffect(() => {
    if (todo) {
      setContent(todo.content);
      setDescription(todo.description || "");
      setDevelopPrompt(todo.prompt || "");
      setChecklist(todo.checklist || []);

      // Load expanded states from localStorage
      const savedSummary = localStorage.getItem(`vibes:todo:${todo.id}:summary-expanded`);
      const savedDevelop = localStorage.getItem(`vibes:todo:${todo.id}:develop-expanded`);
      const savedSubtasks = localStorage.getItem(`vibes:todo:${todo.id}:subtasks-expanded`);

      setIsSummaryExpanded(savedSummary !== null ? JSON.parse(savedSummary) : false);
      setIsDevelopExpanded(savedDevelop !== null ? JSON.parse(savedDevelop) : false);
      setIsSubtasksExpanded(savedSubtasks !== null ? JSON.parse(savedSubtasks) : true);
    }
  }, [todo?.id]);

  // Persist expanded states to localStorage
  useEffect(() => {
    if (todo) {
      localStorage.setItem(`vibes:todo:${todo.id}:summary-expanded`, JSON.stringify(isSummaryExpanded));
    }
  }, [todo?.id, isSummaryExpanded]);

  useEffect(() => {
    if (todo) {
      localStorage.setItem(`vibes:todo:${todo.id}:develop-expanded`, JSON.stringify(isDevelopExpanded));
    }
  }, [todo?.id, isDevelopExpanded]);

  useEffect(() => {
    if (todo) {
      localStorage.setItem(`vibes:todo:${todo.id}:subtasks-expanded`, JSON.stringify(isSubtasksExpanded));
    }
  }, [todo?.id, isSubtasksExpanded]);

  useEffect(() => {
    if (isAddingSubtask && subtaskInputRef.current) {
      subtaskInputRef.current.focus();
    }
  }, [isAddingSubtask]);

  // Auto-save logic
  useEffect(() => {
    if (!todo) return;

    // Check if there are actual changes compared to the todo prop
    const hasChanges =
      content !== (todo.content || "") ||
      description !== (todo.description || "") ||
      developPrompt !== (todo.prompt || "") ||
      JSON.stringify(checklist) !== JSON.stringify(todo.checklist || []);

    if (!hasChanges) return;

    const timer = setTimeout(() => {
      onSave(
        todo.id,
        content.trim(),
        description.trim() || null,
        developPrompt.trim() || null,
        checklist.length > 0 ? checklist : null,
        false,
      );
    }, 1000); // 1 second debounce

    return () => clearTimeout(timer);
  }, [content, description, developPrompt, checklist, todo, onSave]);

  const handleSave = (close = true) => {
    if (todo && content.trim()) {
      onSave(
        todo.id,
        content.trim(),
        description.trim() || null,
        developPrompt.trim() || null,
        checklist.length > 0 ? checklist : null,
        close,
      );
      if (close) {
        onOpenChange(false);
      }
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      handleSave(false);
    }
    onOpenChange(open);
  };

  const handleDelete = () => {
    if (todo) {
      onDelete(todo.id);
      onOpenChange(false);
    }
  };

  const handleDevelop = () => {
    if (todo) {
      onDevelop(todo.id, developPrompt.trim() || undefined);
      onOpenChange(false);
    }
  };

  const handleRefine = async () => {
    if (!todo || isRefining) return;

    setIsRefining(true);
    try {
      // First save current changes to make sure backend has latest data (without closing modal)
      onSave(
        todo.id,
        content.trim(),
        description.trim() || null,
        developPrompt.trim() || null,
        checklist.length > 0 ? checklist : null,
        false,
      );

      const refinedPrompt = await onRefine(todo.id);
      setDevelopPrompt(refinedPrompt);

      // Save again with new prompt (without closing modal)
      onSave(
        todo.id,
        content.trim(),
        description.trim() || null,
        refinedPrompt,
        checklist.length > 0 ? checklist : null,
        false,
      );
    } catch (error) {
      console.error("Error refining prompt:", error);
    } finally {
      setIsRefining(false);
    }
  };

  const handleAddSubtask = () => {
    if (newSubtaskContent.trim()) {
      const newItem = {
        id: Math.random().toString(36).substr(2, 9),
        content: newSubtaskContent.trim(),
        completed: false,
      };
      setChecklist([...checklist, newItem]);
      setNewSubtaskContent("");
      // Keep input focused via the useEffect
    }
  };

  const toggleSubtask = (id: string) => {
    setChecklist(
      checklist.map((item) =>
        item.id === id ? { ...item, completed: !item.completed } : item,
      ),
    );
  };

  const deleteSubtask = (id: string) => {
    setChecklist(checklist.filter((item) => item.id !== id));
  };

  const updateSubtask = (id: string, content: string) => {
    setChecklist(
      checklist.map((item) =>
        item.id === id ? { ...item, content } : item,
      ),
    );
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setChecklist((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  if (!todo) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-5xl max-h-[95vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 shrink-0">
          <DialogTitle className="text-2xl">Editar Tarea</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6">
          <div className="flex flex-col gap-6 pb-6">
            <div className="space-y-6">
              <div className="grid gap-2">
                <Label htmlFor="content" className="text-base font-medium">
                  Título
                </Label>
                <Input
                  id="content"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="¿Qué hay que hacer?"
                  className="text-lg"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="description" className="text-base font-medium">
                  Descripción
                </Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Añade más detalles..."
                  className="min-h-[150px] resize-none text-base"
                />
              </div>
            </div>

            <div className="space-y-4">
              <button
                type="button"
                onClick={() => setIsSubtasksExpanded(!isSubtasksExpanded)}
                className="flex items-center gap-2 w-full hover:bg-accent/10 p-1 rounded-md transition-colors group"
              >
                <FileText className="h-5 w-5 text-primary" />
                <Label className="text-xl font-semibold cursor-pointer flex-1 text-left">
                  Subtareas
                </Label>

                {!isSubtasksExpanded && checklist.length > 0 && (
                  <div className="flex items-center gap-3 mr-2 animate-in fade-in duration-300">
                    <div className="w-24 h-1.5 bg-secondary rounded-full overflow-hidden hidden sm:block">
                      <div
                        className="h-full bg-primary transition-[width] duration-300"
                        style={{
                          width: `${(checklist.filter((s) => s.completed).length /
                            checklist.length) *
                            100
                            }%`,
                        }}
                      />
                    </div>
                    <span className="text-xs font-medium text-muted-foreground tabular-nums bg-accent/30 px-2 py-0.5 rounded-full">
                      {checklist.filter((s) => s.completed).length}/
                      {checklist.length} (
                      {Math.round(
                        (checklist.filter((s) => s.completed).length /
                          checklist.length) *
                        100,
                      )}
                      %)
                    </span>
                  </div>
                )}

                {isSubtasksExpanded ? (
                  <ChevronDown className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                ) : (
                  <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                )}
              </button>

              {isSubtasksExpanded && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-200 flex flex-col gap-4">
                  {checklist.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-4">
                        <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary transition-[width] duration-300"
                            style={{
                              width: `${(checklist.filter((s) => s.completed).length /
                                checklist.length) *
                                100
                                }%`,
                            }}
                          />
                        </div>
                        <span className="text-sm font-medium text-muted-foreground tabular-nums">
                          {Math.round(
                            (checklist.filter((s) => s.completed).length /
                              checklist.length) *
                            100,
                          )}
                          % ({checklist.filter((s) => s.completed).length}/
                          {checklist.length})
                        </span>
                      </div>

                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                      >
                        <SortableContext
                          items={checklist.map((s) => s.id)}
                          strategy={verticalListSortingStrategy}
                        >
                          <div className="space-y-1">
                            {checklist.map((item) => (
                              <SubtaskItem
                                key={item.id}
                                item={item}
                                onToggle={toggleSubtask}
                                onDelete={deleteSubtask}
                                onUpdate={updateSubtask}
                              />
                            ))}
                          </div>
                        </SortableContext>
                      </DndContext>
                    </div>
                  )}

                  {isAddingSubtask ? (
                    <div className="flex flex-col gap-2 p-3 border rounded-lg bg-accent/10">
                      <Input
                        ref={subtaskInputRef}
                        value={newSubtaskContent}
                        onChange={(e) => setNewSubtaskContent(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleAddSubtask();
                          if (e.key === "Escape") setIsAddingSubtask(false);
                        }}
                        placeholder="Añadir un elemento"
                        className="h-9"
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={handleAddSubtask}>
                          Añadir
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setIsAddingSubtask(false)}
                        >
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="w-fit bg-accent/20 hover:bg-accent/30"
                      onClick={() => setIsAddingSubtask(true)}
                    >
                      Añadir un elemento
                    </Button>
                  )}
                </div>
              )}
            </div>


            <div className="space-y-4">
              <button
                type="button"
                onClick={() => setIsDevelopExpanded(!isDevelopExpanded)}
                className="flex items-center gap-2 w-full hover:bg-accent/10 p-1 rounded-md transition-colors group"
              >
                <Code className="h-5 w-5 text-primary" />
                <Label className="text-xl font-semibold cursor-pointer flex-1 text-left">
                  Desarrollar
                </Label>
                {isDevelopExpanded ? (
                  <ChevronDown className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                ) : (
                  <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                )}
              </button>

              {isDevelopExpanded && (
                <div className="flex flex-col gap-4 p-6 rounded-xl border bg-muted/30 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="grid gap-2">
                    <Label
                      htmlFor="develop-prompt"
                      className="text-sm text-muted-foreground italic"
                    >
                      Define el contexto o instrucciones específicas para que la
                      IA desarrolle esta tarea
                    </Label>
                    <Textarea
                      id="develop-prompt"
                      value={developPrompt}
                      onChange={(e) => setDevelopPrompt(e.target.value)}
                      placeholder="prompt para esta tarea"
                      className="min-h-[200px] resize-none bg-background"
                    />
                  </div>
                  <div className="flex gap-4">
                    <Button
                      onClick={handleRefine}
                      className="flex-1 h-12 text-lg gap-2 relative overflow-hidden group"
                      variant="outline"
                      disabled={isRefining}
                    >
                      {isRefining ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <Sparkles className="h-5 w-5 text-indigo-500 group-hover:text-indigo-600 transition-colors" />
                      )}
                      {isRefining ? "Refinando..." : "Refinar prompt"}
                    </Button>
                    <Button
                      onClick={handleDevelop}
                      className="flex-1 h-12 text-lg gap-2"
                      variant="secondary"
                      disabled={isRefining}
                    >
                      <Code className="h-5 w-5" />
                      Desarrollar
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {todo.developmentSummary && (
              <div className="space-y-4">
                <button
                  type="button"
                  onClick={() => setIsSummaryExpanded(!isSummaryExpanded)}
                  className="flex items-center gap-2 w-full hover:bg-accent/10 p-1 rounded-md transition-colors group"
                >
                  <FileText className="h-5 w-5 text-primary" />
                  <Label className="text-xl font-semibold cursor-pointer flex-1 text-left">
                    Resumen de Desarrollo
                  </Label>
                  {isSummaryExpanded ? (
                    <ChevronDown className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                  ) : (
                    <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                  )}
                </button>
                {isSummaryExpanded && (
                  <div className="p-6 rounded-xl border bg-accent/20 prose prose-invert prose-p:leading-relaxed prose-pre:bg-background/50 max-w-none max-h-[400px] overflow-y-auto shadow-inner text-sm animate-in fade-in slide-in-from-top-2 duration-200">
                    <VanillaMarkdownParser content={todo.developmentSummary} />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="border-t px-6 py-4 sm:justify-between gap-4 shrink-0">
          <DeleteConfirmationDialog
            itemName={todo.content}
            itemType="Tarea"
            onDelete={handleDelete}
            trigger={
              <Button
                variant="ghost"
                className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-2"
              >
                <Trash2 className="h-4 w-4" />
                Eliminar
              </Button>
            }
          />
          <div className="flex gap-2">
            <Button
              onClick={() => handleSave(true)}
              disabled={!content.trim()}
              className="px-8"
            >
              Cerrar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface SubtaskItemProps {
  item: { id: string; content: string; completed: boolean };
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, content: string) => void;
}

function SubtaskItem({
  item,
  onToggle,
  onDelete,
  onUpdate,
}: SubtaskItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(item.content);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
  };

  const handleSave = () => {
    if (editContent.trim()) {
      onUpdate(item.id, editContent.trim());
      setIsEditing(false);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group flex items-center gap-2 p-2 rounded-md hover:bg-accent/20 transition-colors border border-transparent",
        isDragging && "bg-accent/40 border-primary/20 shadow-lg",
      )}
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-muted-foreground/30 hover:text-muted-foreground transition-colors"
      >
        <GripVertical className="h-4 w-4" />
      </div>
      <Checkbox
        checked={item.completed}
        onCheckedChange={() => onToggle(item.id)}
        className="shrink-0 border-primary"
      />
      {isEditing ? (
        <Input
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          onBlur={handleSave}
          onKeyDown={(e) => e.key === "Enter" && handleSave()}
          autoFocus
          className="h-8 py-0 flex-1 text-sm"
        />
      ) : (
        <span
          className={cn(
            "flex-1 text-sm cursor-pointer",
            item.completed && "line-through text-muted-foreground",
          )}
          onClick={() => setIsEditing(true)}
        >
          {item.content}
        </span>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive hover:bg-destructive/10 transition-opacity"
        onClick={() => onDelete(item.id)}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
