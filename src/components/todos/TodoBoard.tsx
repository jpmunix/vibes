import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  defaultDropAnimationSideEffects,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import type { Todo, TodoSection } from "@/ipc/types";
import { useState, useMemo, useEffect } from "react";
import { TodoColumn } from "./TodoColumn";
import { SortableTodoItem } from "./TodoItem";
import { TodoEditModal } from "./TodoEditModal";
import { Button } from "@/components/ui/button";
import { Plus, Layout, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";

interface TodoBoardProps {
  appName: string;
  todos: Todo[];
  sections: TodoSection[];
  onAddTodo: (content: string, sectionId?: number) => void;
  onUpdateTodo: (todoId: number, params: { content?: string; description?: string | null; prompt?: string | null; completed?: boolean; sectionId?: number | null; order?: number }) => void;
  onDeleteTodo: (todoId: number) => void;
  onReorderTodos: (todoIds: number[], sectionId?: number | null) => void;
  onAddSection: (title: string) => void;
  onUpdateSection: (sectionId: number, title: string) => void;
  onDeleteSection: (sectionId: number) => void;
  onDevelop: (todoId: number, prompt?: string) => void;
  onRefine: (todoId: number) => Promise<string>;
  isLoading?: boolean;
}

export function TodoBoard({
  appName,
  todos,
  sections,
  onAddTodo,
  onUpdateTodo,
  onDeleteTodo,
  onReorderTodos,
  onAddSection,
  onUpdateSection,
  onDeleteSection,
  onDevelop,
  onRefine,
  isLoading,
}: TodoBoardProps) {
  const [activeId, setActiveId] = useState<number | null>(null);
  const [clonedItems, setClonedItems] = useState<Record<string, Todo[]>>({});
  const [isAddingSection, setIsAddingSection] = useState(false);
  const [newSectionTitle, setNewSectionTitle] = useState("");
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // Initialize and sync cloned items
  useEffect(() => {
    if (!activeId) {
      const map: Record<string, Todo[]> = {
        unsectioned: todos.filter((t) => !t.sectionId).sort((a, b) => a.order - b.order),
      };
      sections.forEach((s) => {
        map[`section-${s.id}`] = todos.filter((t) => t.sectionId === s.id).sort((a, b) => a.order - b.order);
      });
      setClonedItems(map);
    }
  }, [todos, sections, activeId]);

  const activeTodo = useMemo(() => {
    if (!activeId) return null;
    for (const key in clonedItems) {
      const found = clonedItems[key].find(t => t.id === activeId);
      if (found) return found;
    }
    return null;
  }, [clonedItems, activeId]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as number);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id as number;
    const overId = over.id as number | string;

    const activeContainer = findContainer(activeId);
    let overContainer = String(overId).startsWith("section-") || overId === "unsectioned"
      ? String(overId)
      : findContainer(overId as number);

    if (!activeContainer || !overContainer || activeContainer === overContainer) return;

    setClonedItems((prev) => {
      const activeItems = prev[activeContainer];
      const overItems = prev[overContainer] || [];

      const activeIndex = activeItems.findIndex((t) => t.id === activeId);
      const overIndex = String(overId).startsWith("section-") || overId === "unsectioned"
        ? overItems.length
        : overItems.findIndex((t) => t.id === overId);

      const newItem = activeItems[activeIndex];

      return {
        ...prev,
        [activeContainer]: activeItems.filter((t) => t.id !== activeId),
        [overContainer]: [
          ...overItems.slice(0, overIndex),
          { ...newItem, sectionId: overContainer === "unsectioned" ? null : Number(overContainer.replace("section-", "")) },
          ...overItems.slice(overIndex),
        ],
      };
    });
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over) {
      const activeId = active.id as number;
      const overId = over.id as number | string;
      const containerId = findContainer(activeId);

      if (containerId) {
        let columnTodos = [...clonedItems[containerId]];
        const oldIndex = columnTodos.findIndex((t) => t.id === activeId);
        const overIndex = String(overId).startsWith("section-") || overId === "unsectioned"
          ? columnTodos.length - 1
          : columnTodos.findIndex((t) => t.id === overId);

        if (oldIndex !== -1 && overIndex !== -1 && oldIndex !== overIndex) {
          columnTodos = arrayMove(columnTodos, oldIndex, overIndex);
        }

        const sectionId = containerId === "unsectioned" ? null : Number(containerId.replace("section-", ""));

        // Final local state sync before mutation
        setClonedItems(prev => ({
          ...prev,
          [containerId]: columnTodos
        }));

        onReorderTodos(columnTodos.map(t => t.id), sectionId);
      }
    }

    // Use a microtask/timeout to ensure mutation state has propagated 
    // before we allow the useEffect to sync from props
    setTimeout(() => {
      setActiveId(null);
    }, 0);
  };

  function findContainer(id: number) {
    if (id in clonedItems) return String(id);
    for (const [containerId, sectionTodos] of Object.entries(clonedItems)) {
      if (sectionTodos.find((t) => t.id === id)) return containerId;
    }
    return null;
  }

  const handleAddSection = () => {
    if (newSectionTitle.trim()) {
      onAddSection(newSectionTitle.trim());
      setNewSectionTitle("");
      setIsAddingSection(false);
    }
  };

  if (isLoading && todos.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const sortedSectionKeys = ["unsectioned", ...sections.map(s => `section-${s.id}`)];

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-6 shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg text-primary">
            <Layout className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">{appName}</h2>
            <p className="text-xs text-muted-foreground">
              {todos.filter(t => !t.completed).length} tareas pendientes · {sections.length} listas
            </p>
          </div>
        </div>

        {isAddingSection ? (
          <div className="flex gap-2">
            <Input
              value={newSectionTitle}
              onChange={(e) => setNewSectionTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddSection()}
              placeholder="Nombre de lista..."
              autoFocus
              className="h-9 w-48"
            />
            <Button size="sm" onClick={handleAddSection}>Crear</Button>
            <Button size="sm" variant="ghost" onClick={() => setIsAddingSection(false)}>Cancelar</Button>
          </div>
        ) : (
          <Button onClick={() => setIsAddingSection(true)} variant="outline" size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            Nueva lista
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-x-auto min-h-0">
        <div className="flex gap-4 h-full pb-4 items-start">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            {sortedSectionKeys.map(key => {
              if (key === "unsectioned" && clonedItems.unsectioned?.length === 0 && sections.length > 0) return null;

              const section = key === "unsectioned" ? undefined : sections.find(s => `section-${s.id}` === key);
              return (
                <TodoColumn
                  key={key}
                  section={section}
                  todos={clonedItems[key] || []}
                  onAddTodo={onAddTodo}
                  onUpdateTodo={onUpdateTodo}
                  onDeleteTodo={onDeleteTodo}
                  onUpdateSection={onUpdateSection}
                  onDeleteSection={onDeleteSection}
                  onEditTodo={setEditingTodo}
                  onDevelop={onDevelop}
                />
              );
            })}

            <DragOverlay dropAnimation={{
              sideEffects: defaultDropAnimationSideEffects({
                styles: {
                  active: {
                    opacity: "0.5",
                  },
                },
              }),
            }}>
              {activeId && activeTodo ? (
                <div className="w-80 opacity-90 rotate-1">
                  <SortableTodoItem
                    todo={activeTodo}
                    onToggle={() => { }}
                    onUpdate={() => { }}
                    onDelete={() => { }}
                    onDevelop={() => { }}
                    onEdit={() => { }}
                    isDraggingOverlay
                  />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>

          {sections.length === 0 && clonedItems.unsectioned?.length === 0 && !isLoading && (
            <div className="flex flex-col items-center justify-center flex-1 border-2 border-dashed rounded-2xl opacity-50 h-full min-h-[400px]">
              <Layout className="h-12 w-12 mb-4" />
              <p>No hay tareas ni listas</p>
              <Button variant="link" onClick={() => setIsAddingSection(true)}>Crea la primera lista</Button>
            </div>
          )}
        </div>
      </div>

      <TodoEditModal
        todo={editingTodo}
        open={!!editingTodo}
        onOpenChange={(open) => !open && setEditingTodo(null)}
        onSave={(id, content, desc, prompt) => {
          onUpdateTodo(id, { content, description: desc, prompt });
        }}
        onDelete={(id) => {
          onDeleteTodo(id);
          setEditingTodo(null);
        }}
        onDevelop={(id, prompt) => {
          onDevelop(id, prompt);
          setEditingTodo(null);
        }}
        onRefine={onRefine}
      />
    </div>
  );
}
