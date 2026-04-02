import { useNavigate } from "@tanstack/react-router";
import { useScrollAndNavigateTo } from "@/hooks/useScrollAndNavigateTo";
import {
  CheckCircle,
  AlertCircle,
  XCircle,
  Loader2,
  Folder,
} from "lucide-react";

import SetupProviderCard from "@/components/SetupProviderCard";

import { useState, useEffect, useCallback } from "react";
import { ipc, NodeSystemInfo } from "@/ipc/types";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usePostHog } from "posthog-js/react";
import { useLanguageModelProviders } from "@/hooks/useLanguageModelProviders";
// @ts-ignore
// @ts-ignore
// @ts-ignore
import openrouterLogo from "../../assets/ai-logos/openrouter-logo.png";
import { OnboardingBanner } from "./home/OnboardingBanner";
import { showError } from "@/lib/toast";
import { useSettings } from "@/hooks/useSettings";

type NodeInstallStep =
  | "install"
  | "waiting-for-continue"
  | "continue-processing"
  | "finished-checking";

export function SetupBanner() {
  const posthog = usePostHog();
  const navigate = useNavigate();
  const scrollAndNavigateTo = useScrollAndNavigateTo("/settings");
  const [isOnboardingVisible, setIsOnboardingVisible] = useState(true);
  const { isAnyProviderSetup, isLoading: loading } =
    useLanguageModelProviders();
  const [nodeSystemInfo, setNodeSystemInfo] = useState<NodeSystemInfo | null>(
    null,
  );
  const [nodeCheckError, setNodeCheckError] = useState<boolean>(false);
  const [nodeInstallStep, setNodeInstallStep] =
    useState<NodeInstallStep>("install");
  const checkNode = useCallback(async () => {
    try {
      setNodeCheckError(false);
      const status = await ipc.system.getNodejsStatus();
      setNodeSystemInfo(status);
    } catch (error) {
      console.error("Failed to check Node.js status:", error);
      setNodeSystemInfo(null);
      setNodeCheckError(true);
    }
  }, [setNodeSystemInfo, setNodeCheckError]);
  const [showManualConfig, setShowManualConfig] = useState(false);
  const [isSelectingPath, setIsSelectingPath] = useState(false);
  const { updateSettings } = useSettings();

  // Add handler for manual path selection
  const handleManualNodeConfig = useCallback(async () => {
    setIsSelectingPath(true);
    try {
      const result = await ipc.system.selectNodeFolder();
      if (result.path) {
        await updateSettings({ customNodePath: result.path });
        await ipc.system.reloadEnvPath();
        await checkNode();
        setNodeInstallStep("finished-checking");
        setShowManualConfig(false);
      } else if (result.path === null && result.canceled === false) {
        showError(
          `Could not find Node.js at the path "${result.selectedPath}"`,
        );
      }
    } catch (error) {
      showError("Error setting Node.js path:" + error);
    } finally {
      setIsSelectingPath(false);
    }
  }, [checkNode]);

  useEffect(() => {
    checkNode();
  }, [checkNode]);

  const handleOpenRouterSetupClick = () => {
    posthog.capture("setup-flow:ai-provider-setup:openrouter:click");
    scrollAndNavigateTo("models-connectivity");
  };

  const handleNodeInstallClick = useCallback(async () => {
    posthog.capture("setup-flow:start-node-install-click");
    setNodeInstallStep("waiting-for-continue");
    ipc.system.openExternalUrl(nodeSystemInfo!.nodeDownloadUrl);
  }, [nodeSystemInfo, setNodeInstallStep]);

  const finishNodeInstall = useCallback(async () => {
    posthog.capture("setup-flow:continue-node-install-click");
    setNodeInstallStep("continue-processing");
    await ipc.system.reloadEnvPath();
    await checkNode();
    setNodeInstallStep("finished-checking");
  }, [checkNode, setNodeInstallStep]);

  // We only check for node version because pnpm is not required for the app to run.
  const isNodeSetupComplete = Boolean(nodeSystemInfo?.nodeVersion);

  const itemsNeedAction: string[] = [];
  if (!isNodeSetupComplete && nodeSystemInfo) {
    itemsNeedAction.push("node-setup");
  }
  if (!isAnyProviderSetup() && !loading) {
    itemsNeedAction.push("ai-setup");
  }

  if (itemsNeedAction.length === 0) {
    // Don't show the heading while still loading initial data
    // (nodeSystemInfo null or providers loading) to avoid a flash
    // of this heading in windows like the chat that mount SetupBanner transiently.
    if (!nodeSystemInfo || loading) {
      return null;
    }
    return <VibesStartHeading />;
  }

  const bannerClasses = cn(
    "w-full mb-6 border rounded-xl shadow-sm overflow-hidden",
    "border-zinc-200 dark:border-zinc-700",
  );

  const getStatusIcon = (isComplete: boolean, hasError: boolean = false) => {
    if (hasError) {
      return <XCircle className="w-5 h-5 text-red-500" />;
    }
    return isComplete ? (
      <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-500" />
    ) : (
      <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-500" />
    );
  };

  return (
    <>
      <p className="text-xl font-medium text-zinc-700 dark:text-zinc-300 p-4 pt-6">
        Configura vibes
      </p>
      <OnboardingBanner
        isVisible={isOnboardingVisible}
        setIsVisible={setIsOnboardingVisible}
      />
      <div className={bannerClasses}>
        <Accordion
          type="multiple"
          className="w-full"
          defaultValue={itemsNeedAction}
        >
          <AccordionItem
            value="node-setup"
            className={cn(
              nodeCheckError
                ? "bg-red-50 dark:bg-red-900/30"
                : isNodeSetupComplete
                  ? "bg-green-50 dark:bg-green-900/30"
                  : "bg-yellow-50 dark:bg-yellow-900/30",
            )}
          >
            <AccordionTrigger className="px-4 py-3 transition-colors w-full hover:no-underline">
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-3">
                  {getStatusIcon(isNodeSetupComplete, nodeCheckError)}
                  <span className="font-medium text-sm">
                    1. Instalar Node.js (entorno de ejecución)
                  </span>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pt-2 pb-4 bg-white dark:bg-zinc-900 border-t border-inherit">
              {nodeCheckError && (
                <p className="text-sm text-red-600 dark:text-red-400">
                  Error al comprobar el estado de Node.js. Intenta instalar
                  Node.js.
                </p>
              )}
              {isNodeSetupComplete ? (
                <p className="text-sm">
                  Node.js ({nodeSystemInfo!.nodeVersion}) instalado.
                </p>
              ) : (
                <div className="text-sm">
                  <p>Node.js es necesario para ejecutar apps localmente.</p>
                  {nodeInstallStep === "waiting-for-continue" && (
                    <p className="mt-1">
                      Después de instalar Node.js, haz clic en "Continuar". Si
                      el instalador no funcionó, prueba con{" "}
                      <a
                        className="text-blue-500 dark:text-blue-400 hover:underline"
                        onClick={() => {
                          ipc.system.openExternalUrl(
                            "https://nodejs.org/en/download",
                          );
                        }}
                      >
                        más opciones de descarga
                      </a>
                      .
                    </p>
                  )}
                  <NodeInstallButton
                    nodeInstallStep={nodeInstallStep}
                    handleNodeInstallClick={handleNodeInstallClick}
                    finishNodeInstall={finishNodeInstall}
                  />

                  <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                    <button
                      onClick={() => setShowManualConfig(!showManualConfig)}
                      className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      ¿Node.js ya está instalado? Configura la ruta manualmente
                      →
                    </button>

                    {showManualConfig && (
                      <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                        <Button
                          onClick={handleManualNodeConfig}
                          disabled={isSelectingPath}
                          variant="outline"
                          size="sm"
                        >
                          {isSelectingPath ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Seleccionando...
                            </>
                          ) : (
                            <>
                              <Folder className="mr-2 h-4 w-4" />
                              Buscar carpeta de Node.js
                            </>
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )}
              <NodeJsHelpCallout />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem
            value="ai-setup"
            className={cn(
              isAnyProviderSetup()
                ? "bg-green-50 dark:bg-green-900/30"
                : "bg-yellow-50 dark:bg-yellow-900/30",
            )}
          >
            <AccordionTrigger
              className={cn(
                "px-4 py-3 transition-colors w-full hover:no-underline",
              )}
            >
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-3">
                  {getStatusIcon(isAnyProviderSetup())}
                  <span className="font-medium text-sm">
                    2. Configurar acceso a IA
                  </span>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pt-2 pb-4 bg-white dark:bg-zinc-900 border-t border-inherit">
              <div className="mt-2 flex gap-2">
                <SetupProviderCard
                  className="flex-1"
                  variant="openrouter"
                  onClick={handleOpenRouterSetupClick}
                  tabIndex={isNodeSetupComplete ? 0 : -1}
                  leadingIcon={
                    <img
                      src={openrouterLogo}
                      alt="OpenRouter"
                      className="w-4 h-4"
                    />
                  }
                  title="Configurar clave API de OpenRouter"
                  chip={<>Necesario</>}
                />
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>


    </>
  );
}

function VibesStartHeading() {
  const full = "vibes.start()";
  const [text, setText] = useState<string>("");

  useEffect(() => {
    let i = 0;
    const timer: number = window.setInterval(() => {
      i += 1;
      setText(full.slice(0, i));
      if (i >= full.length) {
        window.clearInterval(timer);
      }
    }, 85);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center mb-10">
      <h1 className="relative text-6xl font-bold tracking-tight">
        <span
          className="relative z-10 text-foreground"
        >
          {text}
          <span
            className="inline-block ml-0.5 text-foreground"
            style={{
              animation: "vibes-start-blink 1.1s step-end infinite",
            }}
          >
            |
          </span>
        </span>
      </h1>

      {/* Subtle subtitle */}
      <p
        className="mt-3 text-sm font-medium tracking-wide"
        style={{
          color: "color-mix(in oklch, var(--foreground) 40%, transparent)",
          animation: "vibes-subtitle-in 0.8s cubic-bezier(0.22, 1, 0.36, 1) 1.2s forwards",
          opacity: 0,
        }}
      >
        ¿Qué construimos hoy?
      </p>

      <style>{`
        @keyframes vibes-start-blink {
          0%, 45% { opacity: 1; }
          50%, 100% { opacity: 0; }
        }

        @keyframes vibes-subtitle-in {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

function NodeJsHelpCallout() {
  return (
    <div className="mt-3 p-3 bg-(--background-lighter) border rounded-lg text-sm">
      <p>
        Si tienes problemas, consulta nuestra{" "}
        <a
          onClick={() => {
            ipc.system.openExternalUrl("https://www.dyad.sh/docs/help/nodejs");
          }}
          className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
        >
          guía de solución de problemas de Node.js
        </a>
        .{" "}
      </p>
      <p className="mt-2">
        ¿Sigues atascado? Haz clic en el botón de <b>Ayuda</b> en la esquina
        inferior izquierda y luego en <b>Reportar un error</b>.
      </p>
    </div>
  );
}

function NodeInstallButton({
  nodeInstallStep,
  handleNodeInstallClick,
  finishNodeInstall,
}: {
  nodeInstallStep: NodeInstallStep;
  handleNodeInstallClick: () => void;
  finishNodeInstall: () => void;
}) {
  switch (nodeInstallStep) {
    case "install":
      return (
        <Button className="mt-3" onClick={handleNodeInstallClick}>
          Instalar entorno de ejecución de Node.js
        </Button>
      );
    case "continue-processing":
      return (
        <Button className="mt-3" onClick={finishNodeInstall} disabled>
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Comprobando la configuración de Node.js...
          </div>
        </Button>
      );
    case "waiting-for-continue":
      return (
        <Button className="mt-3" onClick={finishNodeInstall}>
          <div className="flex items-center gap-2">
            Continuar | He instalado Node.js
          </div>
        </Button>
      );
    case "finished-checking":
      return (
        <div className="mt-3 text-sm text-red-600 dark:text-red-400">
          No se detecta Node.js. Cerrar y volver a abrir Vibes suele solucionar
          esto.
        </div>
      );
    default:
      const _exhaustiveCheck: never = nodeInstallStep;
  }
}

export const OpenRouterSetupBanner = ({
  className,
}: {
  className?: string;
}) => {
  const posthog = usePostHog();
  const scrollAndNavigateTo = useScrollAndNavigateTo("/settings");
  const { isProviderSetup } = useLanguageModelProviders();

  if (isProviderSetup("openrouter")) {
    return null;
  }

  return (
    <SetupProviderCard
      className={cn("mt-2", className)}
      variant="openrouter"
      onClick={() => {
        posthog.capture("setup-flow:ai-provider-setup:openrouter:click");
        scrollAndNavigateTo("models-connectivity");
      }}
      tabIndex={0}
      leadingIcon={
        <img src={openrouterLogo} alt="OpenRouter" className="w-4 h-4" />
      }
      title="Configurar clave API de OpenRouter"
      chip={<></>}
    />
  );
};
