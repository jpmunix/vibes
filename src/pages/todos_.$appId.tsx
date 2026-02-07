import { TodoBoard } from "@/components/todos/TodoBoard";
import { Button } from "@/components/ui/button";
import { useLoadApps } from "@/hooks/useLoadApps";
import { useTodos } from "@/hooks/useTodos";
import { useNavigate, useParams } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useSetAtom } from "jotai";
import { selectedAppIdAtom } from "@/atoms/appAtoms";

export default function TodoDetailPage() {
  const { appId } = useParams({ from: "/todos/$appId" });
  const numericAppId = Number.parseInt(appId);
  const navigate = useNavigate();
  const setSelectedAppId = useSetAtom(selectedAppIdAtom);

  const { apps } = useLoadApps();
  const app = apps.find((a) => a.id === numericAppId);

  const {
    todos,
    loading,
    createTodo,
    updateTodo,
    deleteTodo,
    developTodo,
    reorderTodos,
  } = useTodos(numericAppId);

  const handleAdd = async (content: string) => {
    await createTodo(content);
  };

  const handleToggle = async (todoId: number, completed: boolean) => {
    await updateTodo({ todoId, completed });
  };

  const handleUpdate = async (todoId: number, content: string) => {
    await updateTodo({ todoId, content });
  };

  const handleDelete = async (todoId: number) => {
    await deleteTodo(todoId);
  };

  const handleDevelop = async (todoId: number) => {
    const result = await developTodo(todoId);
    // Set the selected app before navigating
    setSelectedAppId(numericAppId);
    // Navigate to the new chat with autoStart enabled
    navigate({
      to: "/chat",
      search: { id: result.chatId, autoStart: true },
    });
  };

  const handleReorder = async (todoIds: number[]) => {
    await reorderTodos(todoIds);
  };

  if (!app) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <p className="text-lg">App no encontrada</p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => navigate({ to: "/todos" })}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Volver a tareas
        </Button>
      </div>
    );
  }

  return (
    <div className="h-full w-full p-6">
      <Button
        variant="ghost"
        className="mb-4"
        onClick={() => navigate({ to: "/" })}
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Volver
      </Button>

      <TodoBoard
        todos={todos}
        appName={app.name}
        onAdd={handleAdd}
        onToggle={handleToggle}
        onUpdate={handleUpdate}
        onDelete={handleDelete}
        onDevelop={handleDevelop}
        onReorder={handleReorder}
        isLoading={loading}
      />
    </div>
  );
}
