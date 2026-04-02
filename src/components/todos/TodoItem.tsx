import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type { Todo } from "@/ipc/types";
import { cn } from "@/lib/utils";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Bot, Paperclip } from "lucide-react";
import { useState } from "react";

interface SortableTodoItemProps {
  todo: Todo;
  onToggle: (todoId: number, completed: boolean) => void;
  onUpdate: (
    todoId: number,
    content: string,
    description?: string | null,
    prompt?: string | null,
  ) => void;
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
        className="w-full bg-primary/5 border-2 border-dashed border-primary/20 rounded-lg p-3"
      >
        <div className="invisible py-1">
          <p className="text-sm font-medium whitespace-pre-wrap break-words">
            {todo.content}
          </p>
          {todo.description && (
            <p className="text-[10px] mt-0.5 italic whitespace-pre-wrap break-words">
              {todo.description}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        "group relative flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors cursor-grab active:cursor-grabbing overflow-hidden",
        todo.completed && "opacity-60",
        isDraggingOverlay &&
        "shadow-2xl ring-2 ring-primary border-primary rotate-1",
      )}
    >
      <div className="pt-1">
        <Checkbox
          checked={todo.completed}
          onCheckedChange={(checked) => onToggle(todo.id, checked as boolean)}
          className="shrink-0 border-primary bg-background shadow-sm"
          onPointerDown={(e) => e.stopPropagation()}
        />
      </div>

      <div className="flex-1 min-w-0">
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
          <div className="flex flex-col relative">
            <div
              className={cn(
                "flex-1 text-sm cursor-pointer py-1 min-w-0 pr-6",
                todo.completed && "line-through text-muted-foreground",
              )}
              onClick={onEdit}
            >
              <p className="font-medium whitespace-pre-wrap break-words">
                {todo.content}
              </p>
              {todo.description && (
                <p className="text-[10px] text-muted-foreground mt-0.5 italic whitespace-pre-wrap break-words">
                  {todo.description}
                </p>
              )}

              {todo.checklist && todo.checklist.length > 0 && (
                <div className="mt-2 flex items-center gap-3">
                  <div className="flex-1 h-1 bg-secondary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-[width] duration-300"
                      style={{
                        width: `${(todo.checklist.filter((s) => s.completed).length /
                          todo.checklist.length) *
                          100
                          }%`,
                      }}
                    />
                  </div>
                  <span className="text-[10px] font-medium text-muted-foreground tabular-nums bg-accent/30 px-1.5 py-0.5 rounded">
                    {todo.checklist.filter((s) => s.completed).length}/
                    {todo.checklist.length} (
                    {Math.round(
                      (todo.checklist.filter((s) => s.completed).length /
                        todo.checklist.length) *
                      100,
                    )}
                    %)
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {todo.attachments && todo.attachments.length > 0 && (
        <div className="absolute bottom-3 right-8 opacity-50 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
          <Paperclip size={12} className="text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground font-medium">{todo.attachments.length}</span>
        </div>
      )}

      {todo.developmentSummary && (
        <div className="absolute bottom-3 right-3 opacity-40 group-hover:opacity-100 transition-opacity">
          <Bot size={14} className="text-primary" />
        </div>
      )}
    </div>
  );
}

// Keep TodoItem for completed tasks (non-sortable)
interface TodoItemProps {
  todo: Todo;
  onToggle: (todoId: number, completed: boolean) => void;
  onUpdate: (
    todoId: number,
    content: string,
    description?: string | null,
    prompt?: string | null,
  ) => void;
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
        "group relative flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors overflow-hidden",
        todo.completed && "opacity-60",
      )}
    >
      <div className="pt-1">
        <Checkbox
          checked={todo.completed}
          onCheckedChange={(checked) => onToggle(todo.id, checked as boolean)}
          className="shrink-0 border-primary bg-background shadow-sm"
        />
      </div>

      <div className="flex-1 min-w-0">
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
          <div className="flex flex-col relative">
            <div
              className={cn(
                "flex-1 text-sm cursor-pointer py-1 min-w-0 pr-6",
                todo.completed && "line-through text-muted-foreground",
              )}
              onClick={onEdit}
            >
              <p className="font-medium whitespace-pre-wrap break-words">
                {todo.content}
              </p>
              {todo.description && (
                <p className="text-[10px] text-muted-foreground mt-0.5 italic whitespace-pre-wrap break-words">
                  {todo.description}
                </p>
              )}

              {todo.checklist && todo.checklist.length > 0 && (
                <div className="mt-2 flex items-center gap-3">
                  <div className="flex-1 h-1 bg-secondary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-[width] duration-300"
                      style={{
                        width: `${(todo.checklist.filter((s) => s.completed).length /
                          todo.checklist.length) *
                          100
                          }%`,
                      }}
                    />
                  </div>
                  <span className="text-[10px] font-medium text-muted-foreground tabular-nums bg-accent/30 px-1.5 py-0.5 rounded">
                    {todo.checklist.filter((s) => s.completed).length}/
                    {todo.checklist.length} (
                    {Math.round(
                      (todo.checklist.filter((s) => s.completed).length /
                        todo.checklist.length) *
                      100,
                    )}
                    %)
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {todo.attachments && todo.attachments.length > 0 && (
        <div className="absolute bottom-3 right-8 opacity-50 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
          <Paperclip size={12} className="text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground font-medium">{todo.attachments.length}</span>
        </div>
      )}

      {todo.developmentSummary && (
        <div className="absolute bottom-3 right-3 opacity-40 group-hover:opacity-100 transition-opacity">
          <Bot size={14} className="text-primary" />
        </div>
      )}
    </div>
  );
}
