import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Globe, Loader2 } from "@/components/ui/icons";
import { Badge } from "@/components/ui/badge";
import { ipc, App } from "@/ipc/types";
import { useSettings } from "@/hooks/useSettings";
import { useLoadApp } from "@/hooks/useLoadApp";
import { useVercelDeployments } from "@/hooks/useVercelDeployments";
import { UnifiedSelector } from "@/components/ui/UnifiedSelector";
import { } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface VercelConnectorProps {
  appId: number | null;
  folderName: string;
}

interface VercelProject {
  id: string;
  name: string;
  framework?: string | null;
}

interface ConnectedVercelConnectorProps {
  appId: number;
  app: App;
  refreshApp: () => void;
}

interface UnconnectedVercelConnectorProps {
  appId: number | null;
  folderName: string;
  settings: any;
  refreshSettings: () => void;
  refreshApp: () => void;
}

function ConnectedVercelConnector({
  appId,
  app,
  refreshApp,
}: ConnectedVercelConnectorProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const {
    deployments,
    isLoading: isLoadingDeployments,
    error: deploymentsError,
    getDeployments,
    disconnectProject,
    isDisconnecting,
    disconnectError,
  } = useVercelDeployments(appId);

  const handleGetDeployments = async () => {
    setIsRefreshing(true);
    try {
      const minLoadingTime = new Promise((resolve) => setTimeout(resolve, 750));
      await Promise.all([getDeployments(), minLoadingTime]);
      // Refresh app data to get the updated deployment URL
      refreshApp();
    } finally {
      setIsRefreshing(false);
    }
  };

  const isLoadingOrRefreshing = isLoadingDeployments || isRefreshing;

  const handleDisconnectProject = async () => {
    await disconnectProject();
    refreshApp();
  };

  return (
    <div
      className="mt-4 w-full rounded-md"
      data-testid="vercel-connected-project"
    >
      <p className="typo-caption">
        Conectado al proyecto de Vercel:
      </p>
      <a
        onClick={(e) => {
          e.preventDefault();
          ipc.system.openExternalUrl(
            `https://vercel.com/${app.vercelTeamSlug}/${app.vercelProjectName}`,
          );
        }}
        className="cursor-pointer text-primary hover:underline"
        target="_blank"
        rel="noopener noreferrer"
      >
        {app.vercelProjectName}
      </a>
      {app.vercelDeploymentUrl && (
        <div className="mt-2">
          <p className="typo-caption">
            URL en vivo:{" "}
            <a
              onClick={(e) => {
                e.preventDefault();
                if (app.vercelDeploymentUrl) {
                  ipc.system.openExternalUrl(app.vercelDeploymentUrl);
                }
              }}
              className="cursor-pointer text-primary hover:underline font-mono"
              target="_blank"
              rel="noopener noreferrer"
            >
              {app.vercelDeploymentUrl}
            </a>
          </p>
        </div>
      )}
      <div className="mt-2 flex gap-2">
        <Button onClick={handleGetDeployments} disabled={isLoadingOrRefreshing} variant="outline">
          {isLoadingOrRefreshing ? (
            <>
              <Loader2 className="animate-spin h-5 w-5 mr-2 inline" />
              Refrescando...
            </>
          ) : (
            "Refrescar despliegues"
          )}
        </Button>
        <Button
          onClick={handleDisconnectProject}
          disabled={isDisconnecting}
          variant="outline"
        >
          {isDisconnecting ? "Desconectando..." : "Desconectar del proyecto"}
        </Button>
      </div>
      {deploymentsError && (
        <div className="mt-2">
          <p className="text-destructive">{deploymentsError}</p>
        </div>
      )}
      {deployments.length > 0 && (
        <div className="mt-4">
          <h4 className="font-medium mb-2">Despliegues recientes:</h4>
          <div className="space-y-2">
            {deployments.map((deployment) => (
              <div
                key={deployment.uid}
                className="bg-muted rounded-md p-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        deployment.readyState === "READY"
                          ? "default"
                          : deployment.readyState === "BUILDING"
                            ? "secondary"
                            : deployment.readyState === "ERROR"
                              ? "destructive"
                              : "outline"
                      }
                      className="rounded-full"
                    >
                      {deployment.readyState}
                    </Badge>
                    <span className="typo-caption">
                      {new Date(deployment.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <a
                    onClick={(e) => {
                      e.preventDefault();
                      ipc.system.openExternalUrl(`https://${deployment.url}`);
                    }}
                    className="cursor-pointer text-primary hover:underline text-sm"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Globe className="h-4 w-4 inline mr-1" />
                    Ver
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {disconnectError && (
        <p className="text-destructive mt-2">{disconnectError}</p>
      )}
    </div>
  );
}

function UnconnectedVercelConnector({
  appId,
  folderName,
  settings,
  refreshSettings,
  refreshApp,
}: UnconnectedVercelConnectorProps) {
  // --- Manual Token Entry State ---
  const [accessToken, setAccessToken] = useState("");
  const [isSavingToken, setIsSavingToken] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [tokenSuccess, setTokenSuccess] = useState(false);

  // --- Project Setup State ---
  const [projectSetupMode, setProjectSetupMode] = useState<
    "create" | "existing"
  >("create");
  const [availableProjects, setAvailableProjects] = useState<VercelProject[]>(
    [],
  );
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [selectedProject, setSelectedProject] = useState<string>("");

  // Create new project state
  const [projectName, setProjectName] = useState(folderName);
  const [projectAvailable, setProjectAvailable] = useState<boolean | null>(
    null,
  );
  const [projectCheckError, setProjectCheckError] = useState<string | null>(
    null,
  );
  const [isCheckingProject, setIsCheckingProject] = useState(false);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [createProjectError, setCreateProjectError] = useState<string | null>(
    null,
  );
  const [createProjectSuccess, setCreateProjectSuccess] =
    useState<boolean>(false);

  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load available projects when Vercel is connected
  useEffect(() => {
    if (settings?.vercelAccessToken && projectSetupMode === "existing") {
      loadAvailableProjects();
    }
  }, [settings?.vercelAccessToken, projectSetupMode]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);

  const loadAvailableProjects = async () => {
    setIsLoadingProjects(true);
    try {
      const projects = await ipc.vercel.listProjects();
      setAvailableProjects(projects);
    } catch (error) {
      console.error("Failed to load Vercel projects:", error);
    } finally {
      setIsLoadingProjects(false);
    }
  };

  const handleSaveAccessToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken.trim()) return;

    setIsSavingToken(true);
    setTokenError(null);
    setTokenSuccess(false);

    try {
      await ipc.vercel.saveToken({
        token: accessToken.trim(),
      });
      setTokenSuccess(true);
      setAccessToken("");
      refreshSettings();
    } catch (err: any) {
      setTokenError(err.message || "Failed to save access token.");
    } finally {
      setIsSavingToken(false);
    }
  };

  const checkProjectAvailability = useCallback(async (name: string) => {
    setProjectCheckError(null);
    setProjectAvailable(null);
    if (!name) return;
    setIsCheckingProject(true);
    try {
      const result = await ipc.vercel.isProjectAvailable({
        name,
      });
      setProjectAvailable(result.available);
      if (!result.available) {
        setProjectCheckError(result.error || "Project name is not available.");
      }
    } catch (err: any) {
      setProjectCheckError(
        err.message || "Failed to check project availability.",
      );
    } finally {
      setIsCheckingProject(false);
    }
  }, []);

  const debouncedCheckProjectAvailability = useCallback(
    (name: string) => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
      debounceTimeoutRef.current = setTimeout(() => {
        checkProjectAvailability(name);
      }, 500);
    },
    [checkProjectAvailability],
  );

  const handleSetupProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appId) return;

    setCreateProjectError(null);
    setIsCreatingProject(true);
    setCreateProjectSuccess(false);

    try {
      if (projectSetupMode === "create") {
        await ipc.vercel.createProject({
          name: projectName,
          appId,
        });
      } else {
        await ipc.vercel.connectExistingProject({
          projectId: selectedProject,
          appId,
        });
      }
      setCreateProjectSuccess(true);
      setProjectCheckError(null);
      refreshApp();
    } catch (err: any) {
      setCreateProjectError(
        err.message ||
        `Error al ${projectSetupMode === "create" ? "crear" : "conectar al"} proyecto.`,
      );
    } finally {
      setIsCreatingProject(false);
    }
  };

  if (!settings?.vercelAccessToken) {
    return (
      <div className="mt-1 w-full" data-testid="vercel-unconnected-project">
        <div className="w-ful">
          <div className="flex items-center gap-2 mb-4">
            <h3 className="font-medium">Conectar a Vercel</h3>
          </div>

          <div className="space-y-4">
            <div className="bg-primary/5 border border-primary/20 rounded-md p-3">
              <p className="text-sm text-foreground mb-2">
                Para conectar tu app a Vercel, deberás crear un token de acceso:
              </p>
              <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-1">
                <li>Si no tienes una cuenta de Vercel, regístrate primero</li>
                <li>Ve a los ajustes de Vercel para crear un token</li>
                <li>Copia el token y pégalo a continuación</li>
              </ol>

              <div className="flex gap-2 mt-3">
                <Button
                  onClick={() => {
                    ipc.system.openExternalUrl("https://vercel.com/signup");
                  }}
                  variant="outline"
                  className="flex-1"
                >
                  Registrarse en Vercel
                </Button>
                <Button
                  onClick={() => {
                    ipc.system.openExternalUrl(
                      "https://vercel.com/account/settings/tokens",
                    );
                  }}
                  className="flex-1"
                >
                  Abrir ajustes de Vercel
                </Button>
              </div>
            </div>

            <form onSubmit={handleSaveAccessToken} className="space-y-3">
              <div>
                <Label className="block text-sm font-medium mb-1">
                  Token de acceso de Vercel
                </Label>
                <Input
                  type="password"
                  placeholder="Introduce tu token de acceso de Vercel"
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  disabled={isSavingToken}
                  className="w-full"
                />
              </div>

              <Button
                type="submit"
                disabled={!accessToken.trim() || isSavingToken}
                className="w-full"
              >
                {isSavingToken ? (
                  <>
                    <Loader2 className="animate-spin h-4 w-4 mr-2" />
                    Guardando token...
                  </>
                ) : (
                  "Guardar token de acceso"
                )}
              </Button>
            </form>

            {tokenError && (
              <div className="bg-destructive/5 border border-destructive/20 rounded-md p-3">
                <p className="text-sm text-destructive">
                  {tokenError}
                </p>
              </div>
            )}

            {tokenSuccess && (
              <div className="bg-primary/5 border border-primary/20 rounded-md p-3">
                <p className="text-sm text-primary">
                  ¡Conectado a Vercel con éxito! Ahora puedes configurar tu
                  proyecto a continuación.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 w-full rounded-md" data-testid="vercel-setup-project">
      {/* Collapsible Header */}
      <div className="font-medium mb-2">Configura tu proyecto de Vercel</div>

      {/* Collapsible Content */}
      <div
        className={`overflow-hidden transition-[max-height,opacity] duration-300 ease-in-out`}
      >
        <div className="pt-0 space-y-4">
          {/* Mode Selection */}
          <div>
            <div className="flex rounded-md border border-border">
              <Button
                type="button"
                variant={projectSetupMode === "create" ? "default" : "ghost"}
                className={`flex-1 rounded-none rounded-l-md border-0 ${projectSetupMode === "create"
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted"
                  }`}
                onClick={() => {
                  setProjectSetupMode("create");
                  setCreateProjectError(null);
                  setCreateProjectSuccess(false);
                }}
              >
                Crear nuevo proyecto
              </Button>
              <Button
                type="button"
                variant={projectSetupMode === "existing" ? "default" : "ghost"}
                className={`flex-1 rounded-none rounded-r-md border-0 border-l border-border ${projectSetupMode === "existing"
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted"
                  }`}
                onClick={() => {
                  setProjectSetupMode("existing");
                  setCreateProjectError(null);
                  setCreateProjectSuccess(false);
                }}
              >
                Conectar a un proyecto existente
              </Button>
            </div>
          </div>

          <form className="space-y-4" onSubmit={handleSetupProject}>
            {projectSetupMode === "create" ? (
              <>
                <div>
                  <Label className="block text-sm font-medium">
                    Nombre del proyecto
                  </Label>
                  <Input
                    data-testid="vercel-create-project-name-input"
                    className="w-full mt-1"
                    value={projectName}
                    onChange={(e) => {
                      const newValue = e.target.value;
                      setProjectName(newValue);
                      setProjectAvailable(null);
                      setProjectCheckError(null);
                      debouncedCheckProjectAvailability(newValue);
                    }}
                    disabled={isCreatingProject}
                  />
                  {isCheckingProject && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Comprobando disponibilidad...
                    </p>
                  )}
                  {projectAvailable === true && (
                    <p className="text-xs text-primary mt-1">
                      ¡El nombre del proyecto está disponible!
                    </p>
                  )}
                  {projectAvailable === false && (
                    <p className="text-xs text-destructive mt-1">
                      {projectCheckError}
                    </p>
                  )}
                </div>
              </>
            ) : (
              <>
                <div>
                  <Label className="block text-sm font-medium">
                    Seleccionar proyecto
                  </Label>
                  <UnifiedSelector
                    value={selectedProject}
                    onChange={(val) => setSelectedProject(String(val))}
                    disabled={isLoadingProjects}
                    options={availableProjects.map((project) => ({
                      value: project.id,
                      label: `${project.name} ${project.framework ? `(${project.framework})` : ""}`,
                    }))}
                    triggerVariant="outline"
                    triggerSize="md"
                    triggerClassName="w-full mt-1"
                    placeholder={
                      isLoadingProjects
                        ? "Cargando proyectos..."
                        : "Selecciona un proyecto"
                    }
                    data-testid="vercel-project-select"
                  />
                </div>
              </>
            )}

            <Button
              type="submit"
              disabled={
                isCreatingProject ||
                (projectSetupMode === "create" &&
                  (projectAvailable === false || !projectName)) ||
                (projectSetupMode === "existing" && !selectedProject)
              }
            >
              {isCreatingProject
                ? projectSetupMode === "create"
                  ? "Creando..."
                  : "Conectando..."
                : projectSetupMode === "create"
                  ? "Crear proyecto"
                  : "Conectar al proyecto"}
            </Button>
          </form>

          {createProjectError && (
            <p className="text-destructive mt-2">{createProjectError}</p>
          )}
          {createProjectSuccess && (
            <p className="text-primary mt-2">
              {projectSetupMode === "create"
                ? "¡Proyecto creado y enlazado!"
                : "¡Conectado al proyecto!"}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function VercelConnector({ appId, folderName }: VercelConnectorProps) {
  const { app, refreshApp } = useLoadApp(appId);
  const { settings, refreshSettings } = useSettings();

  if (app?.vercelProjectId && appId) {
    return (
      <ConnectedVercelConnector
        appId={appId}
        app={app}
        refreshApp={refreshApp}
      />
    );
  } else {
    return (
      <UnconnectedVercelConnector
        appId={appId}
        folderName={folderName}
        settings={settings}
        refreshSettings={refreshSettings}
        refreshApp={refreshApp}
      />
    );
  }
}
