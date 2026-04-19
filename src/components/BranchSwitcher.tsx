import { useState, useCallback } from "react";
import { GitBranch, Check, Plus, Loader2, ChevronDown } from "@/components/ui/icons";
import { UnifiedSelector } from "@/components/ui/UnifiedSelector";
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
      <UnifiedSelector
        value={currentBranch}
        onChange={async (val) => {
          if (val === "__create__") {
            setShowCreateDialog(true);
          } else {
            await switchBranch(String(val));
          }
        }}
        options={[
          ...branches.map((b) => ({
            value: b,
            label: b,
            leftIcon: <GitBranch size={14} className="opacity-70" />,
            group: "branches"
          })),
          {
            value: "__create__",
            label: "Crear nueva rama...",
            leftIcon: <Plus size={14} className="text-primary" />,
            group: "actions"
          }
        ]}
        groups={[
          { id: "branches", heading: "Cambiar de rama" },
          { id: "actions", heading: undefined }
        ]}
        searchable
        searchPlaceholder="Buscar rama..."
        triggerVariant="pill"
        triggerSize="sm"
        triggerClassName={cn(
          "!bg-primary/10 !text-primary !shadow-none hover:!bg-primary/20",
          isSwitchingBranch && "opacity-60 pointer-events-none"
        )}
        customTriggerLabel={
          <div className="flex items-center gap-1.5 min-w-0">
            {isSwitchingBranch ? <Loader2 size={12} className="animate-spin" /> : <GitBranch size={12} />}
            <span className="truncate max-w-[120px] typo-label">{currentBranch}</span>
            {aheadCount !== undefined && aheadCount > 0 && (
              <span className="ml-0.5 text-[10px] bg-primary/20 px-1 rounded-sm leading-tight inline-flex items-center">
                ↑{aheadCount}
              </span>
            )}
          </div>
        }
        align={align}
        popoverWidth="w-[260px]"
        popoverMaxHeight="max-h-[300px]"
        showCheckmark
      />

      {/* Create branch dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Crear nueva rama</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateBranch}>
            <div className="py-4">
              <label className="typo-label opacity-80 mb-1 block">
                Nombre de la rama (basada en {currentBranch})
              </label>
              <Input
                autoFocus
                placeholder="ej: feature/nueva-ui"
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                className="typo-body"
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
