import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";
import { useState } from "react";
import { ImportAppDialog } from "./ImportAppDialog";
import { cn } from "@/lib/utils";

export function ImportAppButton({ className }: { className?: string }) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  return (
    <>
      <div className={cn("px-0 pb-0 flex justify-stretch", className)}>
        <Button
          variant="outline"
          size="default"
          onClick={() => setIsDialogOpen(true)}
          className="flex items-center justify-start gap-2 w-full py-2"
        >
          <Upload className="h-4 w-4" />
          Importar App
        </Button>
      </div>
      <ImportAppDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
      />
    </>
  );
}
