import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, Bot, Zap } from "lucide-react";

interface DyadProSuccessDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DyadProSuccessDialog({
  isOpen,
  onClose,
}: DyadProSuccessDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 text-xl">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <span>¡Bienvenido a Dyad Pro!</span>
          </DialogTitle>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <p className="text-base text-muted-foreground">
            ¡Todo listo! Hemos aplicado estos ajustes predeterminados, pero
            puedes cambiarlos en cualquier momento:
          </p>

          <div className="space-y-3">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/50">
                <Zap className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <p className="font-medium">Modelo automático</p>
                <p className="text-sm text-muted-foreground">
                  Selecciona automáticamente un modelo de IA de primer nivel
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900/50">
                <Bot className="h-4 w-4 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="font-medium">Modo Agente</p>
                <p className="text-sm text-muted-foreground">
                  Dyad puede trabajar en tareas más grandes y depurar problemas
                </p>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={onClose} className="w-full">
            Empezar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
