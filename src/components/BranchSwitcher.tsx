import { useState, useCallback } from "react";
import { GitBranch, Check, Plus, Loader2, ChevronDown } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ipc } from "@/ipc/types";
import { toast } from "sonner";

interface BranchSwitcherProps {
  appId: number;
  currentBranch: string | null;
  branches: string[];
  switchBranch: (branch: string) => Promise<void>;
  isSwitchingBranch: boolean;
  /** Optional ahead count badge */
  aheadCount?: number;
  /** Popover alignment */
  align?: "start" | "center" | "end";
}

export function BranchSwitcher({
  appId,
  currentBranch,
  branches,
  switchBranch,
  isSwitchingBranch,
  aheadCount,
  align = "end",
}: BranchSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateBranch = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newBranchName.trim() || !appId || !currentBranch) return;
      setIsCreating(true);
      try {
        await ipc.github.createBranch({
          appId,
          branch: newBranchName.trim(),
          from: currentBranch,
        });
        await switchBranch(newBranchName.trim());
        toast.success(`Rama '${newBranchName}' creada y seleccionada`);
        setShowCreateDialog(false);
        setNewBranchName("");
      } catch (err: any) {
        toast.error(`Error al crear la rama: ${err.message}`);
      } finally {
        setIsCreating(false);
      }
    },
    [newBranchName, appId, currentBranch, switchBranch],
  );

  if (!currentBranch || currentBranch === "<no-branch>") return null;

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            className={cn(
              "flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-primary/10 text-primary text-xs font-medium",
              "hover:bg-primary/20 transition-colors cursor-pointer",
              isSwitchingBranch && "opacity-60 pointer-events-none",
            )}
            disabled={isSwitchingBranch}
          >
            {isSwitchingBranch ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <GitBranch size={12} />
            )}
            <span className="truncate max-w-[120px]">{currentBranch}</span>
            {aheadCount !== undefined && aheadCount > 0 && (
              <span className="ml-0.5 text-[10px] bg-primary/20 px-1 rounded">
                ↑{aheadCount}
              </span>
            )}
            <ChevronDown size={10} className="ml-0.5 opacity-60" />
          </button>
        </PopoverTrigger>
        <PopoverContent align={align} className="w-56 p-1">
          <div className="px-2 py-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Cambiar de rama
            </p>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {branches.length === 0 ? (
              <p className="px-2 py-2 text-xs text-muted-foreground italic">
                No hay ramas disponibles
              </p>
            ) : (
              branches.map((branch) => (
                <button
                  key={branch}
                  className={cn(
                    "flex items-center gap-2 w-full px-2 py-1.5 rounded-sm text-xs transition-colors text-left",
                    branch === currentBranch
                      ? "bg-primary/10 text-primary font-semibold"
                      : "hover:bg-muted text-foreground",
                  )}
                  disabled={branch === currentBranch || isSwitchingBranch}
                  onClick={async () => {
                    setOpen(false);
                    await switchBranch(branch);
                  }}
                >
                  {branch === currentBranch ? (
                    <Check size={12} className="text-primary shrink-0" />
                  ) : (
                    <GitBranch size={12} className="text-muted-foreground shrink-0" />
                  )}
                  <span className="truncate">{branch}</span>
                </button>
              ))
            )}
          </div>
          <div className="border-t border-border/50 mt-1 pt-1">
            <button
              className="flex items-center gap-2 w-full px-2 py-1.5 rounded-sm text-xs transition-colors text-left hover:bg-muted"
              onClick={() => {
                setOpen(false);
                setShowCreateDialog(true);
              }}
            >
              <Plus size={12} className="text-primary shrink-0" />
              <span className="text-primary font-medium">Crear nueva rama...</span>
            </button>
          </div>
        </PopoverContent>
      </Popover>

      {/* Create branch dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Crear nueva rama</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateBranch}>
            <div className="py-4">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Nombre de la rama (basada en {currentBranch})
              </label>
              <Input
                autoFocus
                placeholder="ej: feature/nueva-ui"
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                className="text-sm"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowCreateDialog(false)}
                disabled={isCreating}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={!newBranchName.trim() || isCreating}>
                {isCreating ? <Loader2 size={16} className="animate-spin mr-2" /> : null}
                Crear y cambiar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
