import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ipc } from "@/ipc/types";
import { useMutation } from "@tanstack/react-query";
import { showError, showSuccess } from "@/lib/toast";
import { Folder, X, Loader2, Info } from "lucide-react";
import { Input } from "@/components/ui/input";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@radix-ui/react-label";
import { useNavigate } from "@tanstack/react-router";
import { useStreamChat } from "@/hooks/useStreamChat";
import type { GithubRepository } from "@/ipc/types";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { selectedAppIdAtom } from "@/atoms/appAtoms";
import { useSetAtom } from "jotai";
import { useLoadApps } from "@/hooks/useLoadApps";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "./ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSettings } from "@/hooks/useSettings";
import { UnconnectedGitHubConnector } from "@/components/GitHubConnector";

interface ImportAppDialogProps {
  isOpen: boolean;
  onClose: () => void;
}
export const AI_RULES_PROMPT =
  "Genera un archivo AI_RULES.md para esta aplicación. Describe el stack tecnológico en 5-10 puntos y describe reglas claras sobre qué librerías usar para qué.";
export function ImportAppDialog({ isOpen, onClose }: ImportAppDialogProps) {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [hasAiRules, setHasAiRules] = useState<boolean | null>(null);
  const [customAppName, setCustomAppName] = useState<string>("");
  const [nameExists, setNameExists] = useState<boolean>(false);
  const [isCheckingName, setIsCheckingName] = useState<boolean>(false);
  const [installCommand, setInstallCommand] = useState("");
  const [startCommand, setStartCommand] = useState("");
  const [copyToDyadApps, setCopyToDyadApps] = useState(true);
  const navigate = useNavigate();
  const { streamMessage } = useStreamChat({ hasChatId: false });
  const { refreshApps } = useLoadApps();
  const setSelectedAppId = useSetAtom(selectedAppIdAtom);
  // GitHub import state
  const [repos, setRepos] = useState<GithubRepository[]>([]);
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const { settings, refreshSettings } = useSettings();
  const isAuthenticated = !!settings?.githubAccessToken;

  const [githubAppName, setGithubAppName] = useState("");
  const [githubNameExists, setGithubNameExists] = useState(false);
  const [isCheckingGithubName, setIsCheckingGithubName] = useState(false);
  useEffect(() => {
    if (isOpen) {
      setGithubAppName("");
      setGithubNameExists(false);
      // Fetch GitHub repos if authenticated
      if (isAuthenticated) {
        fetchRepos();
      }
    }
  }, [isOpen, isAuthenticated]);

  // Re-check app name when copyToDyadApps changes
  useEffect(() => {
    if (customAppName.trim() && selectedPath) {
      checkAppName({ name: customAppName, skipCopy: !copyToDyadApps });
    }
  }, [copyToDyadApps]);

  const fetchRepos = async () => {
    setLoading(true);
    try {
      const fetchedRepos = await ipc.github.listRepos();
      setRepos(fetchedRepos);
    } catch (err: unknown) {
      showError(
        "Error al obtener los repositorios: " + (err as any).toString(),
      );
    } finally {
      setLoading(false);
    }
  };
  const handleUrlBlur = async () => {
    if (!url.trim()) return;
    const repoName = extractRepoNameFromUrl(url);
    if (repoName) {
      setGithubAppName(repoName);
      setIsCheckingGithubName(true);
      try {
        const result = await ipc.import.checkAppName({
          appName: repoName,
        });
        setGithubNameExists(result.exists);
      } catch (error: unknown) {
        showError(
          "Error al comprobar el nombre de la app: " +
          (error as any).toString(),
        );
      } finally {
        setIsCheckingGithubName(false);
      }
    }
  };
  const extractRepoNameFromUrl = (url: string): string | null => {
    const match = url.match(/github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?\/?$/);
    return match ? match[2] : null;
  };
  const handleImportFromUrl = async () => {
    setImporting(true);
    try {
      const match = extractRepoNameFromUrl(url);
      const repoName = match ? match[2] : "";
      const appName = githubAppName.trim() || repoName;
      const result = await ipc.github.cloneRepoFromUrl({
        url,
        installCommand: installCommand.trim() || undefined,
        startCommand: startCommand.trim() || undefined,
        appName,
      });
      if ("error" in result) {
        showError(result.error);
        setImporting(false);
        return;
      }
      setSelectedAppId(result.app.id);
      showSuccess(`Importado con éxito: ${result.app.name}`);
      const chatId = await ipc.chat.createChat(result.app.id);
      ipc.system.openChatWindow({ appId: result.app.id, chatId });
      navigate({ to: "/app-details", search: { appId: result.app.id } });
      if (!result.hasAiRules) {
        streamMessage({
          prompt: AI_RULES_PROMPT,
          chatId,
        });
      }
      onClose();
    } catch (error: unknown) {
      showError(
        "Error al importar el repositorio: " + (error as any).toString(),
      );
    } finally {
      setImporting(false);
    }
  };

  const handleSelectRepo = async (repo: GithubRepository) => {
    setImporting(true);

    try {
      const appName = githubAppName.trim() || repo.name;
      const result = await ipc.github.cloneRepoFromUrl({
        url: `https://github.com/${repo.full_name}.git`,
        installCommand: installCommand.trim() || undefined,
        startCommand: startCommand.trim() || undefined,
        appName,
      });
      if ("error" in result) {
        showError(result.error);
        setImporting(false);
        return;
      }
      setSelectedAppId(result.app.id);
      showSuccess(`Importado con éxito: ${result.app.name}`);
      const chatId = await ipc.chat.createChat(result.app.id);
      ipc.system.openChatWindow({ appId: result.app.id, chatId });
      navigate({ to: "/app-details", search: { appId: result.app.id } });
      if (!result.hasAiRules) {
        streamMessage({
          prompt: AI_RULES_PROMPT,
          chatId,
        });
      }
      onClose();
    } catch (error: unknown) {
      showError(
        "Error al importar el repositorio: " + (error as any).toString(),
      );
    } finally {
      setImporting(false);
    }
  };

  const handleGithubAppNameChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const newName = e.target.value;
    setGithubAppName(newName);
    if (newName.trim()) {
      setIsCheckingGithubName(true);
      try {
        const result = await ipc.import.checkAppName({
          appName: newName,
        });
        setGithubNameExists(result.exists);
      } catch (error: unknown) {
        showError(
          "Error al comprobar el nombre de la app: " +
          (error as any).toString(),
        );
      } finally {
        setIsCheckingGithubName(false);
      }
    }
  };

  const checkAppName = async ({
    name,
    skipCopy,
  }: {
    name: string;
    skipCopy?: boolean;
  }): Promise<void> => {
    setIsCheckingName(true);
    try {
      const result = await ipc.import.checkAppName({
        appName: name,
        skipCopy,
      });
      setNameExists(result.exists);
    } catch (error: unknown) {
      showError(
        "Error al comprobar el nombre de la app: " + (error as any).toString(),
      );
    } finally {
      setIsCheckingName(false);
    }
  };
  const selectFolderMutation = useMutation({
    mutationFn: async () => {
      const result = await ipc.system.selectAppFolder();
      if (!result.path || !result.name) {
        // User cancelled the folder selection dialog
        return null;
      }
      const aiRulesCheck = await ipc.import.checkAiRules({
        path: result.path,
      });
      setHasAiRules(aiRulesCheck.exists);
      setSelectedPath(result.path);
      // Use the folder name from the IPC response
      setCustomAppName(result.name);
      // Check if the app name already exists
      await checkAppName({ name: result.name, skipCopy: !copyToDyadApps });
      return result;
    },
    onError: (error: Error) => {
      showError(error.message);
    },
  });

  const importAppMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPath) throw new Error("No folder selected");
      return ipc.import.importApp({
        path: selectedPath,
        appName: customAppName,
        installCommand: installCommand || undefined,
        startCommand: startCommand || undefined,
        skipCopy: !copyToDyadApps,
      });
    },
    onSuccess: async (result) => {
      showSuccess(
        !hasAiRules
          ? "App importada con éxito. Vibes generará un AI_RULES.md ahora."
          : "App importada con éxito",
      );
      onClose();

      navigate({ to: "/app-details", search: { appId: result.appId } });
      ipc.system.openChatWindow({ appId: result.appId, chatId: result.chatId });
      if (!hasAiRules) {
        streamMessage({
          prompt: AI_RULES_PROMPT,
          chatId: result.chatId,
        });
      }
      setSelectedAppId(result.appId);
      await refreshApps();
    },
    onError: (error: Error) => {
      showError(error.message);
    },
  });

  const handleSelectFolder = () => {
    selectFolderMutation.mutate();
  };

  const handleImport = () => {
    importAppMutation.mutate();
  };

  const handleClear = () => {
    setSelectedPath(null);
    setHasAiRules(null);
    setCustomAppName("");
    setNameExists(false);
    setInstallCommand("");
    setStartCommand("");
    setCopyToDyadApps(true);
  };

  const handleAppNameChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const newName = e.target.value;
    setCustomAppName(newName);
    if (newName.trim()) {
      await checkAppName({ name: newName, skipCopy: !copyToDyadApps });
    }
  };

  const hasInstallCommand = installCommand.trim().length > 0;
  const hasStartCommand = startCommand.trim().length > 0;
  const commandsValid = hasInstallCommand === hasStartCommand;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl w-[calc(100vw-2rem)] max-h-[98vh] overflow-y-auto flex flex-col p-0">
        <DialogHeader className="sticky top-0 bg-background border-b px-6 py-4">
          <DialogTitle>Importar App</DialogTitle>
          <DialogDescription className="text-sm">
            Importa una aplicación existente desde una carpeta local o clónala
            desde Github.
          </DialogDescription>
        </DialogHeader>
        <div className="px-6 pb-6 overflow-y-auto flex-1">
          <Alert className="border-blue-500/20 text-blue-500 mb-2">
            <Info className="h-4 w-4 flex-shrink-0" />
            <AlertDescription className="text-xs sm:text-sm">
              La importación de apps es una función experimental. Si encuentras
              algún problema, infórmalo usando el botón de Ayuda.
            </AlertDescription>
          </Alert>
          <Tabs defaultValue="local-folder" className="w-full">
            <TabsList className="grid w-full grid-cols-3 h-auto">
              <TabsTrigger
                value="local-folder"
                className="text-xs sm:text-sm px-2 py-2"
              >
                Carpeta local
              </TabsTrigger>
              <TabsTrigger
                value="github-repos"
                className="text-xs sm:text-sm px-2 py-2"
              >
                <span className="hidden sm:inline">Mis repos de GitHub</span>
                <span className="sm:hidden">GitHub</span>
              </TabsTrigger>
              <TabsTrigger
                value="github-url"
                className="text-xs sm:text-sm px-2 py-2"
              >
                GitHub URL
              </TabsTrigger>
            </TabsList>
            <TabsContent value="local-folder" className="space-y-4">
              <div className="py-4">
                {!selectedPath ? (
                  <Button
                    onClick={handleSelectFolder}
                    disabled={selectFolderMutation.isPending}
                    className="w-full"
                  >
                    {selectFolderMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Folder className="mr-2 h-4 w-4" />
                    )}
                    {selectFolderMutation.isPending
                      ? "Seleccionando carpeta..."
                      : "Seleccionar carpeta"}
                  </Button>
                ) : (
                  <div className="space-y-4">
                    <div className="rounded-md border p-3 sm:p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1 overflow-hidden">
                          <p className="text-sm font-medium mb-1">
                            Carpeta seleccionada:
                          </p>
                          <p className="text-xs sm:text-sm text-muted-foreground break-words">
                            {selectedPath}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleClear}
                          className="h-8 w-8 p-0 flex-shrink-0"
                          disabled={importAppMutation.isPending}
                        >
                          <X className="h-4 w-4" />
                          <span className="sr-only">Limpiar selección</span>
                        </Button>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="copy-to-dyad-apps"
                        checked={copyToDyadApps}
                        onCheckedChange={(checked) =>
                          setCopyToDyadApps(checked === true)
                        }
                        disabled={importAppMutation.isPending}
                      />
                      <label
                        htmlFor="copy-to-dyad-apps"
                        className="text-xs sm:text-sm cursor-pointer"
                      >
                        Copiar a la carpeta{" "}
                        <code className="bg-muted px-1 py-0.5 rounded text-xs">
                          dyad-apps
                        </code>{" "}
                      </label>
                    </div>

                    <div className="space-y-2">
                      {nameExists && (
                        <p className="text-xs sm:text-sm text-yellow-500">
                          Ya existe una aplicación con este nombre. Por favor,
                          elige un nombre diferente:
                        </p>
                      )}
                      <div className="relative">
                        <Label className="text-xs sm:text-sm ml-2 mb-2">
                          Nombre de la aplicación
                        </Label>
                        <Input
                          value={customAppName}
                          onChange={handleAppNameChange}
                          placeholder="Introduce el nombre de la app"
                          className="w-full pr-8 text-sm"
                          disabled={importAppMutation.isPending}
                        />
                        {isCheckingName && (
                          <div className="absolute right-2 top-1/2 -translate-y-1/2">
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          </div>
                        )}
                      </div>
                    </div>

                    <Accordion type="single" collapsible>
                      <AccordionItem value="advanced-options">
                        <AccordionTrigger className="text-xs sm:text-sm hover:no-underline">
                          Opciones avanzadas
                        </AccordionTrigger>
                        <AccordionContent className="space-y-4">
                          <div className="grid gap-2">
                            <Label className="text-xs sm:text-sm ml-2 mb-2">
                              Comando de instalación
                            </Label>
                            <Input
                              value={installCommand}
                              onChange={(e) =>
                                setInstallCommand(e.target.value)
                              }
                              placeholder="npm install"
                              className="text-sm"
                              disabled={importAppMutation.isPending}
                            />
                          </div>
                          <div className="grid gap-2">
                            <Label className="text-xs sm:text-sm ml-2 mb-2">
                              Comando de inicio
                            </Label>
                            <Input
                              value={startCommand}
                              onChange={(e) => setStartCommand(e.target.value)}
                              placeholder="npm run dev"
                              className="text-sm"
                              disabled={importAppMutation.isPending}
                            />
                          </div>
                          {!commandsValid && (
                            <p className="text-xs sm:text-sm text-red-500">
                              Ambos comandos son obligatorios al personalizar.
                            </p>
                          )}
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>

                    {hasAiRules === false && (
                      <Alert className="border-yellow-500/20 text-yellow-500 flex items-start gap-2">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Info className="h-4 w-4 flex-shrink-0 mt-1" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="text-xs">
                                AI_RULES.md le dice a Vibes qué tecnologías usar
                                para editar la app
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <AlertDescription className="text-xs sm:text-sm">
                          No se encontró AI_RULES.md. Vibes generará uno
                          automáticamente después de importar.
                        </AlertDescription>
                      </Alert>
                    )}

                    {importAppMutation.isPending && (
                      <div className="flex items-center justify-center space-x-2 text-xs sm:text-sm text-muted-foreground animate-pulse">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Importando app...</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <DialogFooter className="flex-col sm:flex-row gap-2">
                <Button
                  variant="outline"
                  onClick={onClose}
                  disabled={importAppMutation.isPending}
                  className="w-full sm:w-auto"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleImport}
                  disabled={
                    !selectedPath ||
                    importAppMutation.isPending ||
                    nameExists ||
                    !commandsValid
                  }
                  className="w-full sm:w-auto min-w-[80px]"
                >
                  {importAppMutation.isPending ? (
                    <>Importando...</>
                  ) : (
                    "Importar"
                  )}
                </Button>
              </DialogFooter>
            </TabsContent>
            <TabsContent value="github-repos" className="space-y-4">
              {!isAuthenticated ? (
                <UnconnectedGitHubConnector
                  appId={null}
                  folderName=""
                  settings={settings}
                  refreshSettings={refreshSettings}
                  handleRepoSetupComplete={() => undefined}
                  expanded={false}
                />
              ) : (
                <>
                  {loading && (
                    <div className="flex justify-center py-8">
                      <Loader2 className="animate-spin h-6 w-6" />
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label className="text-xs sm:text-sm ml-2 mb-2">
                      Nombre de la aplicación (opcional)
                    </Label>
                    <Input
                      value={githubAppName}
                      onChange={handleGithubAppNameChange}
                      placeholder="Deja vacío para usar el nombre del repositorio"
                      className="w-full pr-8 text-sm"
                      disabled={importing}
                    />
                    {isCheckingGithubName && (
                      <div className="absolute right-2 top-1/2 -translate-y-1/2">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      </div>
                    )}
                    {githubNameExists && (
                      <p className="text-xs sm:text-sm text-yellow-500">
                        Ya existe una aplicación con este nombre. Por favor,
                        elige un nombre diferente.
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col space-y-2 max-h-64 overflow-y-auto overflow-x-hidden">
                    {!loading && repos.length === 0 && (
                      <p className="text-xs sm:text-sm text-muted-foreground text-center py-4">
                        No se encontraron repositorios
                      </p>
                    )}
                    {repos.map((repo) => (
                      <div
                        key={repo.full_name}
                        className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors min-w-0"
                      >
                        <div className="min-w-0 flex-1 overflow-hidden mr-2">
                          <p className="font-semibold truncate text-sm">
                            {repo.name}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {repo.full_name}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSelectRepo(repo)}
                          disabled={importing}
                          className="flex-shrink-0 text-xs"
                        >
                          {importing ? (
                            <Loader2 className="animate-spin h-4 w-4" />
                          ) : (
                            "Importar"
                          )}
                        </Button>
                      </div>
                    ))}
                  </div>

                  {repos.length > 0 && (
                    <>
                      <Accordion type="single" collapsible>
                        <AccordionItem value="advanced-options">
                          <AccordionTrigger className="text-xs sm:text-sm hover:no-underline">
                            Opciones avanzadas
                          </AccordionTrigger>
                          <AccordionContent className="space-y-4">
                            <div className="grid gap-2">
                              <Label className="text-xs sm:text-sm">
                                Comando de instalación
                              </Label>
                              <Input
                                value={installCommand}
                                onChange={(e) =>
                                  setInstallCommand(e.target.value)
                                }
                                placeholder="npm install"
                                className="text-sm"
                                disabled={importing}
                              />
                            </div>
                            <div className="grid gap-2">
                              <Label className="text-xs sm:text-sm">
                                Comando de inicio
                              </Label>
                              <Input
                                value={startCommand}
                                onChange={(e) =>
                                  setStartCommand(e.target.value)
                                }
                                placeholder="npm run dev"
                                className="text-sm"
                                disabled={importing}
                              />
                            </div>
                            {!commandsValid && (
                              <p className="text-xs sm:text-sm text-red-500">
                                Ambos comandos son obligatorios al personalizar.
                              </p>
                            )}
                          </AccordionContent>
                        </AccordionItem>
                      </Accordion>
                    </>
                  )}
                </>
              )}
            </TabsContent>
            <TabsContent value="github-url" className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs sm:text-sm">
                  URL del repositorio
                </Label>
                <Input
                  placeholder="https://github.com/user/repo.git"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  disabled={importing}
                  onBlur={handleUrlBlur}
                  className="text-sm break-all"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs sm:text-sm">
                  Nombre de la aplicación (opcional)
                </Label>
                <Input
                  value={githubAppName}
                  onChange={handleGithubAppNameChange}
                  placeholder="Deja vacío para usar el nombre del repositorio"
                  disabled={importing}
                  className="text-sm"
                />
                {isCheckingGithubName && (
                  <div className="absolute right-2 top-1/2 -translate-y-1/2">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                )}
                {githubNameExists && (
                  <p className="text-xs sm:text-sm text-yellow-500">
                    Ya existe una aplicación con este nombre. Por favor, elige
                    un nombre diferente.
                  </p>
                )}
              </div>

              <Accordion type="single" collapsible>
                <AccordionItem value="advanced-options">
                  <AccordionTrigger className="text-xs sm:text-sm hover:no-underline">
                    Opciones avanzadas
                  </AccordionTrigger>
                  <AccordionContent className="space-y-4">
                    <div className="grid gap-2">
                      <Label className="text-xs sm:text-sm">
                        Comando de instalación
                      </Label>
                      <Input
                        value={installCommand}
                        onChange={(e) => setInstallCommand(e.target.value)}
                        placeholder="npm install"
                        className="text-sm"
                        disabled={importing}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label className="text-xs sm:text-sm">
                        Comando de inicio
                      </Label>
                      <Input
                        value={startCommand}
                        onChange={(e) => setStartCommand(e.target.value)}
                        placeholder="npm run dev"
                        className="text-sm"
                        disabled={importing}
                      />
                    </div>
                    {!commandsValid && (
                      <p className="text-xs sm:text-sm text-red-500">
                        Ambos comandos son obligatorios al personalizar.
                      </p>
                    )}
                  </AccordionContent>
                </AccordionItem>
              </Accordion>

              <Button
                onClick={handleImportFromUrl}
                disabled={importing || !url.trim() || !commandsValid}
                className="w-full"
              >
                {importing ? (
                  <>
                    <Loader2 className="animate-spin mr-2 h-4 w-4" />
                    Importando...
                  </>
                ) : (
                  "Importar"
                )}
              </Button>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
