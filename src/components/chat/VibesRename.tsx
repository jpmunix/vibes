import type React from "react";
import type { ReactNode } from "react";
import { FileEdit } from "@/components/ui/icons";

interface VibesRenameProps {
  children?: ReactNode;
  node?: any;
  from?: string;
  to?: string;
}

export const VibesRename: React.FC<VibesRenameProps> = ({
  children,
  node,
  from: fromProp,
  to: toProp,
}) => {
  // Use props directly if provided, otherwise extract from node
  const from = fromProp || node?.properties?.from || "";
  const to = toProp || node?.properties?.to || "";

  // Extract filenames from paths
  const fromFileName = from ? from.split("/").pop() : "";
  const toFileName = to ? to.split("/").pop() : "";

  return (
    <div className="bg-(--background-lightest) rounded-lg px-4 py-2 border border-amber-500 my-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileEdit size={16} className="text-amber-500" />
          {(fromFileName || toFileName) && (
            <span className="text-foreground font-medium text-sm">
              {fromFileName && toFileName
                ? `${fromFileName} → ${toFileName}`
                : fromFileName || toFileName}
            </span>
          )}
          <div className="text-xs text-amber-500 font-medium">Rename</div>
        </div>
      </div>
      {(from || to) && (
        <div className="flex flex-col text-xs text-muted-foreground font-medium mb-1">
          {from && (
            <div>
              <span className="text-muted-foreground">From:</span>{" "}
              {from}
            </div>
          )}
          {to && (
            <div>
              <span className="text-muted-foreground">To:</span> {to}
            </div>
          )}
        </div>
      )}
      <div className="text-sm text-muted-foreground dark:text-muted-foreground/50 mt-2">
        {children}
      </div>
    </div>
  );
};
