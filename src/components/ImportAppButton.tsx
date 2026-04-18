
import { useState, useEffect } from "react";
import { ImportAppDialog } from "./ImportAppDialog";
import { cn } from "@/lib/utils";

export function ImportAppButton({ className }: { className?: string }) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Listen for programmatic trigger from TopNavbar dropdown
  useEffect(() => {
    const handler = () => setIsDialogOpen(true);
    window.addEventListener("trigger-import-app", handler);
    return () => window.removeEventListener("trigger-import-app", handler);
  }, []);

  return (
    <>
      <ImportAppDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
      />
    </>
  );
}
