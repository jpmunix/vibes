import { useState } from "react";
import { GitBranch, Check, Plus, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useGitPanel } from "@/hooks/useGitPanel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ipc } from "@/ipc/types";
import { showSuccess, showError } from "@/lib/toast";

interface AgentBranchSelectorProps {
  appId: number;
}

export function AgentBranchSelector({ appId }: AgentBranchSelectorProps) {
  const {
    currentBranch,
    branches,
    switchBranch,
    isSwitchingBranch,
  } = useGitPanel(appId);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBranchName.trim() || !appId || !currentBranch) return;

    try {
      setIsCreating(true);
      await ipc.github.createBranch({
        appId,
        branch: newBranchName.trim(),
        from: currentBranch,
      });
      showSuccess(`Rama '${newBranchName}' creada y seleccionada`);
      setIsCreateModalOpen(false);
      setNewBranchName("");
      // switchBranch is technically not needed if 'checkout: true' works, but we can do a hard refresh or wait for the hook polling to catch up.
      // In useGitPanel, there's no explicitly exported refetch for branches, but it polls or we can just window.location.reload if strict, 
      // but actually useGitPanel fetches branches... we can just let it refetch or we manually switch. 
      // Actually switchBranch handles the invalidation, let's call it to force UI update if needed, but createBranch might not return anything.
      await switchBranch(newBranchName.trim());
    } catch (err: any) {
      showError(`Error al crear la rama: ${err.message}`);
    } finally {
      setIsCreating(false);
    }
  };

  if (!currentBranch || currentBranch === "<no-branch>") return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            disabled={isSwitchingBranch}
          >
            {isSwitchingBranch ? (
              <Loader2 size={13} className="animate-spin text-primary" />
            ) : (
              <GitBranch size={13} className="text-primary/80" />
            )}
            <span className="truncate max-w-[120px]">{currentBranch}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56 overflow-hidden flex flex-col max-h-[400px]">
          <div className="px-2 py-1.5 shrink-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Cambiar de rama
            </p>
          </div>
          <div className="overflow-y-auto flex-1 h-full min-h-[50px]">
            {branches.map((branch) => (
              <DropdownMenuItem
                key={branch}
                disabled={branch === currentBranch || isSwitchingBranch}
                onClick={() => switchBranch(branch)}
                className="flex items-center gap-2 cursor-pointer"
              >
                {branch === currentBranch ? (
                  <Check size={12} className="text-primary shrink-0" />
                ) : (
                  <GitBranch size={12} className="text-muted-foreground shrink-0" />
                )}
                <span className={`truncate ${branch === currentBranch ? "font-semibold text-primary" : ""}`}>
                  {branch}
                </span>
              </DropdownMenuItem>
            ))}
          </div>

          <DropdownMenuSeparator className="shrink-0" />
          
          <DropdownMenuItem
            className="cursor-pointer shrink-0"
            onClick={() => setIsCreateModalOpen(true)}
          >
            <Plus size={14} className="mr-2 text-primary" />
            <span className="text-primary font-medium">Crear nueva rama...</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Crear nueva rama</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateBranch}>
            <div className="py-4">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Nombre de la rama (basada en {currentBranch})
              </label>
              <input
                autoFocus
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="ej: feature/nueva-ui"
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsCreateModalOpen(false)}
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
