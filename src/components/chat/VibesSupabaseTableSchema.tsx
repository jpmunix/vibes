import React, { useState } from "react";
import { CustomTagState } from "./stateTypes";
import {
  Table2,
  Loader2,
  CircleX,
  ChevronsDownUp,
  ChevronsUpDown,
} from "@/components/ui/icons";

interface VibesSupabaseTableSchemaProps {
  node: {
    properties: {
      table?: string;
      state?: CustomTagState;
    };
  };
  children: React.ReactNode;
}

export function VibesSupabaseTableSchema({
  node,
  children,
}: VibesSupabaseTableSchemaProps) {
  const [isContentVisible, setIsContentVisible] = useState(false);
  const { table, state } = node.properties;
  const isLoading = state === "pending";
  const isAborted = state === "aborted";
  const content = typeof children === "string" ? children : "";

  return (
    <div
      className={`bg-(--background-lightest) hover:bg-(--background-lighter) rounded-lg px-4 py-2 border my-2 cursor-pointer ${
        isLoading
          ? "border-amber-500"
          : isAborted
            ? "border-red-500"
            : "border-border"
      }`}
      onClick={() => setIsContentVisible(!isContentVisible)}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isLoading ? (
            <Loader2 className="size-4 animate-spin text-amber-600" />
          ) : isAborted ? (
            <CircleX className="size-4 text-red-500" />
          ) : (
            <Table2 className="size-4 text-muted-foreground" />
          )}
          <span className="text-foreground font-medium text-sm">
            {table ? `Table Schema: ${table}` : "Supabase Table Schema"}
          </span>
          {isLoading && (
            <span className="text-xs text-amber-600">Fetching...</span>
          )}
          {isAborted && (
            <span className="text-xs text-red-500">No terminado</span>
          )}
        </div>
        <div className="flex items-center">
          {isContentVisible ? (
            <ChevronsDownUp
              size={20}
              className="text-muted-foreground hover:text-foreground dark:text-muted-foreground/70 dark:hover:text-foreground"
            />
          ) : (
            <ChevronsUpDown
              size={20}
              className="text-muted-foreground hover:text-foreground dark:text-muted-foreground/70 dark:hover:text-foreground"
            />
          )}
        </div>
      </div>
      {isContentVisible && content && (
        <div className="mt-2 p-3 text-xs font-mono whitespace-pre-wrap max-h-80 overflow-y-auto bg-muted/30 rounded-md">
          {content}
        </div>
      )}
    </div>
  );
}
