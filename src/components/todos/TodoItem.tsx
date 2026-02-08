import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type { Todo } from "@/ipc/types";
import { cn } from "@/lib/utils";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { useState } from "react";

interface SortableTodoItemProps {
  todo: Todo;
  onToggle: (todoId: number, completed: boolean) => void;
  onUpdate: (todoId: number, content: string, description?: string | null, prompt?: string | null) => void;
  onDelete: (todoId: number) => void;
  onDevelop: (todoId: number, prompt?: string) => void;
  onEdit: () => void;
  isDraggingOverlay?: boolean;
}

export function SortableTodoItem({
  todo,
  onToggle,
  onUpdate,
  onDelete,
  onDevelop,
  onEdit,
  isDraggingOverlay,
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
    transform: CSS.Translate.toString(transform),
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

  // If this item is being dragged in the list, show as placeholder
  if (isDragging && !isDraggingOverlay) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="min-h-[72px] w-full bg-primary/5 border-2 border-dashed border-primary/20 rounded-lg"
      />
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors",
        todo.completed && "opacity-60",
        isDraggingOverlay && "shadow-2xl ring-2 ring-primary border-primary rotate-1"
      )}
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted"
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
          className="flex-1 h-8 text-sm"
        />
      ) : (
        <div
          className={cn(
            "flex-1 text-sm cursor-pointer py-1 min-w-0",
            todo.completed && "line-through text-muted-foreground"
          )}
          onClick={onEdit}
        >
          <p className="font-medium whitespace-pre-wrap break-words">{todo.content}</p>
          {todo.description && (
            <p className="text-[10px] text-muted-foreground mt-0.5 italic whitespace-pre-wrap break-words">
              {todo.description}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// Keep TodoItem for completed tasks (non-sortable)
interface TodoItemProps {
  todo: Todo;
  onToggle: (todoId: number, completed: boolean) => void;
  onUpdate: (todoId: number, content: string, description?: string | null, prompt?: string | null) => void;
  onDelete: (todoId: number) => void;
  onDevelop: (todoId: number, prompt?: string) => void;
  onEdit: () => void;
}

export function TodoItem({
  todo,
  onToggle,
  onUpdate,
  onDelete,
  onDevelop,
  onEdit,
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
          className="flex-1 h-8 text-sm"
        />
      ) : (
        <div
          className={cn(
            "flex-1 text-sm cursor-pointer py-1 min-w-0",
            todo.completed && "line-through text-muted-foreground"
          )}
          onClick={onEdit}
        >
          <p className="font-medium whitespace-pre-wrap break-words">{todo.content}</p>
          {todo.description && (
            <p className="text-[10px] text-muted-foreground mt-0.5 italic whitespace-pre-wrap break-words">
              {todo.description}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
