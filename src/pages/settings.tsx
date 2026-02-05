import { useEffect, useState } from "react";
import { useTheme } from "../contexts/ThemeContext";
import { ProviderSettingsGrid } from "@/components/ProviderSettings";
import ConfirmationDialog from "@/components/ConfirmationDialog";
import { ipc } from "@/ipc/types";
import { showSuccess, showError } from "@/lib/toast";
import { AutoApproveSwitch } from "@/components/AutoApproveSwitch";
import { MaxChatTurnsSelector } from "@/components/MaxChatTurnsSelector";
import { ThinkingBudgetSelector } from "@/components/ThinkingBudgetSelector";
import { useSettings } from "@/hooks/useSettings";
import { useAppVersion } from "@/hooks/useAppVersion";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "@tanstack/react-router";
import { GitHubIntegration } from "@/components/GitHubIntegration";
import { VercelIntegration } from "@/components/VercelIntegration";
import { SupabaseIntegration } from "@/components/SupabaseIntegration";

import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { AutoExpandPreviewSwitch } from "@/components/AutoExpandPreviewSwitch";
import { NeonIntegration } from "@/components/NeonIntegration";
import { AgentToolsSettings } from "@/components/settings/AgentToolsSettings";
import { ZoomSelector } from "@/components/ZoomSelector";
import { DefaultChatModeSelector } from "@/components/DefaultChatModeSelector";
import { useSetAtom } from "jotai";
import { activeSettingsSectionAtom } from "@/atoms/viewAtoms";
import { ChatLanguageSelector } from "@/components/ChatLanguageSelector";
import { SerperApiKeySettings } from "@/components/SerperApiKeySettings";

export default function SettingsPage() {
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const appVersion = useAppVersion();
  const { settings, updateSettings } = useSettings();
  const router = useRouter();
  const setActiveSettingsSection = useSetAtom(activeSettingsSectionAtom);

  useEffect(() => {
    setActiveSettingsSection("general-settings");
  }, [setActiveSettingsSection]);

  const handleResetEverything = async () => {
    setIsResetting(true);
    try {
      await ipc.system.resetAll();
      showSuccess(
        "Se ha reseteado todo correctamente. Reinicia la aplicación.",
      );
    } catch (error) {
      console.error("Error resetting:", error);
      showError(
        error instanceof Error ? error.message : "Ocurrió un error desconocido",
      );
    } finally {
      setIsResetting(false);
      setIsResetDialogOpen(false);
    }
  };

  return (
    <div className="min-h-screen px-8 py-4">
      <div className="max-w-5xl mx-auto">
        <Button
          onClick={() => router.history.back()}
          variant="outline"
          size="sm"
          className="flex items-center gap-2 mb-4 bg-(--background-lightest) py-5"
        >
          <ArrowLeft className="h-4 w-4" />
          Atrás
        </Button>
        <div className="flex justify-between mb-4">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Ajustes
          </h1>
        </div>

        <div className="space-y-6">
          <GeneralSettings appVersion={appVersion} />
          <WorkflowSettings />
          <AISettings />

          <div
            id="provider-settings"
            className="bg-white dark:bg-gray-800 rounded-xl shadow-sm"
          >
            <ProviderSettingsGrid />
          </div>

          {/* Integrations Section */}
          <div
            id="integrations"
            className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6"
          >
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
              Integraciones
            </h2>
            <div className="space-y-4">
              <GitHubIntegration />
              <VercelIntegration />
              <SupabaseIntegration />
              <NeonIntegration />
            </div>
          </div>

          {/* Agent v2 Permissions */}

          <div
            id="agent-permissions"
            className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6"
          >
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
              Permisos del Agente
            </h2>
            <AgentToolsSettings />
          </div>

          {/* Experiments Section */}
          <div
            id="experiments"
            className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6"
          >
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
              Experimentos
            </h2>
            <div className="space-y-4">
              <div className="space-y-1 mt-4">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="enable-native-git"
                    checked={!!settings?.enableNativeGit}
                    onCheckedChange={(checked) => {
                      updateSettings({
                        enableNativeGit: checked,
                      });
                    }}
                  />
                  <Label htmlFor="enable-native-git">
                    Habilitar Git nativo
                  </Label>
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  Esto no requiere ninguna instalación externa de Git y ofrece
                  una experiencia de rendimiento Git nativa más rápida.
                </div>
              </div>
            </div>
          </div>

          {/* Danger Zone */}
          <div
            id="danger-zone"
            className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 border border-red-200 dark:border-red-800"
          >
            <h2 className="text-lg font-medium text-red-600 dark:text-red-400 mb-4">
              Zona peligrosa
            </h2>

            <div className="space-y-4">
              <div className="flex items-start justify-between flex-col sm:flex-row sm:items-center gap-4">
                <div>
                  <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                    Revertir todo
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Esto eliminará todas tus aplicaciones, chats y
                    configuraciones. Esta acción no se puede deshacer.
                  </p>
                </div>
                <button
                  onClick={() => setIsResetDialogOpen(true)}
                  disabled={isResetting}
                  className="rounded-md border border-transparent bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isResetting ? "Reseteando..." : "Resetear todo"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <ConfirmationDialog
        isOpen={isResetDialogOpen}
        title="Resetear todo"
        message="¿Estás seguro de que quieres resetear todo? Esto eliminará todas tus aplicaciones, chats y configuraciones. Esta acción no se puede deshacer."
        confirmText="Resetear todo"
        cancelText="Cancelar"
        onConfirm={handleResetEverything}
        onCancel={() => setIsResetDialogOpen(false)}
      />
    </div>
  );
}

