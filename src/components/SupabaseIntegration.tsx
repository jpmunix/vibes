import { useState } from "react";
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
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Integración de Supabase
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {organizations.length} organización
            {organizations.length !== 1 ? "es" : ""} conectada a Supabase.
          </p>
        </div>
        <Button
          onClick={handleDisconnectAllFromSupabase}
          variant="destructive"
          size="sm"
          disabled={isDisconnecting}
          className="flex items-center gap-2"
        >
          {isDisconnecting ? "Desconectando..." : "Desconectar todo"}
          <DatabaseZap className="h-4 w-4" />
        </Button>
      </div>

      {/* Connected organizations list */}
      <div className="mt-3 space-y-1">
        {organizations.map((org) => (
          <div
            key={org.organizationSlug}
            className="flex items-center justify-between p-2 rounded-md bg-muted/50 text-sm gap-2"
          >
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-gray-700 dark:text-gray-300 font-medium truncate">
                {org.name || `Organization ${org.organizationSlug.slice(0, 8)}`}
              </span>
              {org.ownerEmail && (
                <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {org.ownerEmail}
                </span>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-muted-foreground hover:text-destructive shrink-0"
              onClick={() => handleDeleteOrganization(org.organizationSlug)}
              title="Desconectar organización"
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              <span className="text-xs">Desconectar</span>
            </Button>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <div className="flex items-center space-x-3">
          <Switch
            id="supabase-migrations"
            checked={!!settings?.enableSupabaseWriteSqlMigration}
            onCheckedChange={handleMigrationSettingChange}
          />
          <div className="space-y-1">
            <Label
              htmlFor="supabase-migrations"
              className="text-sm font-medium"
            >
              Escribir archivos de migración SQL
            </Label>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Genera archivos de migración SQL al modificar el esquema de
              Supabase. Esto te ayuda a rastrear los cambios de la base de datos
              en el control de versiones, aunque estos archivos no se usan para
              el contexto del chat, que usa el esquema en vivo.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-center space-x-3">
          <Switch
            id="skip-prune-edge-functions"
            checked={!!settings?.skipPruneEdgeFunctions}
            onCheckedChange={handleSkipPruneSettingChange}
          />
          <div className="space-y-1">
            <Label
              htmlFor="skip-prune-edge-functions"
              className="text-sm font-medium"
            >
              Mantener funciones de borde adicionales de Supabase
            </Label>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Cuando está desactivado, las funciones de borde desplegadas en
              Supabase pero no presentes en tu código se eliminarán
              automáticamente durante las operaciones de sincronización (por
              ejemplo, después de revertir o modificar módulos compartidos).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
