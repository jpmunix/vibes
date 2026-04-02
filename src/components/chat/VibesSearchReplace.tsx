import type React from "react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import {
  ChevronsDownUp,
  ChevronsUpDown,
  Loader,
  CircleX,
  Search,
  ArrowLeftRight,
} from "lucide-react";
import { CodeHighlight } from "./CodeHighlight";
import { CustomTagState } from "./stateTypes";
import { parseSearchReplaceBlocks } from "@/pro/shared/search_replace_parser";

interface VibesSearchReplaceProps {
  children?: ReactNode;
  node?: any;
  path?: string;
  description?: string;
}

export const VibesSearchReplace: React.FC<VibesSearchReplaceProps> = ({
  children,
  node,
  path: pathProp,
  description: descriptionProp,
}) => {
  const [isContentVisible, setIsContentVisible] = useState(false);

  const path = pathProp || node?.properties?.path || "";
  const description = descriptionProp || node?.properties?.description || "";
  const state = node?.properties?.state as CustomTagState;
  const retryCount = node?.properties?.retryCount || "";
  const inProgress = state === "pending";
  const aborted = state === "aborted";

  const blocks = useMemo(
    () => parseSearchReplaceBlocks(String(children ?? "")),
    [children],
  );

  const fileName = path ? path.split("/").pop() : "";

  return (
    <div
      data-testid="vibes-search-replace"
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
            <Search size={16} />
            <span className="bg-purple-600 text-white text-xs px-1.5 py-0.5 rounded ml-1 font-medium">
              Search & Replace
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
              <span>Applying changes...</span>
            </div>
          )}
          {aborted && (
            <div className="flex items-center text-red-600 text-xs">
              <CircleX size={14} className="mr-1" />
              <span>No terminado</span>
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
          {blocks.length === 0 ? (
            <CodeHighlight className="language-typescript">
              {children}
            </CodeHighlight>
          ) : (
            <div className="space-y-3">
              {blocks.map((b, i) => (
                <div key={i} className="border rounded-lg">
                  <div className="flex items-center justify-between px-3 py-2 bg-(--background-lighter) rounded-t-lg text-xs">
                    <div className="flex items-center gap-2">
                      <ArrowLeftRight size={14} />
                      <span className="font-medium">Change {i + 1}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
                    <div className="p-3 border-t md:border-r">
                      <div className="text-xs mb-1 text-muted-foreground font-medium">
                        Search
                      </div>
                      <CodeHighlight className="language-typescript">
                        {b.searchContent}
                      </CodeHighlight>
                    </div>
                    <div className="p-3 border-t">
                      <div className="text-xs mb-1 text-muted-foreground font-medium">
                        Replace
                      </div>
                      <CodeHighlight className="language-typescript">
                        {b.replaceContent}
                      </CodeHighlight>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
