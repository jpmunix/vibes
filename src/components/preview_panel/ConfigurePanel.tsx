import { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import {
  Trash2,
  Edit2,
  Plus,
  Save,
  X,
  HelpCircle,
  ArrowRight,
  Terminal,
} from "lucide-react";
import { showError, showSuccess } from "@/lib/toast";
import { selectedAppIdAtom, currentAppAtom } from "@/atoms/appAtoms";
import { ipc } from "@/ipc/types";
import { useNavigate } from "@tanstack/react-router";
import { NeonConfigure } from "./NeonConfigure";
import { queryKeys } from "@/lib/queryKeys";

const EnvironmentVariablesTitle = () => (
  <div className="flex items-center gap-2">
    <span className="text-lg font-semibold">Variables de entorno</span>
    <span className="text-sm text-muted-foreground font-normal">Local</span>
    <Tooltip>
      <TooltipTrigger asChild>
        <HelpCircle size={16} className="text-muted-foreground cursor-help" />
      </TooltipTrigger>
      <TooltipContent>
        <p>
          Para modificar las variables de entorno para Supabase o producción,
          <br />
          accede a la consola de tu proveedor de hosting y actualízalas allí.
        </p>
      </TooltipContent>
    </Tooltip>
  </div>
);

export const ConfigurePanel = () => {
  const selectedAppId = useAtomValue(selectedAppIdAtom);
  const currentApp = useAtomValue(currentAppAtom);
  const queryClient = useQueryClient();

  // Startup commands state
  const [installCmd, setInstallCmd] = useState("");
  const [startCmd, setStartCmd] = useState("");
  const [commandsDirty, setCommandsDirty] = useState(false);

  // Load current commands from app data
  useEffect(() => {
    if (currentApp) {
      setInstallCmd(currentApp.installCommand ?? "");
      setStartCmd(currentApp.startCommand ?? "");
      setCommandsDirty(false);
    }
  }, [currentApp?.id, currentApp?.installCommand, currentApp?.startCommand]);

  // Mutation to save commands
  const saveCommandsMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAppId) throw new Error("No app selected");
      return await ipc.app.updateAppCommands({
        appId: selectedAppId,
        installCommand: installCmd.trim() || null,
        startCommand: startCmd.trim() || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["app", selectedAppId],
      });
      showSuccess("Comandos de arranque guardados");
      setCommandsDirty(false);
    },
    onError: (error) => {
      showError(`Error al guardar los comandos: ${error}`);
    },
  });

  const handleInstallCmdChange = useCallback(
    (value: string) => {
      setInstallCmd(value);
      setCommandsDirty(true);
    },
    [],
  );

  const handleStartCmdChange = useCallback(
    (value: string) => {
      setStartCmd(value);
      setCommandsDirty(true);
    },
    [],
  );

  const handleSaveCommands = useCallback(() => {
    saveCommandsMutation.mutate();
  }, [saveCommandsMutation]);

  const handleResetCommands = useCallback(() => {
    setInstallCmd("");
    setStartCmd("");
    setCommandsDirty(true);
  }, []);

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingKeyValue, setEditingKeyValue] = useState("");
  const [editingValue, setEditingValue] = useState("");
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [isAddingNew, setIsAddingNew] = useState(false);
  const navigate = useNavigate();

  // Query to get environment variables
  const {
    data: envVars = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: queryKeys.appEnvVars.byApp({ appId: selectedAppId }),
    queryFn: async () => {
      if (!selectedAppId) return [];
      return await ipc.misc.getAppEnvVars({ appId: selectedAppId });
    },
    enabled: !!selectedAppId,
  });

  // Mutation to save environment variables
  const saveEnvVarsMutation = useMutation({
    mutationFn: async (newEnvVars: { key: string; value: string }[]) => {
      if (!selectedAppId) throw new Error("No app selected");
      return await ipc.misc.setAppEnvVars({
        appId: selectedAppId,
        envVars: newEnvVars,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.appEnvVars.byApp({ appId: selectedAppId }),
      });
      showSuccess("Variables de entorno guardadas");
    },
    onError: (error) => {
      showError(`Error al guardar las variables de entorno: ${error}`);
    },
  });

  const handleAdd = useCallback(() => {
    if (!newKey.trim() || !newValue.trim()) {
      showError("Both key and value are required");
      return;
    }

    // Check for duplicate keys
    if (envVars.some((envVar) => envVar.key === newKey.trim())) {
      showError("Environment variable with this key already exists");
      return;
    }

    const newEnvVars = [
      ...envVars,
      { key: newKey.trim(), value: newValue.trim() },
    ];
    saveEnvVarsMutation.mutate(newEnvVars);
    setNewKey("");
    setNewValue("");
    setIsAddingNew(false);
  }, [newKey, newValue, envVars, saveEnvVarsMutation]);

  const handleEdit = useCallback((envVar: { key: string; value: string }) => {
    setEditingKey(envVar.key);
    setEditingKeyValue(envVar.key);
    setEditingValue(envVar.value);
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (!editingKeyValue.trim() || !editingValue.trim()) {
      showError("Both key and value are required");
      return;
    }

    // Check for duplicate keys (excluding the current one being edited)
    if (
      envVars.some(
        (envVar) =>
          envVar.key === editingKeyValue.trim() && envVar.key !== editingKey,
      )
    ) {
      showError("Environment variable with this key already exists");
      return;
    }

    const newEnvVars = envVars.map((envVar) =>
      envVar.key === editingKey
        ? { key: editingKeyValue.trim(), value: editingValue.trim() }
        : envVar,
    );
    saveEnvVarsMutation.mutate(newEnvVars);
    setEditingKey(null);
    setEditingKeyValue("");
    setEditingValue("");
  }, [editingKey, editingKeyValue, editingValue, envVars, saveEnvVarsMutation]);

  const handleCancelEdit = useCallback(() => {
    setEditingKey(null);
    setEditingKeyValue("");
    setEditingValue("");
  }, []);

  const handleDelete = useCallback(
    (key: string) => {
      const newEnvVars = envVars.filter((envVar) => envVar.key !== key);
      saveEnvVarsMutation.mutate(newEnvVars);
    },
    [envVars, saveEnvVarsMutation],
  );

  const handleCancelAdd = useCallback(() => {
    setIsAddingNew(false);
    setNewKey("");
    setNewValue("");
  }, []);

  // Show loading state
  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>
              <EnvironmentVariablesTitle />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8">
              <div className="text-sm text-muted-foreground">
                Cargando variables de entorno...
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="p-4 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>
              <EnvironmentVariablesTitle />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8">
              <div className="text-sm text-red-500">
                Error al cargar las variables de entorno: {error.message}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show no app selected state
  if (!selectedAppId) {
    return (
      <div className="p-4 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>
              <EnvironmentVariablesTitle />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8">
              <div className="text-sm text-muted-foreground">
                Selecciona una aplicación para gestionar las variables de
                entorno
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Startup Commands Card */}
      <Card>
        <CardHeader>
          <CardTitle>
            <div className="flex items-center gap-2">
              <Terminal size={18} />
              <span className="text-lg font-semibold">Comandos de arranque</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle size={16} className="text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p>
                    Personaliza los comandos de instalación e inicio.
                    <br />
                    Si se dejan vacíos, se usarán los comandos por defecto de Vite.
                  </p>
                </TooltipContent>
              </Tooltip>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="install-command">Comando de instalación</Label>
            <Input
              id="install-command"
              placeholder="npm install --legacy-peer-deps"
              value={installCmd}
              onChange={(e) => handleInstallCmdChange(e.target.value)}
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="start-command">Comando de inicio</Label>
            <Input
              id="start-command"
              placeholder="npm run dev -- --port {port}"
              value={startCmd}
              onChange={(e) => handleStartCmdChange(e.target.value)}
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              Usa <code className="bg-muted px-1 rounded">{"{port}"}</code> como
              marcador para el puerto asignado. Ej:{" "}
              <code className="bg-muted px-1 rounded">
                PORT={"{port}"} npm run dev
              </code>
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={handleSaveCommands}
              size="sm"
              disabled={!commandsDirty || saveCommandsMutation.isPending}
            >
              <Save size={14} />
              {saveCommandsMutation.isPending ? "Guardando..." : "Guardar"}
            </Button>
            {(installCmd || startCmd) && (
              <Button
                onClick={handleResetCommands}
                variant="outline"
                size="sm"
              >
                <X size={14} />
                Usar por defecto
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <EnvironmentVariablesTitle />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add new environment variable form */}
          {isAddingNew ? (
            <div className="space-y-3 p-3 border rounded-md bg-muted/50">
              <div className="space-y-2">
                <Label htmlFor="new-key">Clave</Label>
                <Input
                  id="new-key"
                  placeholder="e.g., API_URL"
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-value">Valor</Label>
                <Input
                  id="new-value"
                  placeholder="e.g., https://api.example.com"
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleAdd}
                  size="sm"
                  disabled={saveEnvVarsMutation.isPending}
                >
                  <Save size={14} />
                  {saveEnvVarsMutation.isPending ? "Guardando..." : "Guardar"}
                </Button>
                <Button onClick={handleCancelAdd} variant="outline" size="sm">
                  <X size={14} />
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <Button
              onClick={() => setIsAddingNew(true)}
              variant="outline"
              className="w-full"
            >
              <Plus size={14} />
              Añadir variable de entorno
            </Button>
          )}

          {/* List of existing environment variables */}
          <div className="space-y-2">
            {envVars.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No hay variables de entorno configuradas
              </p>
            ) : (
              envVars.map((envVar) => (
                <div
                  key={envVar.key}
                  className="flex items-center space-x-2 p-2 border rounded-md"
                >
                  {editingKey === envVar.key ? (
                    <>
                      <div className="flex-1 space-y-2">
                        <Input
                          value={editingKeyValue}
                          onChange={(e) => setEditingKeyValue(e.target.value)}
                          placeholder="Clave"
                          className="h-8"
                        />
                        <Input
                          value={editingValue}
                          onChange={(e) => setEditingValue(e.target.value)}
                          placeholder="Valor"
                          className="h-8"
                        />
                      </div>
                      <div className="flex gap-1">
                        <Button
                          data-testid={`save-edit-env-var`}
                          onClick={handleSaveEdit}
                          size="sm"
                          variant="outline"
                          disabled={saveEnvVarsMutation.isPending}
                        >
                          <Save size={14} />
                        </Button>
                        <Button
                          data-testid={`cancel-edit-env-var`}
                          onClick={handleCancelEdit}
                          size="sm"
                          variant="outline"
                        >
                          <X size={14} />
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">
                          {envVar.key}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {envVar.value}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          data-testid={`edit-env-var-${envVar.key}`}
                          onClick={() => handleEdit(envVar)}
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0"
                        >
                          <Edit2 size={14} />
                        </Button>
                        <Button
                          data-testid={`delete-env-var-${envVar.key}`}
                          onClick={() => handleDelete(envVar.key)}
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                          disabled={saveEnvVarsMutation.isPending}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              ))
            )}
          </div>

          {/* More app configurations button */}
          <div className="pt-4 border-t">
            <Button
              variant="outline"
              className="w-full text-sm justify-between"
              onClick={() => {
                if (selectedAppId) {
                  navigate({
                    to: "/app-details",
                    search: { appId: selectedAppId },
                  });
                }
              }}
            >
              <span>Más ajustes de la aplicación</span>
              <ArrowRight size={16} />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Neon Database Configuration */}
      {/* Neon Connector */}
      <div className="grid grid-cols-1 gap-6">
        <NeonConfigure />
      </div>
    </div>
  );
};
