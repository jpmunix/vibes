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
import { ArrowLeft, TrendingUp, Zap, Clock, Sparkles } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { ChatCompletionNotificationSwitch } from "@/components/ChatCompletionNotificationSwitch";
import { tokenStatsClient } from "@/ipc/types";
import type { TokenStatEntry } from "@/ipc/types/token_stats";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmbeddingsPlayground } from "@/components/EmbeddingsPlayground";
import { AutoFixModelSelector } from "@/components/AutoFixModelSelector";

export default function SettingsPage() {
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isEmbeddingsPlaygroundOpen, setIsEmbeddingsPlaygroundOpen] =
    useState(false);
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
          <StatsSettings />

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

              <div className="space-y-1 mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <Label className="text-base font-medium">
                      Playground de Embeddings
                    </Label>
                    <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      Prueba el modelo MiniLM para búsqueda semántica en tu
                      codebase
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => setIsEmbeddingsPlaygroundOpen(true)}
                  >
                    Abrir Playground
                  </Button>
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

      {/* Embeddings Playground Dialog */}
      <EmbeddingsPlayground
        open={isEmbeddingsPlaygroundOpen}
        onOpenChange={setIsEmbeddingsPlaygroundOpen}
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

  const handleUpdateNumberSetting = async (
    field: "autoFixMaxDurationMs" | "autoFixMaxAttempts" | "autoFixMaxIssues",
    value: number,
    fallback: number,
  ) => {
    const parsed = Number.isFinite(value) && value > 0 ? value : fallback;
    await updateSettings({ [field]: parsed } as any);
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

      <div className="space-y-3 mt-4">
        <h3 className="text-sm font-medium text-gray-900 dark:text-white">
          Modelo y límites para auto-fix
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Estas llamadas se ejecutan en segundo plano. Usa un modelo barato y
          limita tiempo/intentos para evitar consumo excesivo.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <AutoFixModelSelector />
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              Tiempo máx. auto-fix (ms)
            </Label>
            <Input
              type="number"
              min={1}
              value={settings?.autoFixMaxDurationMs ?? 20000}
              onChange={(e) =>
                handleUpdateNumberSetting(
                  "autoFixMaxDurationMs",
                  Number(e.target.value),
                  20000,
                )
              }
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              Intentos máx. auto-fix
            </Label>
            <Input
              type="number"
              min={0}
              value={settings?.autoFixMaxAttempts ?? 1}
              onChange={(e) =>
                handleUpdateNumberSetting(
                  "autoFixMaxAttempts",
                  Number(e.target.value),
                  1,
                )
              }
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              Nº máx. de issues para auto-fix
            </Label>
            <Input
              type="number"
              min={1}
              value={settings?.autoFixMaxIssues ?? 5}
              onChange={(e) =>
                handleUpdateNumberSetting(
                  "autoFixMaxIssues",
                  Number(e.target.value),
                  5,
                )
              }
            />
          </div>
        </div>
      </div>

      <div className="space-y-1 mt-4">
        <AutoExpandPreviewSwitch />
        <div className="text-sm text-gray-500 dark:text-gray-400">
          Expande automáticamente el panel de vista previa cuando se realizan
          cambios en el código
        </div>
      </div>

      <div className="space-y-1 mt-4">
        <ChatCompletionNotificationSwitch />
        <div className="text-sm text-gray-500 dark:text-gray-400">
          Mostrar notificación nativa cuando termine una respuesta (si la
          ventana no está enfocada).
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
  const { settings, updateSettings } = useSettings();

  const handleToggle = async (
    field:
      | "enableLocalSmartContext"
      | "enableTokenStats"
      | "enableVerboseChatLogs",
    value: boolean,
  ) => {
    await updateSettings({ [field]: value } as any);
  };

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

      <div className="mt-6 space-y-3">
        <h3 className="text-sm font-medium text-gray-900 dark:text-white">
          Smart Context local
        </h3>
        <div className="flex items-center justify-between">
          <div className="space-y-1 pr-3">
            <p className="text-sm font-medium text-foreground">
              Ranking local (sin backend)
            </p>
            <p className="text-xs text-muted-foreground">
              Reduce el contexto eligiendo archivos relevantes según el prompt
              cuando no hay engine remoto.
            </p>
          </div>
          <Switch
            checked={settings?.enableLocalSmartContext !== false}
            onCheckedChange={(checked) =>
              handleToggle("enableLocalSmartContext", checked)
            }
          />
        </div>
        <div className="flex items-center justify-between">
          <div className="space-y-1 pr-3">
            <p className="text-sm font-medium text-foreground">
              Guardar métricas de tokens
            </p>
            <p className="text-xs text-muted-foreground">
              Guarda el uso de tokens por turno para mostrar logs y gráficas en
              Stats.
            </p>
          </div>
          <Switch
            checked={settings?.enableTokenStats !== false}
            onCheckedChange={(checked) =>
              handleToggle("enableTokenStats", checked)
            }
          />
        </div>
        <div className="flex items-center justify-between">
          <div className="space-y-1 pr-3">
            <p className="text-sm font-medium text-foreground">
              Logs verbosos de chat
            </p>
            <p className="text-xs text-muted-foreground">
              Registra información detallada del procesamiento interno del chat
              para debugging. Los logs se muestran en el panel del chat.
            </p>
          </div>
          <Switch
            checked={settings?.enableVerboseChatLogs === true}
            onCheckedChange={(checked) =>
              handleToggle("enableVerboseChatLogs", checked)
            }
          />
        </div>
      </div>
    </div>
  );
}

