import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type { Todo } from "@/ipc/types";
import { cn } from "@/lib/utils";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Code, Edit2, GripVertical, Trash2 } from "lucide-react";
import { useState } from "react";

interface SortableTodoItemProps {
  todo: Todo;
  onToggle: (todoId: number, completed: boolean) => void;
  onUpdate: (todoId: number, content: string) => void;
  onDelete: (todoId: number) => void;
  onDevelop: (todoId: number) => void;
}

export function SortableTodoItem({
  todo,
  onToggle,
  onUpdate,
  onDelete,
  onDevelop,
}: SortableTodoItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: todo.id });

  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(todo.content);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleSave = () => {
    if (editContent.trim() && editContent !== todo.content) {
      onUpdate(todo.id, editContent.trim());
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      setEditContent(todo.content);
      setIsEditing(false);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors",
        todo.completed && "opacity-60",
        isDragging && "opacity-50 ring-2 ring-primary"
      )}
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
      >
        <GripVertical className="h-4 w-4" />
      </div>

      <Checkbox
        checked={todo.completed}
        onCheckedChange={(checked) => onToggle(todo.id, checked as boolean)}
        className="shrink-0"
      />

      {isEditing ? (
        <Input
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          autoFocus
          className="flex-1"
        />
      ) : (
        <span
          className={cn(
            "flex-1 text-sm",
            todo.completed && "line-through text-muted-foreground"
          )}
          onDoubleClick={() => setIsEditing(true)}
        >
          {todo.content}
        </span>
      )}

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => onDevelop(todo.id)}
          title="Desarrollar"
        >
          <Code className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setIsEditing(true)}
          title="Editar"
        >
          <Edit2 className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-destructive hover:text-destructive"
          onClick={() => onDelete(todo.id)}
          title="Eliminar"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// Keep TodoItem for completed tasks (non-sortable)
interface TodoItemProps {
  todo: Todo;
  onToggle: (todoId: number, completed: boolean) => void;
  onUpdate: (todoId: number, content: string) => void;
  onDelete: (todoId: number) => void;
  onDevelop: (todoId: number) => void;
}

export function TodoItem({
  todo,
  onToggle,
  onUpdate,
  onDelete,
  onDevelop,
}: TodoItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(todo.content);

  const handleSave = () => {
    if (editContent.trim() && editContent !== todo.content) {
      onUpdate(todo.id, editContent.trim());
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      setEditContent(todo.content);
      setIsEditing(false);
    }
  };

  return (
    <div
      className={cn(
        "group flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors",
        todo.completed && "opacity-60"
      )}
    >
      <div className="w-6" /> {/* Spacer for alignment */}

      <Checkbox
        checked={todo.completed}
        onCheckedChange={(checked) => onToggle(todo.id, checked as boolean)}
        className="shrink-0"
      />

      {isEditing ? (
        <Input
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          autoFocus
          className="flex-1"
        />
      ) : (
        <span
          className={cn(
            "flex-1 text-sm",
            todo.completed && "line-through text-muted-foreground"
          )}
          onDoubleClick={() => setIsEditing(true)}
        >
          {todo.content}
        </span>
      )}

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => onDevelop(todo.id)}
          title="Desarrollar"
        >
          <Code className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setIsEditing(true)}
          title="Editar"
        >
          <Edit2 className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-destructive hover:text-destructive"
          onClick={() => onDelete(todo.id)}
          title="Eliminar"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
