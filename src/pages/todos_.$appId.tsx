import { TodoBoard } from "@/components/todos/TodoBoard";
import { Button } from "@/components/ui/button";
import { useLoadApps } from "@/hooks/useLoadApps";
import { useTodos } from "@/hooks/useTodos";
import { useNavigate, useParams } from "@tanstack/react-router";
import { ArrowLeft } from "@/components/ui/icons";
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
    sections,
    loading,
    createTodo,
    updateTodo,
    deleteTodo,
    developTodo,
    reorderTodos,
    reorderSections,
    refinePrompt,
    createSection,
    updateSection,
    deleteSection,
    smartImport,
    isImporting,
  } = useTodos(numericAppId);

  const handleAddTodo = async (content: string, sectionId?: number) => {
    await createTodo({ content, sectionId });
  };

  const handleUpdateTodo = async (
    todoId: number,
    params: {
      content?: string;
      description?: string | null;
      prompt?: string | null;
      completed?: boolean;
      sectionId?: number | null;
      order?: number;
      checklist?: { id: string; content: string; completed: boolean }[] | null;
    },
  ) => {
    await updateTodo({ todoId, ...params });
  };

  const handleReorderTodos = async (
    todoIds: number[],
    sectionId?: number | null,
  ) => {
    await reorderTodos({ todoIds, sectionId });
  };

  const handleDevelop = async (todoId: number, prompt?: string) => {
    const result = await developTodo({ todoId, prompt });
    setSelectedAppId(numericAppId);
    navigate({
      to: "/chat",
      search: { id: result.chatId, autoStart: true },
    });
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
    <div className="h-full w-full p-6 overflow-hidden">
      <TodoBoard
        todos={todos}
        sections={sections}
        appName={app.name}
        onAddTodo={handleAddTodo}
        onUpdateTodo={handleUpdateTodo}
        onDeleteTodo={deleteTodo}
        onReorderTodos={handleReorderTodos}
        onReorderSections={reorderSections}
        onAddSection={(title) => createSection(title)}
        onUpdateSection={(sectionId, title) =>
          updateSection({ sectionId, title })
        }
        onDeleteSection={deleteSection}
        onDevelop={handleDevelop}
        onRefine={async (todoId: number) => refinePrompt({ todoId })}
        onSmartImport={smartImport}
        isLoading={loading}
        isImporting={isImporting}
      />
    </div>
  );
}