function StatsSettings() {
  const [entries, setEntries] = useState<TokenStatEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<TokenStatEntry | null>(
    null,
  );

  const load = async () => {
    setLoading(true);
    try {
      const data = await tokenStatsClient.getTokenStats();
      setEntries(data || []);
    } catch (error) {
      console.error("Failed to load token stats", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  // Calculate total stats
  const totalStats = entries.reduce(
    (acc, entry) => ({
      total: acc.total + entry.totalTokens,
      input: acc.input + (entry.promptTokens ?? 0),
      output: acc.output + (entry.completionTokens ?? 0),
    }),
    { total: 0, input: 0, output: 0 },
  );

  // Group by hour
  const hourlyStats = (() => {
    const stats = new Map<string, { tokens: number; count: number }>();
    entries.forEach((entry) => {
      const date = new Date(entry.timestamp);
      const hourKey = `${date.getHours()}:00`;
      if (!stats.has(hourKey)) {
        stats.set(hourKey, { tokens: 0, count: 0 });
      }
      const s = stats.get(hourKey)!;
      s.tokens += entry.totalTokens;
      s.count += 1;
    });
    return Array.from(stats.entries())
      .map(([hour, data]) => ({ hour, ...data }))
      .sort((a, b) => parseInt(a.hour) - parseInt(b.hour));
  })();

  const maxHourlyTokens = Math.max(...hourlyStats.map((h) => h.tokens), 1);

  // Group by model
  const modelStats = (() => {
    const stats = new Map<string, number>();
    entries.forEach((entry) => {
      const model = entry.model || "unknown";
      stats.set(model, (stats.get(model) || 0) + entry.totalTokens);
    });
    return Array.from(stats.entries())
      .map(([model, tokens]) => ({ model, tokens }))
      .sort((a, b) => b.tokens - a.tokens)
      .slice(0, 5);
  })();

  const maxModelTokens = Math.max(...modelStats.map((m) => m.tokens), 1);

  return (
    <div
      id="stats-settings"
      className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6"
    >
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Estadísticas Globales
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Uso de tokens en todos los chats
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const header = [
                "timestamp",
                "chatId",
                "messageId",
                "totalTokens",
                "promptTokens",
                "completionTokens",
                "model",
                "filesSent",
                "toolsUsed",
              ].join(",");
              const lines = entries.map((e) =>
                [
                  new Date(e.timestamp).toISOString(),
                  e.chatId,
                  e.messageId,
                  e.totalTokens,
                  e.promptTokens ?? "",
                  e.completionTokens ?? "",
                  e.model ?? "",
                  (e.filesSent || []).join("|"),
                  (e.toolsUsed || []).join("|"),
                ].join(","),
              );
              const csv = [header, ...lines].join("\n");
              const blob = new Blob([csv], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "token-stats.csv";
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            Exportar CSV
          </Button>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            {loading ? "Cargando..." : "Refrescar"}
          </Button>
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <TrendingUp
            className="text-gray-400 dark:text-gray-600 mb-3"
            size={48}
          />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Aún no hay datos.
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            Envía un mensaje para registrar tokens.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="text-blue-600 dark:text-blue-400" size={16} />
                <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                  Total
                </span>
              </div>
              <p className="text-3xl font-bold text-blue-900 dark:text-blue-100">
                {totalStats.total.toLocaleString()}
              </p>
              <p className="text-sm text-blue-600 dark:text-blue-400 mt-1">
                tokens en {entries.length} mensajes
              </p>
            </div>

            <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp
                  className="text-green-600 dark:text-green-400"
                  size={16}
                />
                <span className="text-sm font-medium text-green-700 dark:text-green-300">
                  Input
                </span>
              </div>
              <p className="text-3xl font-bold text-green-900 dark:text-green-100">
                {totalStats.input.toLocaleString()}
              </p>
              <p className="text-sm text-green-600 dark:text-green-400 mt-1">
                tokens de entrada
              </p>
            </div>

            <div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 rounded-lg p-4 border border-purple-200 dark:border-purple-800">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp
                  className="text-purple-600 dark:text-purple-400"
                  size={16}
                />
                <span className="text-sm font-medium text-purple-700 dark:text-purple-300">
                  Output
                </span>
              </div>
              <p className="text-3xl font-bold text-purple-900 dark:text-purple-100">
                {totalStats.output.toLocaleString()}
              </p>
              <p className="text-sm text-purple-600 dark:text-purple-400 mt-1">
                tokens de salida
              </p>
            </div>
          </div>

          {/* Hourly Chart */}
          {hourlyStats.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2 mb-4">
                <Clock className="text-gray-600 dark:text-gray-400" size={18} />
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                  Uso por Hora
                </h3>
              </div>
              <div className="space-y-2">
                {hourlyStats.map((stat) => (
                  <div key={stat.hour} className="flex items-center gap-3">
                    <span className="text-sm font-mono text-gray-600 dark:text-gray-400 w-14">
                      {stat.hour}
                    </span>
                    <div className="flex-1 h-8 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-300 flex items-center justify-end pr-3"
                        style={{
                          width: `${(stat.tokens / maxHourlyTokens) * 100}%`,
                        }}
                      >
                        {stat.tokens > maxHourlyTokens * 0.3 && (
                          <span className="text-xs font-semibold text-white">
                            {stat.tokens.toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>
                    {stat.tokens <= maxHourlyTokens * 0.3 && (
                      <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 w-24 text-right">
                        {stat.tokens.toLocaleString()}
                      </span>
                    )}
                    <span className="text-sm text-gray-500 dark:text-gray-400 w-20 text-right">
                      {stat.count} msgs
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top Models */}
          {modelStats.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2 mb-4">
                <Sparkles
                  className="text-gray-600 dark:text-gray-400"
                  size={18}
                />
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                  Top Modelos
                </h3>
              </div>
              <div className="space-y-2">
                {modelStats.map((stat, idx) => (
                  <div key={stat.model} className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-gray-500 dark:text-gray-400 w-6">
                      #{idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                        {stat.model}
                      </div>
                      <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden mt-1">
                        <div
                          className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-300"
                          style={{
                            width: `${(stat.tokens / maxModelTokens) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 w-28 text-right">
                      {stat.tokens.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent Activity */}
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-3">
              Actividad Reciente
            </h3>
            <div className="space-y-2">
              {entries.slice(0, 10).map((entry) => (
                <button
                  key={`${entry.timestamp}-${entry.messageId}`}
                  onClick={() => setSelectedEntry(entry)}
                  className="w-full text-left p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors border border-transparent hover:border-gray-200 dark:hover:border-gray-600"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-mono text-gray-600 dark:text-gray-400">
                      Chat #{entry.chatId} · Mensaje {entry.messageId}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {formatDistanceToNow(new Date(entry.timestamp), {
                        addSuffix: true,
                        locale: es,
                      })}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full"
                        style={{
                          width: `${(entry.totalTokens / Math.max(...entries.map((e) => e.totalTokens))) * 100}%`,
                        }}
                      />
                    </div>
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                      {entry.totalTokens.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {entry.model || "unknown"}
                    </span>
                    {entry.promptTokens && entry.completionTokens && (
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {entry.promptTokens.toLocaleString()} in ·{" "}
                        {entry.completionTokens.toLocaleString()} out
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Details Dialog */}
      <Dialog
        open={!!selectedEntry}
        onOpenChange={() => setSelectedEntry(null)}
      >
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalles del Token Stat</DialogTitle>
          </DialogHeader>
          {selectedEntry && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Chat ID
                  </label>
                  <p className="text-sm text-gray-900 dark:text-gray-100 mt-1">
                    #{selectedEntry.chatId}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Message ID
                  </label>
                  <p className="text-sm text-gray-900 dark:text-gray-100 mt-1">
                    {selectedEntry.messageId}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Total Tokens
                  </label>
                  <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">
                    {selectedEntry.totalTokens.toLocaleString()}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Input Tokens
                  </label>
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">
                    {selectedEntry.promptTokens?.toLocaleString() ?? "?"}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Output Tokens
                  </label>
                  <p className="text-2xl font-bold text-purple-600 dark:text-purple-400 mt-1">
                    {selectedEntry.completionTokens?.toLocaleString() ?? "?"}
                  </p>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Modelo
                </label>
                <p className="text-sm text-gray-900 dark:text-gray-100 mt-1">
                  {selectedEntry.model || "unknown"}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Timestamp
                </label>
                <p className="text-sm text-gray-900 dark:text-gray-100 mt-1">
                  {new Date(selectedEntry.timestamp).toLocaleString()}
                </p>
              </div>
              {selectedEntry.filesSent &&
                selectedEntry.filesSent.length > 0 && (
                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Archivos Enviados ({selectedEntry.filesSent.length})
                    </label>
                    <pre className="text-xs bg-gray-100 dark:bg-gray-800 p-3 rounded mt-2 overflow-x-auto max-h-40">
                      {selectedEntry.filesSent.join("\n")}
                    </pre>
                  </div>
                )}
              {selectedEntry.toolsUsed &&
                selectedEntry.toolsUsed.length > 0 && (
                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Herramientas Usadas
                    </label>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {selectedEntry.toolsUsed.map((tool) => (
                        <span
                          key={tool}
                          className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                        >
                          {tool}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
