import type { Todo } from "@/ipc/types";
import { TodoList } from "./TodoList";

interface TodoBoardProps {
  todos: Todo[];
  appName: string;
  onAdd: (content: string) => void;
  onToggle: (todoId: number, completed: boolean) => void;
  onUpdate: (todoId: number, content: string, description?: string | null, prompt?: string | null) => void;
  onDelete: (todoId: number) => void;
  onDevelop: (todoId: number, prompt?: string) => void;
  onRefine: (todoId: number) => Promise<string>;
  onReorder: (todoIds: number[]) => void;
  isLoading?: boolean;
}

export function TodoBoard({
  todos,
  appName,
  onAdd,
  onToggle,
  onUpdate,
  onDelete,
  onDevelop,
  onRefine,
  onReorder,
  isLoading,
}: TodoBoardProps) {
  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-semibold">{appName}</h2>
          <p className="text-sm text-muted-foreground">
            {todos.filter((t) => !t.completed).length} pendientes ·{" "}
            {todos.filter((t) => t.completed).length} completadas
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <TodoList
          todos={todos}
          onAdd={onAdd}
          onToggle={onToggle}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onDevelop={onDevelop}
          onRefine={onRefine}
          onReorder={onReorder}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}
