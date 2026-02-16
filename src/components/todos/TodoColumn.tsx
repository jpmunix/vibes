import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface TodoColumnProps {
  section?: TodoSection;
  todos: Todo[];
  onAddTodo: (content: string, sectionId?: number) => void;
  onUpdateTodo: (
    todoId: number,
    params: {
      content?: string;
      completed?: boolean;
      sectionId?: number | null;
    },
  ) => void;
  onDeleteTodo: (todoId: number) => void;
  onUpdateSection?: (sectionId: number, title: string) => void;
  onDeleteSection?: (sectionId: number) => void;
  onEditTodo: (todo: Todo) => void;
  onDevelop: (todoId: number, prompt?: string) => void;
  isDraggingOverlay?: boolean;
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
  isDraggingOverlay,
}: TodoColumnProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newTodoTitle, setNewTodoTitle] = useState("");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState(section?.title || "");
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const columnId = section ? `section-${section.id}` : "unsectioned";

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({
    id: columnId,
    data: {
      type: "section",
    },
    disabled: isDraggingOverlay,
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  if (isDragging && !isDraggingOverlay) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="w-[420px] shrink-0 bg-primary/5 border-2 border-dashed border-primary/20 rounded-xl overflow-hidden"
      >
        <div className="p-3 border-b invisible">
          <div className="h-5" />
        </div>
        <div className="p-2 space-y-2 invisible">
          {todos.map((todo) => (
            <div key={todo.id} className="p-3 border rounded-lg">
              <div className="py-1">
                <p className="text-sm font-medium">{todo.content}</p>
                {todo.description && (
                  <p className="text-[10px] mt-0.5">{todo.description}</p>
                )}
              </div>
            </div>
          ))}
          <div className="h-9" />
        </div>
      </div>
    );
  }

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
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex flex-col w-[420px] shrink-0 bg-muted/30 rounded-xl border overflow-hidden max-h-full transition-colors duration-200",
        isDraggingOverlay &&
        "shadow-2xl ring-2 ring-primary border-primary rotate-1 opacity-90",
      )}
    >
      <div
        {...attributes}
        {...listeners}
        className="p-3 flex items-center justify-between group bg-background border-b cursor-grab active:cursor-grabbing"
      >
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
              {todos.filter((t) => !t.completed).length}
            </span>
          </div>
        )}

        {section && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
              >
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
                onClick={() => {
                  if (todos.length > 0) {
                    setIsDeleteDialogOpen(true);
                  } else {
                    onDeleteSection?.(section.id);
                  }
                }}
              >
                <Trash2 className="h-3.5 w-3.5 mr-2" />
                Eliminar lista
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <AlertDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta lista?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta lista tiene {todos.length}{" "}
              {todos.length === 1 ? "tarea" : "tareas"}. ¿Estás seguro de que
              quieres eliminarla y borrar todo su contenido? Esta acción no se
              puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (section) onDeleteSection?.(section.id);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div
        className={cn(
          "flex-1 overflow-y-auto p-2 space-y-2 min-h-[150px] pb-4 transition-colors duration-200",
          isOver && "bg-primary/5",
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
              <Button
                size="sm"
                onClick={handleAddTodo}
                className="h-8 px-3 text-xs"
              >
                Añadir
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setIsAdding(false)}
                className="h-8 px-3 text-xs"
              >
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
