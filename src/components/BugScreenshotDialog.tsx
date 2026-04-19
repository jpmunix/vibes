import { ipc } from "@/ipc/types";
import { Dialog, DialogTitle } from "@radix-ui/react-dialog";
import { DialogContent, DialogHeader } from "./ui/dialog";
import { Button } from "./ui/button";
import { BugIcon, Camera } from "@/components/ui/icons";
import { useState } from "react";
import { ScreenshotSuccessDialog } from "./ScreenshotSuccessDialog";

interface BugScreenshotDialogProps {
  isOpen: boolean;
  onClose: () => void;
  handleReportBug: () => Promise<void>;
  isLoading: boolean;
}
export function BugScreenshotDialog({
  isOpen,
  onClose,
  handleReportBug,
  isLoading,
}: BugScreenshotDialogProps) {
  const [isScreenshotSuccessOpen, setIsScreenshotSuccessOpen] = useState(false);
  const [screenshotError, setScreenshotError] = useState<string | null>(null);

  const handleReportBugWithScreenshot = async () => {
    setScreenshotError(null);
    onClose();
    setTimeout(async () => {
      try {
        await ipc.system.takeScreenshot();
        setIsScreenshotSuccessOpen(true);
      } catch (error) {
        setScreenshotError(
          error instanceof Error ? error.message : "Error al hacer la captura",
        );
      }
    }, 200); // Small delay for dialog to close
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿Hacer una captura de pantalla?</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col space-y-4 w-full">
          <div className="flex flex-col space-y-2">
            <Button
              variant="default"
              onClick={handleReportBugWithScreenshot}
              className="w-full py-6 border-primary/50 shadow-sm shadow-primary/10 transition-[box-shadow] hover:shadow-md hover:shadow-primary/15"
            >
              <Camera className="mr-2 h-5 w-5" /> Hacer una captura
              (recomendado)
            </Button>
            <p className="typo-caption px-2">
              ¡Recibirás respuestas mejores y más rápidas si haces esto!
            </p>
          </div>
          <div className="flex flex-col space-y-2">
            <Button
              variant="outline"
              onClick={() => {
                handleReportBug();
              }}
              className="w-full py-6 bg-(--background-lightest)"
            >
              <BugIcon className="mr-2 h-5 w-5" />{" "}
              {isLoading
                ? "Preparando informe..."
                : "Enviar informe de error sin captura"}
            </Button>
            <p className="typo-caption px-2">
              Intentaremos responder, pero puede que no podamos ayudar tanto.
            </p>
          </div>
          {screenshotError && (
            <p className="typo-caption text-destructive px-2">
              Error al hacer la captura: {screenshotError}
            </p>
          )}
        </div>
      </DialogContent>
      <ScreenshotSuccessDialog
        isOpen={isScreenshotSuccessOpen}
        onClose={() => setIsScreenshotSuccessOpen(false)}
        handleReportBug={handleReportBug}
        isLoading={isLoading}
      />
    </Dialog>
  );
}
