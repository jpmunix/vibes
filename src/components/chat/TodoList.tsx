import React, { useState, useEffect, useRef } from "react";
import type { AgentTodo } from "@/ipc/types";
import { ChevronDown, ChevronUp } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

interface TodoListProps {
  todos: AgentTodo[];
  isStreaming?: boolean;
}

/* ── Custom SVG icons ─────────────────────────────────────
 *  Filled circles with solid visual weight instead of thin
 *  Lucide outlines. They match the app's premium look.
 * ──────────────────────────────────────────────────────── */

function CompletedIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      className={cn("w-4 h-4 flex-shrink-0", className)}
    >
      <circle cx="8" cy="8" r="8" className="fill-primary" />
      <path
        d="M5 8.2L7.2 10.4L11 5.6"
        stroke="white"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function InProgressIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      className={cn("w-4 h-4 flex-shrink-0 animate-spin", className)}
    >
      <circle
        cx="8"
        cy="8"
        r="6.5"
        className="stroke-primary/20"
        strokeWidth="3"
      />
      <path
        d="M8 1.5A6.5 6.5 0 0 1 14.5 8"
        className="stroke-primary"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PendingIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      className={cn("w-4 h-4 flex-shrink-0", className)}
    >
      <circle
        cx="8"
        cy="8"
        r="6.5"
        className="stroke-muted-foreground/30"
        strokeWidth="1.5"
        strokeDasharray="3 2.5"
      />
    </svg>
  );
}

function HeaderCompletedIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="w-[18px] h-[18px] flex-shrink-0">
      <circle cx="8" cy="8" r="8" className="fill-primary" />
      <path
        d="M5 8.2L7.2 10.4L11 5.6"
        stroke="white"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function getStatusIcon(status: AgentTodo["status"]) {
  switch (status) {
    case "completed":
      return <CompletedIcon />;
    case "in_progress":
      return <InProgressIcon />;
    case "pending":
    default:
      return <PendingIcon />;
  }
}

export function TodoList({ todos, isStreaming }: TodoListProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const wasStreamingRef = useRef(isStreaming);

  const completed = todos.filter((t) => t.status === "completed").length;
  const total = todos.length;
  const allDone = total > 0 && completed === total;

  // Auto-collapse when the agent finishes (streaming transitions true → false)
  useEffect(() => {
    if (wasStreamingRef.current && !isStreaming) {
      setIsExpanded(false);
    }
    wasStreamingRef.current = isStreaming;
  }, [isStreaming]);

  // Auto-collapse when all tasks are completed
  useEffect(() => {
    if (allDone) {
      setIsExpanded(false);
    }
  }, [allDone]);

  if (!todos.length) return null;

  const progress = total > 0 ? (completed / total) * 100 : 0;
  const inProgressTask = todos.find((t) => t.status === "in_progress");

  return (
    <div className="border-b border-border">
      {/* Progress bar */}
      <div className="h-[2px] w-full bg-muted/50">
        <div
          className="h-full bg-primary transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="cursor-pointer w-full flex items-center justify-between px-3 py-2 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {isExpanded ? (
            <>
              {allDone ? (
                <HeaderCompletedIcon />
              ) : inProgressTask ? (
                <InProgressIcon className="w-[18px] h-[18px]" />
              ) : (
                <svg viewBox="0 0 16 16" fill="none" className="w-[18px] h-[18px] flex-shrink-0">
                  <circle cx="8" cy="8" r="6.5" className="stroke-muted-foreground/40" strokeWidth="1.5" />
                  <text x="8" y="11" textAnchor="middle" className="fill-muted-foreground/60" fontSize="8" fontWeight="600">
                    {completed}
                  </text>
                </svg>
              )}
              <span className="typo-caption font-medium">
                {completed} de {total} tareas completadas
              </span>
            </>
          ) : inProgressTask ? (
            <>
              <InProgressIcon className="w-[18px] h-[18px]" />
              <span className="typo-caption truncate">{inProgressTask.content}</span>
              <span className="typo-micro text-muted-foreground tabular-nums flex-shrink-0">
                ({completed}/{total})
              </span>
            </>
          ) : (
            <>
              {allDone ? (
                <HeaderCompletedIcon />
              ) : (
                <PendingIcon className="w-[18px] h-[18px]" />
              )}
              <span className="typo-caption font-medium">
                {allDone
                  ? "Todas las tareas completadas"
                  : "Sin tareas en progreso"}
              </span>
              <span className="typo-micro text-muted-foreground tabular-nums flex-shrink-0">
                ({completed}/{total})
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-3">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {isExpanded && (
        <ul className="px-3 pb-2.5 space-y-0.5">
          {todos.map((todo) => (
            <li
              key={todo.id}
              className={cn(
                "flex items-center gap-2.5 typo-caption py-1 px-1 rounded-md transition-colors",
                todo.status === "completed" && "text-muted-foreground",
                todo.status === "in_progress" && "bg-primary/5",
              )}
            >
              {getStatusIcon(todo.status)}
              <span
                className={cn(
                  todo.status === "completed" && "line-through decoration-muted-foreground/40",
                  todo.status === "in_progress" && "text-foreground font-medium",
                )}
              >
                {todo.content}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
