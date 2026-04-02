import type React from "react";
import type { ReactNode } from "react";
import { useState } from "react";
import {
  ChevronsDownUp,
  ChevronsUpDown,
  Loader,
  CircleX,
  Rabbit,
} from "lucide-react";
import { CodeHighlight } from "./CodeHighlight";
import { CustomTagState } from "./stateTypes";

interface VibesEditProps {
  children?: ReactNode;
  node?: any;
  path?: string;
  description?: string;
}

export const VibesEdit: React.FC<VibesEditProps> = ({
  children,
  node,
  path: pathProp,
  description: descriptionProp,
}) => {
  const [isContentVisible, setIsContentVisible] = useState(false);

  // Use props directly if provided, otherwise extract from node
  const path = pathProp || node?.properties?.path || "";
  const description = descriptionProp || node?.properties?.description || "";
  const state = node?.properties?.state as CustomTagState;
  const retryCount = node?.properties?.retryCount || "";
  const inProgress = state === "pending";
  const aborted = state === "aborted";
  const finished = state === "finished";

  const badgeClass = aborted
    ? "bg-red-500/90 text-white"
    : finished
      ? "bg-emerald-500/75 text-white"
      : inProgress
        ? "bg-amber-500/90 text-white"
        : "bg-blue-500 text-white";

  // Extract filename from path
  const fileName = path ? path.split("/").pop() : "";

  return (
    <div
      className={`bg-(--background-lightest) hover:bg-(--background-lighter) rounded-lg px-4 py-2 border my-2 cursor-pointer ${inProgress
        ? "border-amber-500"
        : aborted
          ? "border-red-500"
          : "border-border"
        }`}
      onClick={() => setIsContentVisible(!isContentVisible)}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex items-center">
            <Rabbit size={16} />
            <span
              className={`${badgeClass} text-xs px-1.5 py-0.5 rounded ml-1 font-medium`}
            >
              Turbo Edit
            </span>
          </div>
          {fileName && (
            <div className="flex items-center">
              <span className="text-foreground font-medium text-sm">
                {fileName}
              </span>
              {retryCount && Number(retryCount) > 1 && (
                <span className="text-xs text-muted-foreground ml-1 italic">
                  (reintento {Number(retryCount) - 1})
                </span>
              )}
            </div>
          )}
          {inProgress && (
            <div className="flex items-center text-amber-600 text-xs">
              <Loader size={14} className="mr-1 animate-spin" />
              <span>Editando...</span>
            </div>
          )}
          {aborted && (
            <div className="flex items-center text-red-600 text-xs">
              <CircleX size={14} className="mr-1" />
              <span>No ha terminado</span>
            </div>
          )}
        </div>
        <div className="flex items-center">
          {isContentVisible ? (
            <ChevronsDownUp
              size={20}
              className="text-muted-foreground hover:text-foreground"
            />
          ) : (
            <ChevronsUpDown
              size={20}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            />
          )}
        </div>
      </div>
      {path && (
        <div className="text-xs text-muted-foreground font-medium mb-1">
          {path}
        </div>
      )}
      {description && (
        <div className="text-sm text-muted-foreground">
          <span className="font-medium">Summary: </span>
          {description}
        </div>
      )}
      {isContentVisible && (
        <div
          className="text-xs cursor-text"
          onClick={(e) => e.stopPropagation()}
        >
          <CodeHighlight className="language-typescript">
            {children}
          </CodeHighlight>
        </div>
      )}
    </div>
  );
};
