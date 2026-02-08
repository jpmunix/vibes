import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Todo, TodoSection } from "@/ipc/types";
import { SortableTodoItem } from "./TodoItem";
import { Button } from "@/components/ui/button";
import { Plus, MoreVertical, Trash2, Edit2 } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface TodoColumnProps {
    section?: TodoSection;
    todos: Todo[];
    onAddTodo: (content: string, sectionId?: number) => void;
    onUpdateTodo: (todoId: number, params: { content?: string; completed?: boolean; sectionId?: number | null }) => void;
    onDeleteTodo: (todoId: number) => void;
    onUpdateSection?: (sectionId: number, title: string) => void;
    onDeleteSection?: (sectionId: number) => void;
    onEditTodo: (todo: Todo) => void;
    onDevelop: (todoId: number, prompt?: string) => void;
}

export function TodoColumn({
    section,
    todos,
    onAddTodo,
    onUpdateTodo,
    onDeleteTodo,
    onUpdateSection,
    onDeleteSection,
    onEditTodo,
    onDevelop,
}: TodoColumnProps) {
    const [isAdding, setIsAdding] = useState(false);
    const [newTodoTitle, setNewTodoTitle] = useState("");
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [editTitle, setEditTitle] = useState(section?.title || "");

    const { setNodeRef, isOver } = useDroppable({
        id: section ? `section-${section.id}` : "unsectioned",
    });

    const handleAddTodo = () => {
        if (newTodoTitle.trim()) {
            onAddTodo(newTodoTitle.trim(), section?.id);
            setNewTodoTitle("");
            setIsAdding(false);
        }
    };

    const handleUpdateSectionTitle = () => {
        if (section && editTitle.trim() && editTitle !== section.title) {
            onUpdateSection?.(section.id, editTitle.trim());
        }
        setIsEditingTitle(false);
    };

    return (
        <div className="flex flex-col w-80 shrink-0 bg-muted/30 rounded-xl border overflow-hidden max-h-full transition-all duration-200">
            <div className="p-3 flex items-center justify-between group bg-background/50 backdrop-blur-sm border-b">
                {isEditingTitle && section ? (
                    <Input
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onBlur={handleUpdateSectionTitle}
                        onKeyDown={(e) => e.key === "Enter" && handleUpdateSectionTitle()}
                        autoFocus
                        className="h-8 py-1 px-2"
                    />
                ) : (
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                        <h3 className="font-semibold truncate text-sm">
                            {section?.title || "Sin lista"}
                        </h3>
                        <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground font-mono">
                            {todos.length}
                        </span>
                    </div>
                )}

                {section && (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                                <MoreVertical className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setIsEditingTitle(true)}>
                                <Edit2 className="h-3.5 w-3.5 mr-2" />
                                Renombrar
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => onDeleteSection?.(section.id)}
                            >
                                <Trash2 className="h-3.5 w-3.5 mr-2" />
                                Eliminar lista
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}
            </div>

            <div
                ref={setNodeRef}
                className={cn(
                    "flex-1 overflow-y-auto p-2 space-y-2 min-h-[150px] pb-4 transition-colors duration-200",
                    isOver && "bg-primary/5"
                )}
            >
                <SortableContext
                    items={todos.map((t) => t.id)}
                    strategy={verticalListSortingStrategy}
                >
                    {todos.map((todo) => (
                        <SortableTodoItem
                            key={todo.id}
                            todo={todo}
                            onToggle={(id, completed) => onUpdateTodo(id, { completed })}
                            onUpdate={(id, content) => onUpdateTodo(id, { content })}
                            onDelete={onDeleteTodo}
                            onDevelop={onDevelop}
                            onEdit={() => onEditTodo(todo)}
                        />
                    ))}
                </SortableContext>

                {isAdding ? (
                    <div className="space-y-2 p-1">
                        <Input
                            value={newTodoTitle}
                            onChange={(e) => setNewTodoTitle(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleAddTodo()}
                            onBlur={() => !newTodoTitle && setIsAdding(false)}
                            placeholder="¿Qué hay que hacer?"
                            autoFocus
                            className="text-sm h-9"
                        />
                        <div className="flex gap-2">
                            <Button size="sm" onClick={handleAddTodo} className="h-8 px-3 text-xs">
                                Añadir
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setIsAdding(false)} className="h-8 px-3 text-xs">
                                Cancelar
                            </Button>
                        </div>
                    </div>
                ) : (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start text-muted-foreground hover:text-foreground h-9 font-normal"
                        onClick={() => setIsAdding(true)}
                    >
                        <Plus className="h-4 w-4 mr-2" />
                        Nueva tarea
                    </Button>
                )}
            </div>
        </div>
    );
}
