/**
 * AdminDbSelector — switches which database the admin panel operates on.
 *
 * - "current": production vibes database (default).
 * - "legacy": old minube-vibes database (isolated connector).
 *
 * The selection is persisted in localStorage and mirrored to the main process
 * via ipc.admin.setActiveDb so the admin handlers resolve the right database.
 */
import { useEffect, useState } from "react";
import { ipc } from "@/ipc/types";
import type { AdminDbTarget } from "@/ipc/types/admin";
import { Database, Loader2 } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "vibes_admin_db_target";

const OPTIONS: { value: AdminDbTarget; label: string; hint: string }[] = [
  { value: "current", label: "Actual", hint: "DB de producción (vibes)" },
  { value: "legacy", label: "Minube", hint: "DB antigua (minube-vibes)" },
];

export function AdminDbSelector({
  value,
  onChange,
}: {
  value: AdminDbTarget;
  onChange: (target: AdminDbTarget) => void;
}) {
  const [syncing, setSyncing] = useState(false);

  // Persist + mirror to main process on mount and whenever the value changes.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      /* ignore */
    }
    setSyncing(true);
    ipc.admin
      .setActiveDb({ target: value })
      .catch(() => {})
      .finally(() => setSyncing(false));
  }, [value]);

  return (
    <div className="px-3 pb-3 pt-2 border-b border-border space-y-2">
      <div className="flex items-center gap-2 px-1">
        <Database size={13} className="text-muted-foreground" />
        <span className="typo-caption text-muted-foreground flex-1">
          Base de datos
        </span>
        {syncing && (
          <Loader2 size={12} className="animate-spin text-muted-foreground" />
        )}
      </div>
      <div className="flex gap-1 rounded-lg bg-sidebar-accent/60 p-1">
        {OPTIONS.map((opt) => {
          const active = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              title={opt.hint}
              onClick={() => onChange(opt.value)}
              className={cn(
                "flex-1 text-center px-2 py-1.5 rounded-md typo-menu-item transition-colors cursor-pointer",
                active
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground opacity-75 hover:opacity-100",
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
