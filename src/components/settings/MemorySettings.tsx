/**
 * MemorySettings — Settings section for project preferences.
 */

import React from "react";
import { useSettings } from "@/hooks/useSettings";
import { cn } from "@/lib/utils";
import { MemorySelectionModelSelector } from "./MemorySelectionModelSelector";
import { UnifiedSelector } from "@/components/ui/UnifiedSelector";

// =============================================================================
// SettingRow — same as AIBehaviorSettings.SettingRow
// =============================================================================

function SettingRow({
  label,
  description,
  control,
  onClick,
}: {
  label: string;
  description?: React.ReactNode;
  control: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "flex justify-between gap-8 p-4 rounded-xl hover:bg-muted/50 transition-colors items-center",
        onClick ? "cursor-pointer" : "",
      )}
    >
      <div className="flex-1 min-w-0">
        <h3 className="typo-label">{label}</h3>
        {description && (
          <p className="typo-caption mt-1 leading-relaxed">{description}</p>
        )}
      </div>
      <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
        {control}
      </div>
    </div>
  );
}

// =============================================================================
// TogglePill — same as settings.tsx TogglePill
// =============================================================================

function TogglePill({
  checked,
  onCheckedChange,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="relative bg-muted/50 rounded-xl p-1 flex w-fit border border-border">
      {([false, true] as const).map((value) => (
        <button
          key={String(value)}
          onClick={() => onCheckedChange(value)}
          className={cn(
            "px-4 py-1.5 typo-select !font-bold rounded-lg transition-colors duration-200 cursor-pointer",
            checked === value
              ? "bg-primary text-primary-foreground shadow-sm"
              : "hover:bg-primary/10",
          )}
        >
          {value ? "Activado" : "Desactivado"}
        </button>
      ))}
    </div>
  );
}

// =============================================================================
// Component
// =============================================================================

export function MemorySettings() {
  const { settings, updateSettings } = useSettings();

  return (
    <div className="space-y-4">
      {/* ⚙️ Toggle: project preferences enabled */}
      <SettingRow
        label="Directrices del proyecto"
        description="El agente utiliza tus directrices para personalizar sus respuestas"
        onClick={() => updateSettings({ memoriesEnabled: !(settings?.memoriesEnabled !== false) })}
        control={
          <TogglePill
            checked={settings?.memoriesEnabled !== false}
            onCheckedChange={(checked) => updateSettings({ memoriesEnabled: checked })}
          />
        }
      />

      {/* ⚙️ Model selector — Router (reads) */}
      <SettingRow
        label="Modelo de selección"
        description="Modelo ultraligero que clasifica qué directrices inyectar según el prompt del usuario"
        control={<MemorySelectionModelSelector />}
      />

      {/* ⚙️ Max preferences to inject */}
      <SettingRow
        label="Directrices máximas por inyección"
        description="Cantidad máxima de directrices que se pueden inyectar en cada prompt"
        control={
          <UnifiedSelector
            value={String(settings?.memoriesMaxSelection || 5)}
            onChange={(v) => updateSettings({ memoriesMaxSelection: Number(v) })}
            options={[
              { value: "1", label: "1" },
              { value: "2", label: "2" },
              { value: "3", label: "3" },
              { value: "4", label: "4" },
              { value: "5", label: "5" },
            ]}
            triggerVariant="pill"
            triggerSize="sm"
            popoverWidth="w-[120px]"
            itemLayout="compact"
          />
        }
      />
    </div>
  );
}
