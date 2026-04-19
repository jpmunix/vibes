import type React from "react";
import type { ReactNode } from "react";
import { useState } from "react";

import { ipc } from "@/ipc/types";

import { Package, ChevronsUpDown, ChevronsDownUp } from "@/components/ui/icons";
import { CodeHighlight } from "./CodeHighlight";

interface VibesAddDependencyProps {
  children?: ReactNode;
  node?: any;
  packages?: string;
}

export const VibesAddDependency: React.FC<VibesAddDependencyProps> = ({
  children,
  node,
}) => {
  // Extract package attribute from the node if available
  const packages = node?.properties?.packages?.split(" ") || "";
  const [isContentVisible, setIsContentVisible] = useState(false);
  const hasChildren = !!children;

  return (
    <div
      className={`bg-(--background-lightest) dark:bg-gray-900 hover:bg-(--background-lighter) rounded-lg px-4 py-3 border my-2 border-border ${
        hasChildren ? "cursor-pointer" : ""
      }`}
      onClick={
        hasChildren ? () => setIsContentVisible(!isContentVisible) : undefined
      }
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Package size={18} className="text-muted-foreground" />
          {packages.length > 0 && (
            <div className="text-foreground dark:text-foreground font-semibold text-base">
              <div className="font-normal">
                Do you want to install these packages?
              </div>{" "}
              <div className="flex flex-wrap gap-2 mt-2">
                {packages.map((p: string) => (
                  <span
                    className="cursor-pointer text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                    key={p}
                    onClick={() => {
                      ipc.system.openExternalUrl(
                        `https://www.npmjs.com/package/${p}`,
                      );
                    }}
                  >
                    {p}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
        {hasChildren && (
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
        )}
      </div>

      {packages.length > 0 && (
        <div className="text-sm text-muted-foreground mb-1">
          Make sure these packages are what you want.{" "}
        </div>
      )}

      {/* Show content if it's visible and has children */}
      {isContentVisible && hasChildren && (
        <div className="mt-2">
          <div className="text-xs">
            <CodeHighlight className="language-shell">{children}</CodeHighlight>
          </div>
        </div>
      )}
    </div>
  );
};