export function GeneralSettings({ appVersion }: { appVersion: string | null }) {
  const { theme, setTheme } = useTheme();

  return (
    <div
      id="general-settings"
      className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6"
    >
      <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
        Ajustes generales
      </h2>

      <div className="space-y-4 mb-4">
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Tema
          </label>

          <div className="relative bg-gray-100 dark:bg-gray-700 rounded-lg p-1 flex">
            {(["system", "light", "dark"] as const).map((option) => (
              <button
                key={option}
                onClick={() => setTheme(option)}
                className={`
                px-4 py-1.5 text-sm font-medium rounded-md
                transition-all duration-200
                ${
                  theme === option
                    ? "bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm"
                    : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                }
              `}
              >
                {option === "system"
                  ? "Sistema"
                  : option === "light"
                    ? "Claro"
                    : "Oscuro"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4">
        <ZoomSelector />
      </div>

      <div className="flex items-center text-sm text-gray-500 dark:text-gray-400 mt-4">
        <span className="mr-2 font-medium">Versión de la aplicación:</span>
        <span className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-gray-800 dark:text-gray-200 font-mono">
          {appVersion ? appVersion : "-"}
        </span>
      </div>
    </div>
  );
}

export function WorkflowSettings() {
  const { settings, updateSettings } = useSettings();

  const handleToggleBackgroundProblemFix = async (value: boolean) => {
    await updateSettings({
      enableBackgroundProblemAutoFix: value,
    });
  };

  return (
    <div
      id="workflow-settings"
      className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6"
    >
      <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
        Configuración del flujo de trabajo
      </h2>

      <div className="mt-4">
        <DefaultChatModeSelector />
      </div>

      <div className="space-y-1 mt-4">
        <AutoApproveSwitch showToast={false} />
        <div className="text-sm text-gray-500 dark:text-gray-400">
          Aprobará automáticamente los cambios de código y los ejecutará
        </div>
      </div>

      <div className="space-y-1 mt-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">
              Auto-fix de problemas en segundo plano
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Si está desactivado, aunque se detecten problemas no se gastará
              tiempo arreglándolos mientras trabajas en otras tareas.
            </p>
          </div>
          <Switch
            checked={settings?.enableBackgroundProblemAutoFix ?? false}
            onCheckedChange={handleToggleBackgroundProblemFix}
          />
        </div>
      </div>

      <div className="space-y-1 mt-4">
        <AutoExpandPreviewSwitch />
        <div className="text-sm text-gray-500 dark:text-gray-400">
          Expande automáticamente el panel de vista previa cuando se realizan
          cambios en el código
        </div>
      </div>
    </div>
  );
}

function TurboEditsV2Switch() {
  const { settings, updateSettings } = useSettings();
  const [saving, setSaving] = useState(false);
  const isEnabled = settings?.enableTurboEditsV2 ?? true;

  const handleToggle = async (value: boolean) => {
    setSaving(true);
    try {
      await updateSettings({ enableTurboEditsV2: value });
    } catch (error) {
      showError(
        error instanceof Error
          ? error.message
          : "No se pudo actualizar Turbo Edits",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white">
            Turbo Edits (v2)
          </h3>
          <span className="text-[10px] leading-none uppercase tracking-wide rounded-sm bg-blue-500/15 text-blue-700 dark:text-blue-300 px-2 py-0.5 border border-blue-500/25">
            Beta
          </span>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Activa o desactiva el modo de búsqueda y reemplazo automático que
          intenta arreglar cambios fallidos antes de escribir los archivos.
        </p>
      </div>
      <Switch
        checked={isEnabled}
        onCheckedChange={handleToggle}
        disabled={saving}
        aria-label="Activar Turbo Edits"
      />
    </div>
  );
}

export function AISettings() {
  return (
    <div
      id="ai-settings"
      className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6"
    >
      <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
        Ajustes IA
      </h2>

      <div className="mt-4">
        <ThinkingBudgetSelector />
      </div>

      <div className="mt-4">
        <TurboEditsV2Switch />
      </div>

      <div className="mt-4">
        <MaxChatTurnsSelector />
      </div>

      <div className="mt-4">
        <ChatLanguageSelector />
      </div>

      <div className="mt-4">
        <SerperApiKeySettings />
      </div>
    </div>
  );
}
