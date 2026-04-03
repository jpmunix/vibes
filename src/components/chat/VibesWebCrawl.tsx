import type React from "react";
import type { ReactNode } from "react";
import { Globe } from "lucide-react";

interface VibesWebCrawlProps {
  children?: ReactNode;
  node?: any;
}

export const VibesWebCrawl: React.FC<VibesWebCrawlProps> = ({
  children,
  node,
}) => {
  const url = node?.properties?.url;
  const state = node?.properties?.state;
  const isPending = state === "pending";

  return (
    <div className="bg-(--background-lightest) rounded-lg px-4 py-2 border my-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Globe size={16} className={isPending ? "text-blue-400 animate-pulse" : "text-blue-600"} />
          <div className={`text-xs font-medium ${isPending ? "text-blue-400" : "text-blue-600"}`}>
            {isPending ? "Buscando en la web..." : "Búsqueda Web"}
          </div>
        </div>
      </div>
      {url && (
        <div className="text-xs text-muted-foreground mt-1 font-mono break-all line-clamp-2">
          {url}
        </div>
      )}
      {!isPending && children && (
        <div className="text-sm italic text-gray-600 dark:text-gray-300 mt-2 line-clamp-6 overflow-y-auto">
          {children}
        </div>
      )}
    </div>
  );
};
