
import { Upload } from "lucide-react";
import { useState } from "react";
import { ImportAppDialog } from "./ImportAppDialog";
import { cn } from "@/lib/utils";

export function ImportAppButton({ className }: { className?: string }) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  return (
    <>
      <div className={cn("px-0 pb-0 flex justify-stretch", className)}>
        <button
          type="button"
          onClick={() => setIsDialogOpen(true)}
          className="sidebar-action-btn"
        >
          <Upload className="h-4 w-4" />
          Importar App
        </button>
      </div>
      <ImportAppDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
      />
    </>
  );
}
