import React from "react";
import { ChevronRight } from "@/components/ui/icons";
import { ipc } from "@/ipc/types";
import { useTheme } from "@/contexts/ThemeContext";

/** Standalone Playground row — outside of any provider section */
export function PlaygroundSection() {
  const { theme, intensity } = useTheme();

  return (
    <div
      className="flex items-center justify-between cursor-pointer group p-4 rounded-xl border border-border hover:bg-muted/30 transition-colors gap-4"
      onClick={() => {
        ipc.system.openPlaygroundWindow({
          theme: theme as "light" | "dark" | "system",
          themeIntensity: intensity,
        });
      }}
    >
      <div className="flex items-center gap-3 flex-1">
        <span className="text-base">🧪</span>
        <div>
          <h3 className="typo-label font-semibold">Playground</h3>
          <p className="typo-caption mt-0.5">
            Compara modelos ejecutando el mismo prompt contra varios a la vez
          </p>
        </div>
      </div>
      <ChevronRight className="size-4 text-muted-foreground/50 group-hover:text-foreground transition-colors duration-200 shrink-0" />
    </div>
  );
}
