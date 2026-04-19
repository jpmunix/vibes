import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Trash2, ChevronRight } from "@/components/ui/icons";
import supabaseLogo from "../../assets/logo-supabase-icon.svg";
import { useSettings } from "@/hooks/useSettings";
import { useSupabase } from "@/hooks/useSupabase";
import { showSuccess, showError } from "@/lib/toast";
import { isSupabaseConnected } from "@/lib/schemas";
import { cn } from "@/lib/utils";

function TogglePill({ checked, onCheckedChange }: { checked: boolean; onCheckedChange: (checked: boolean) => void }) {
  return (
    <div className="relative bg-muted/50 rounded-xl p-1 flex w-fit border border-border">
      {([false, true] as const).map((value) => (
        <button
          key={String(value)}
          onClick={() => onCheckedChange(value)}
          className={cn(
            "px-4 py-1.5 text-sm font-bold rounded-lg transition-colors duration-200 cursor-pointer",
            checked === value
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-primary hover:bg-primary/10",
          )}
        >
          {value ? "Activado" : "Desactivado"}
        </button>
      ))}
    </div>
  );
}

export function SupabaseIntegration() {
  const { settings, updateSettings } = useSettings();
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const isConnected = isSupabaseConnected(settings);

  const {
    organizations,
    deleteOrganization,
  } = useSupabase();

  const handleDisconnectAllFromSupabase = async () => {
    setIsDisconnecting(true);
    try {
      for (const org of organizations) {
        await deleteOrganization({ organizationSlug: org.organizationSlug });
      }
      await updateSettings({
        supabaseAccessToken: undefined,
        supabaseRefreshToken: undefined,
        supabaseTokenExpiresAt: undefined,
        supabaseUserId: undefined,
      });
      showSuccess("Desconectado de Supabase con éxito");
    } catch (err: any) {
      showError(
        err.message || "Se produjo un error al desconectar de Supabase",
      );
    } finally {
      setIsDisconnecting(false);
    }
  };

  const handleDeleteOrganization = async (slug: string) => {
    try {
      await deleteOrganization({ organizationSlug: slug });
      showSuccess("Organización desconectada");
    } catch (err: any) {
      showError(err.message || "Error al desconectar organización");
    }
  };

  const handleMigrationSettingChange = async (enabled: boolean) => {
    try {
      await updateSettings({
        enableSupabaseWriteSqlMigration: enabled,
      });
      showSuccess("Ajuste actualizado");
    } catch (err: any) {
      showError(err.message || "Error al actualizar el ajuste");
    }
  };

  const handleSkipPruneSettingChange = async (enabled: boolean) => {
    try {
      await updateSettings({
        skipPruneEdgeFunctions: enabled,
      });
      showSuccess("Ajuste actualizado");
    } catch (err: any) {
      showError(err.message || "Error al actualizar el ajuste");
    }
  };

  if (!isConnected) {
    return null;
  }

  return (
    <div className="space-y-4">
      {/* Header row - clickable to expand, matches SettingRow pattern */}
      <div
        className="flex items-center justify-between gap-8 p-4 rounded-xl border border-border hover:bg-muted/50 transition-colors cursor-pointer group"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
            <img src={supabaseLogo} alt="Supabase" className="h-4 w-4 brightness-0 dark:invert opacity-70 shrink-0" />
            Supabase
          </h3>
          <p className="typo-caption mt-1">
            {organizations.length} organización
            {organizations.length !== 1 ? "es" : ""} conectada
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            onClick={(e) => { e.stopPropagation(); handleDisconnectAllFromSupabase(); }}
            variant="ghost"
            size="sm"
            disabled={isDisconnecting}
            className="rounded-lg h-auto px-4 py-1.5 font-bold text-sm bg-muted/50 border border-border hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/10 hover:border-red-200 dark:hover:border-red-900/30 transition-colors cursor-pointer"
          >
            {isDisconnecting ? "Desconectando..." : "Desconectar"}
          </Button>
          <ChevronRight
            className={cn(
              "size-5 text-muted-foreground/50 group-hover:text-foreground transition-transform duration-200 shrink-0",
              expanded && "rotate-90",
            )}
          />
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="space-y-6 pl-8">
          {/* Organizations */}
          {organizations.length > 0 && (
            <div className="space-y-3">
              <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground/60 ml-1">
                Organizaciones conectadas
              </Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {organizations.map((org) => (
                  <div
                    key={org.organizationSlug}
                    className="flex items-center justify-between p-4 rounded-xl bg-card border border-border shadow-sm group"
                  >
                    <div className="flex flex-col min-w-0 pr-4">
                      <span className="text-sm font-bold text-foreground truncate">
                        {org.name || org.organizationSlug}
                      </span>
                      {org.ownerEmail && (
                        <span className="text-xs text-muted-foreground truncate">
                          {typeof org.ownerEmail === "string"
                            ? org.ownerEmail
                            : (org.ownerEmail as any).email}
                        </span>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-lg group-hover:opacity-100 opacity-40 transition-opacity cursor-pointer"
                      onClick={() => handleDeleteOrganization(org.organizationSlug)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sub-settings */}
          <div className="space-y-1">
            <div
              className="flex justify-between gap-8 p-4 rounded-xl hover:bg-muted/50 transition-colors items-center cursor-pointer"
              onClick={() =>
                handleMigrationSettingChange(
                  !settings?.enableSupabaseWriteSqlMigration,
                )
              }
            >
              <div className="flex-1">
                <h3 className="text-base font-semibold text-foreground">
                  Escribir archivos de migración SQL
                </h3>
                <p className="typo-caption mt-1 leading-relaxed">
                  Genera archivos de migración SQL al modificar el esquema de Supabase
                </p>
              </div>
              <div onClick={(e) => e.stopPropagation()}>
                <TogglePill
                  checked={!!settings?.enableSupabaseWriteSqlMigration}
                  onCheckedChange={handleMigrationSettingChange}
                />
              </div>
            </div>

            <div
              className="flex justify-between gap-8 p-4 rounded-xl hover:bg-muted/50 transition-colors items-center cursor-pointer"
              onClick={() =>
                handleSkipPruneSettingChange(!settings?.skipPruneEdgeFunctions)
              }
            >
              <div className="flex-1">
                <h3 className="text-base font-semibold text-foreground">
                  Mantener funciones de borde adicionales
                </h3>
                <p className="typo-caption mt-1 leading-relaxed">
                  Evita que se eliminen funciones desplegadas no presentes localmente
                </p>
              </div>
              <div onClick={(e) => e.stopPropagation()}>
                <TogglePill
                  checked={!!settings?.skipPruneEdgeFunctions}
                  onCheckedChange={handleSkipPruneSettingChange}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
