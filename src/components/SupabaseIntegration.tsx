import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
// We might need a Supabase icon here, but for now, let's use a generic one or text.
// import { Supabase } from "lucide-react"; // Placeholder
import { DatabaseZap, Trash2 } from "lucide-react"; // Using DatabaseZap as a placeholder
import { useSettings } from "@/hooks/useSettings";
import { useSupabase } from "@/hooks/useSupabase";
import { showSuccess, showError } from "@/lib/toast";
import { isSupabaseConnected } from "@/lib/schemas";

// This is defined in settings.tsx, we can't easily import it without moving it to a shared place.
// For now, I'll define a local version or just use the same pattern.
function SettingItem({
  label,
  description,
  control,
  onClick,
}: {
  label: string;
  description: string;
  control: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className="flex items-start justify-between gap-8 p-4 rounded-xl hover:bg-muted/50 transition-colors border border-transparent hover:border-border cursor-pointer"
    >
      <div className="flex-1">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">
          {label}
        </h3>
        <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
          {description}
        </p>
      </div>
      <div onClick={(e) => e.stopPropagation()}>{control}</div>
    </div>
  );
}

export function SupabaseIntegration() {
  const { settings, updateSettings } = useSettings();
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  // Check if there are any connected organizations
  const isConnected = isSupabaseConnected(settings);

  const { organizations, refetchOrganizations, deleteOrganization } =
    useSupabase();

  const handleDisconnectAllFromSupabase = async () => {
    setIsDisconnecting(true);
    try {
      // Clear the entire supabase object in settings (including all organizations)
      const result = await updateSettings({
        supabase: undefined,
        // Also disable the migration setting on disconnect
        enableSupabaseWriteSqlMigration: false,
      });
      if (result) {
        showSuccess(
          "Todas las organizaciones de Supabase se han desconectado con éxito",
        );
        await refetchOrganizations();
      } else {
        showError("Error al desconectar de Supabase");
      }
    } catch (err: any) {
      showError(
        err.message || "Se produjo un error al desconectar de Supabase",
      );
    } finally {
      setIsDisconnecting(false);
    }
  };

  const handleDeleteOrganization = async (organizationSlug: string) => {
    try {
      await deleteOrganization({ organizationSlug });
      showSuccess("Organización desconectada con éxito");
    } catch (err: any) {
      showError(err.message || "Error al desconectar la organización");
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
    <div className="space-y-8 p-6 rounded-2xl bg-muted/30 border border-border">
      <div className="flex items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-xl bg-card shadow-sm border border-border">
            <DatabaseZap className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">
              Supabase
            </h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              {organizations.length} organización
              {organizations.length !== 1 ? "es" : ""} conectada
            </p>
          </div>
        </div>

        <Button
          onClick={handleDisconnectAllFromSupabase}
          variant="ghost"
          size="sm"
          disabled={isDisconnecting}
          className="rounded-xl h-10 px-4 font-bold text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
        >
          {isDisconnecting ? "Desconectando..." : "Desconectar todo"}
        </Button>
      </div>

      {organizations.length > 0 && (
        <div className="space-y-3">
          <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1">
            Organizaciones conectadas
          </Label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {organizations.map((org) => (
              <div
                key={org.organizationSlug}
                className="flex items-center justify-between p-4 rounded-xl bg-card border border-border shadow-sm group"
              >
                <div className="flex flex-col min-w-0 pr-4">
                  <span className="text-sm font-bold text-gray-900 dark:text-white truncate">
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
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg group-hover:opacity-100 opacity-40 transition-opacity"
                  onClick={() => handleDeleteOrganization(org.organizationSlug)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-4 pt-8 border-t border-border">
        <SettingItem
          label="Escribir archivos de migración SQL"
          description="Genera archivos de migración SQL al modificar el esquema de Supabase para control de versiones"
          onClick={() => handleMigrationSettingChange(!settings?.enableSupabaseWriteSqlMigration)}
          control={
            <Switch
              checked={!!settings?.enableSupabaseWriteSqlMigration}
              onCheckedChange={handleMigrationSettingChange}
            />
          }
        />

        <SettingItem
          label="Mantener funciones de borde adicionales"
          description="Evita que se eliminen automáticamente las funciones desplegadas en Supabase no presentes localmente"
          onClick={() => handleSkipPruneSettingChange(!settings?.skipPruneEdgeFunctions)}
          control={
            <Switch
              checked={!!settings?.skipPruneEdgeFunctions}
              onCheckedChange={handleSkipPruneSettingChange}
            />
          }
        />
      </div>
    </div>
  );
}
