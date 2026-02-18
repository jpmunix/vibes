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
  closestCorners,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  horizontalListSortingStrategy,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { Todo, TodoSection } from "@/ipc/types";
import { useState, useMemo, useEffect, useRef } from "react";
import { TodoColumn } from "./TodoColumn";
import { SortableTodoItem } from "./TodoItem";
import { TodoEditModal } from "./TodoEditModal";
import { Button } from "@/components/ui/button";
import { Plus, Layout, Loader2, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";

interface TodoBoardProps {
  appName: string;
  todos: Todo[];
  sections: TodoSection[];
  onAddTodo: (content: string, sectionId?: number) => void;
  onUpdateTodo: (
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
  ) => void;
  onDeleteTodo: (todoId: number) => void;
  onReorderTodos: (todoIds: number[], sectionId?: number | null) => void;
  onReorderSections: (sectionIds: number[]) => void;
  onAddSection: (title: string) => void;
  onUpdateSection: (sectionId: number, title: string) => void;
  onDeleteSection: (sectionId: number) => void;
  onDevelop: (todoId: number, prompt?: string) => void;
  onRefine: (todoId: number) => Promise<string>;
  onSmartImport?: () => void;
  isLoading?: boolean;
  isImporting?: boolean;
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
  onReorderSections,
  onDevelop,
  onRefine,
  onSmartImport,
  isLoading,
  isImporting,
}: TodoBoardProps) {
  const [activeId, setActiveId] = useState<number | string | null>(null);
  const [activeType, setActiveType] = useState<"todo" | "section" | null>(null);
  const [clonedItems, setClonedItems] = useState<Record<string, Todo[]>>({});
  const [orderedSectionKeys, setOrderedSectionKeys] = useState<string[]>([]);
  const [isAddingSection, setIsAddingSection] = useState(false);
  const [newSectionTitle, setNewSectionTitle] = useState("");
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );
  const dragStartSectionOrder = useRef<string[]>([]);

  // Initialize and sync cloned items
  useEffect(() => {
    if (!activeId) {
      // Create the structure from props
      const map: Record<string, Todo[]> = {
        unsectioned: todos
          .filter((t) => !t.sectionId)
          .sort((a, b) => a.order - b.order),
      };
      sections.forEach((s) => {
        map[`section-${s.id}`] = todos
          .filter((t) => t.sectionId === s.id)
          .sort((a, b) => a.order - b.order);
      });

      // Check if we need to update clonedItems
      setClonedItems((prev) => {
        const prevKeys = Object.keys(prev).sort();
        const nextKeys = Object.keys(map).sort();

        if (
          prevKeys.length !== nextKeys.length ||
          !prevKeys.every((k, i) => k === nextKeys[i])
        ) {
          return map;
        }

        let hasSubstantialChange = false;
        for (const key of nextKeys) {
          if (prev[key].length !== map[key].length) {
            hasSubstantialChange = true;
            break;
          }

          // Compare IDs and versions (updatedAt/completed) ignoring order
          const prevVersions = new Set(
            prev[key].map((t) => `${t.id}-${t.updatedAt}-${t.completed}`),
          );
          const nextVersions = map[key].map(
            (t) => `${t.id}-${t.updatedAt}-${t.completed}`,
          );

          if (!nextVersions.every((v) => prevVersions.has(v))) {
            hasSubstantialChange = true;
            break;
          }
        }

        if (hasSubstantialChange) return map;
        return prev;
      });

      // Handle orderedSectionKeys
      const nextKeys = [
        "unsectioned",
        ...sections.map((s) => `section-${s.id}`),
      ];
      setOrderedSectionKeys((prev) => {
        const prevSet = new Set(prev);
        const nextSet = new Set(nextKeys);
        const setsEqual =
          prevSet.size === nextSet.size &&
          [...prevSet].every((k) => nextSet.has(k));

        if (setsEqual) return prev;
        return nextKeys;
      });
    }
  }, [todos, sections, activeId]);

  const activeTodo = useMemo(() => {
    if (!activeId || activeType !== "todo") return null;
    for (const key in clonedItems) {
      const found = clonedItems[key].find((t) => t.id === activeId);
      if (found) return found;
    }
    return null;
  }, [clonedItems, activeId, activeType]);

  const activeSection = useMemo(() => {
    if (!activeId || activeType !== "section") return null;
    return sections.find((s) => `section-${s.id}` === activeId);
  }, [sections, activeId, activeType]);

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const type = active.data.current?.type === "section" ? "section" : "todo";
    setActiveId(active.id as number | string);
    setActiveType(type);
    if (type === "section") {
      dragStartSectionOrder.current = [...orderedSectionKeys];
    }
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id;
    const overId = over.id;

    if (activeType === "section") {
      const activeIdStr = String(activeId);
      const overIdStr = String(overId);

      if (activeIdStr !== overIdStr) {
        setOrderedSectionKeys((items) => {
          const oldIndex = items.indexOf(activeIdStr);
          const newIndex = items.indexOf(overIdStr);
          if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
            return arrayMove(items, oldIndex, newIndex);
          }
          return items;
        });
      }
      return;
    }

    const activeIdNum = typeof activeId === "number" ? activeId : null;
    if (activeType === "todo" && activeIdNum) {
      const activeContainer = findContainer(activeIdNum);
      const overContainerString = String(overId);
      const overContainer = orderedSectionKeys.includes(overContainerString)
        ? overContainerString
        : findContainer(overId as any);

      if (
        !activeContainer ||
        !overContainer ||
        activeContainer === overContainer
      )
        return;

      setClonedItems((prev) => {
        const activeItems = prev[activeContainer] || [];
        const overItems = prev[overContainer] || [];

        const activeIndex = activeItems.findIndex((t) => t.id === activeIdNum);
        if (activeIndex === -1) return prev;

        const overIndex = orderedSectionKeys.includes(overContainerString)
          ? overItems.length
          : overItems.findIndex((t) => t.id === overId);

        const newItem = activeItems[activeIndex];
        const newSectionId =
          overContainer === "unsectioned"
            ? null
            : Number(overContainer.replace("section-", ""));

        if (
          newItem.sectionId === newSectionId &&
          activeContainer === overContainer
        )
          return prev;

        return {
          ...prev,
          [activeContainer]: activeItems.filter((t) => t.id !== activeIdNum),
          [overContainer]: [
            ...overItems.slice(0, overIndex),
            { ...newItem, sectionId: newSectionId },
            ...overItems.slice(overIndex),
          ],
        };
      });
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over) {
      const activeId = active.id;
      const overId = over.id;

      if (activeType === "section") {
        const overSectionId =
          String(overId).startsWith("section-") || overId === "unsectioned"
            ? String(overId)
            : null;

        if (overSectionId && orderedSectionKeys.includes(overSectionId)) {
          const oldIndex = dragStartSectionOrder.current.indexOf(
            String(activeId),
          );
          const newIndex = orderedSectionKeys.indexOf(overSectionId);

          if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
            const reordered = arrayMove(
              dragStartSectionOrder.current,
              oldIndex,
              newIndex,
            );
            const latestIds = reordered
              .filter((key) => key.startsWith("section-"))
              .map((key) => Number(key.replace("section-", "")));
            onReorderSections(latestIds);
          }
        }
      } else {
        const activeTodoId = activeId as number;
        const containerId = findContainer(activeTodoId);

        if (containerId) {
          let columnTodos = [...clonedItems[containerId]];
          const oldIndex = columnTodos.findIndex((t) => t.id === activeTodoId);
          const overIndex =
            String(overId).startsWith("section-") || overId === "unsectioned"
              ? columnTodos.length - 1
              : columnTodos.findIndex((t) => t.id === overId);

          if (
            oldIndex !== -1 &&
            overIndex !== -1 &&
            (oldIndex !== overIndex ||
              containerId !== findContainer(activeTodoId))
          ) {
            columnTodos = arrayMove(columnTodos, oldIndex, overIndex);
          }

          const sectionId =
            containerId === "unsectioned"
              ? null
              : Number(containerId.replace("section-", ""));

          onReorderTodos(
            columnTodos.map((t) => t.id),
            sectionId,
          );
        }
      }
    }

    setActiveId(null);
    setActiveType(null);
  };

  function findContainer(id: number | string) {
    const idStr = String(id);
    if (idStr in clonedItems) return idStr;
    const idNum = Number(id);
    if (isNaN(idNum)) return null;

    for (const [containerId, sectionTodos] of Object.entries(clonedItems)) {
      if (sectionTodos.find((t) => t.id === idNum)) return containerId;
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

  const sortedSectionKeys = [
    "unsectioned",
    ...sections.map((s) => `section-${s.id}`),
  ];

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
              {todos.filter((t) => !t.completed).length} tareas pendientes ·{" "}
              {sections.length} listas
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
            <Button size="sm" onClick={handleAddSection}>
              Crear
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setIsAddingSection(false)}
            >
              Cancelar
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button
              onClick={onSmartImport}
              variant="outline"
              size="sm"
              className="gap-2 border-primary/20 hover:border-primary/40 hover:bg-primary/5 group"
              disabled={isImporting}
            >
              {isImporting ? (
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              ) : (
                <Sparkles className="h-4 w-4 text-primary group-hover:scale-110 transition-transform" />
              )}
              Smart Import
            </Button>
            <Button
              onClick={() => setIsAddingSection(true)}
              variant="outline"
              size="sm"
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              Nueva lista
            </Button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-x-auto min-h-0">
        <div className="flex gap-4 h-full pb-4 items-start">
          <DndContext
            sensors={sensors}
            collisionDetection={(args) => {
              if (activeType === "section") {
                // When dragging a section, ONLY consider other sections as targets
                const columnContainers = args.droppableContainers.filter((c) =>
                  orderedSectionKeys.includes(String(c.id)),
                );
                return closestCenter({
                  ...args,
                  droppableContainers: columnContainers,
                });
              }
              // When dragging a todo, use standard closest corners
              return closestCorners(args);
            }}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={orderedSectionKeys}
              strategy={horizontalListSortingStrategy}
            >
              {orderedSectionKeys.map((key) => {
                if (
                  key === "unsectioned" &&
                  clonedItems.unsectioned?.length === 0 &&
                  sections.length > 0
                )
                  return null;

                const section =
                  key === "unsectioned"
                    ? undefined
                    : sections.find((s) => `section-${s.id}` === key);
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
            </SortableContext>

            <DragOverlay dropAnimation={null}>
              {activeId && activeType === "todo" && activeTodo ? (
                <div className="w-[420px] opacity-90 rotate-1">
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
              ) : activeId && activeType === "section" ? (
                <div className="w-[420px] opacity-90 rotate-1">
                  <TodoColumn
                    section={activeSection || undefined}
                    todos={clonedItems[activeId as string] || []}
                    onAddTodo={() => { }}
                    onUpdateTodo={() => { }}
                    onDeleteTodo={() => { }}
                    onEditTodo={() => { }}
                    onDevelop={() => { }}
                    isDraggingOverlay
                  />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>

          {sections.length === 0 &&
            clonedItems.unsectioned?.length === 0 &&
            !isLoading && (
              <div className="flex flex-col items-center justify-center flex-1 border-2 border-dashed rounded-2xl opacity-50 h-full min-h-[400px]">
                <Layout className="h-12 w-12 mb-4" />
                <p>No hay tareas ni listas</p>
                <Button variant="link" onClick={() => setIsAddingSection(true)}>
                  Crea la primera lista
                </Button>
              </div>
            )}
        </div>
      </div>

      <TodoEditModal
        todo={editingTodo}
        open={!!editingTodo}
        onOpenChange={(open) => !open && setEditingTodo(null)}
        onSave={(id, content, desc, prompt, checklist) => {
          onUpdateTodo(id, { content, description: desc, prompt, checklist });
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
