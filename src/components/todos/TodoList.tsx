import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Todo } from "@/ipc/types";
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Loader2, Plus } from "lucide-react";
import { useState } from "react";
import { SortableTodoItem, TodoItem } from "./TodoItem";

interface TodoListProps {
  todos: Todo[];
  onAdd: (content: string) => void;
  onToggle: (todoId: number, completed: boolean) => void;
  onUpdate: (todoId: number, content: string) => void;
  onDelete: (todoId: number) => void;
  onDevelop: (todoId: number) => void;
  onReorder: (todoIds: number[]) => void;
  isLoading?: boolean;
}

export function TodoList({
  todos,
  onAdd,
  onToggle,
  onUpdate,
  onDelete,
  onDevelop,
  onReorder,
  isLoading,
}: TodoListProps) {
  const [newTodo, setNewTodo] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleAdd = () => {
    if (newTodo.trim()) {
      onAdd(newTodo.trim());
      setNewTodo("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleAdd();
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const pendingTodos = todos.filter((t) => !t.completed);
      const completedTodos = todos.filter((t) => t.completed);

      const oldIndex = pendingTodos.findIndex((t) => t.id === active.id);
      const newIndex = pendingTodos.findIndex((t) => t.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        const reorderedPending = arrayMove(pendingTodos, oldIndex, newIndex);
        const newOrder = [...reorderedPending, ...completedTodos].map((t) => t.id);
        onReorder(newOrder);
      }
    }
  };

  const pendingTodos = todos.filter((t) => !t.completed);
  const completedTodos = todos.filter((t) => t.completed);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4 w-full max-w-7xl">
      <div className={`flex gap-2`}>
        <Input
          placeholder="Añadir nueva tarea..."
          value={newTodo}
          onChange={(e) => setNewTodo(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1"
        />
        <Button onClick={handleAdd} disabled={!newTodo.trim()}>
          <Plus className="h-4 w-4 mr-1" />
          Añadir
        </Button>
      </div>

      <div className="space-y-2">
        {pendingTodos.length === 0 && completedTodos.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p className="text-sm">No hay tareas.</p>
            <p className="text-xs mt-1">Añade tu primera tarea arriba.</p>
          </div>
        ) : (
          <>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={pendingTodos.map((t) => t.id)}
                strategy={verticalListSortingStrategy}
              >
                {pendingTodos.map((todo) => (
                  <SortableTodoItem
                    key={todo.id}
                    todo={todo}
                    onToggle={onToggle}
                    onUpdate={onUpdate}
                    onDelete={onDelete}
                    onDevelop={onDevelop}
                  />
                ))}
              </SortableContext>
            </DndContext>

            {completedTodos.length > 0 && (
              <div className="pt-4 border-t">
                <p className="text-xs text-muted-foreground mb-2">
                  Completadas ({completedTodos.length})
                </p>
                {completedTodos.map((todo) => (
                  <TodoItem
                    key={todo.id}
                    todo={todo}
                    onToggle={onToggle}
                    onUpdate={onUpdate}
                    onDelete={onDelete}
                    onDevelop={onDevelop}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
