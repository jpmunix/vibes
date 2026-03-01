import React from "react";
import { Button } from "@/components/ui/button";
import { selectedAppIdAtom } from "@/atoms/appAtoms";
import { selectedChatIdAtom } from "@/atoms/chatAtoms";
import { useAtomValue } from "jotai";
import { showError } from "@/lib/toast";
import { useLoadApp } from "@/hooks/useLoadApp";
import { useStreamChat } from "@/hooks/useStreamChat";
import { ipc } from "@/ipc/types";
import type { BunnyConfig } from "@/ipc/types/bunny";

interface DyadAddIntegrationProps {
  node: {
    properties: {
      provider: string;
    };
  };
  children: React.ReactNode;
}

// Shared SVG check icon for "completed" states
const CheckIcon = () => (
  <svg
    className="w-5 h-5 text-green-600 dark:text-green-400"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    viewBox="0 0 24 24"
  >
    <circle
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeWidth="2"
      fill="currentColor"
      className="opacity-20"
    />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M9 12l2 2 4-4"
    />
  </svg>
);

export const DyadAddIntegration: React.FC<DyadAddIntegrationProps> = ({
  node,
  children,
}) => {
  const { streamMessage, isStreaming } = useStreamChat();

  const { provider } = node.properties;
  const appId = useAtomValue(selectedAppIdAtom);
  const chatId = useAtomValue(selectedChatIdAtom);
  const { app } = useLoadApp(appId);

  const handleKeepGoingClick = (providerLabel: string) => {
    if (chatId === null) {
      showError("No se encontró el chat");
      return;
    }
    streamMessage({
      prompt: `Continuar. He completado la integración con ${providerLabel}.`,
      chatId,
    });
  };

  const handleSetupClick = () => {
    if (!appId) {
      showError("No se encontró el ID de la aplicación");
      return;
    }
    // Use IPC to navigate the main window — works from both main and chat windows
    ipc.system.navigateMainWindow({
      route: "/app-details",
      search: { appId },
    });
  };

  // --- Provider-specific "already configured" states ---

  if (provider === "supabase" && app?.supabaseProjectName) {
    return (
      <div className="flex flex-col my-2 p-3 border border-green-300 dark:border-green-800/50 rounded-lg bg-green-50 dark:bg-green-900/20 shadow-sm">
        <div className="flex items-center space-x-2">
          <CheckIcon />
          <span className="font-semibold text-green-800 dark:text-green-300">
            Integración con Supabase completada
          </span>
        </div>
        <div className="text-sm text-green-900 dark:text-green-100">
          <p>
            Esta app está conectada al proyecto Supabase:{" "}
            <span className="font-mono font-medium bg-green-100 dark:bg-green-900/40 px-1 py-0.5 rounded">
              {app.supabaseProjectName}
            </span>
          </p>
        </div>
        <Button
          onClick={() => handleKeepGoingClick("Supabase")}
          className="self-start mt-2"
          variant="default"
          disabled={isStreaming}
        >
          Continuar
        </Button>
      </div>
    );
  }

  if (provider === "pocketbase") {
    const pbConfig = app?.pocketbaseConfig as any;
    if (pbConfig && pbConfig.url && pbConfig.adminEmail) {
      return (
        <div className="flex flex-col my-2 p-3 border border-green-300 dark:border-green-800/50 rounded-lg bg-green-50 dark:bg-green-900/20 shadow-sm">
          <div className="flex items-center space-x-2">
            <CheckIcon />
            <span className="font-semibold text-green-800 dark:text-green-300">
              Integración con PocketBase completada
            </span>
          </div>
          <div className="text-sm text-green-900 dark:text-green-100">
            <p>
              Instancia: <span className="font-mono">{pbConfig.url}</span>
            </p>
          </div>
          <Button
            onClick={() => handleKeepGoingClick("PocketBase")}
            className="self-start mt-2"
            variant="default"
            disabled={isStreaming}
          >
            Continuar
          </Button>
        </div>
      );
    }
  }

  if (provider === "bunny") {
    const bunnyConfig = app?.bunnyConfig as BunnyConfig | null;
    const hasBunnyData =
      bunnyConfig &&
      ((bunnyConfig.databases?.length ?? 0) > 0 ||
        (bunnyConfig.storageZones?.length ?? 0) > 0);

    if (hasBunnyData) {
      const dbCount = bunnyConfig!.databases.length;
      const szCount = bunnyConfig!.storageZones.length;
      const parts: string[] = [];
      if (dbCount > 0)
        parts.push(`${dbCount} base${dbCount > 1 ? "s" : ""} de datos`);
      if (szCount > 0)
        parts.push(
          `${szCount} zona${szCount > 1 ? "s" : ""} de almacenamiento`,
        );

      return (
        <div className="flex flex-col my-2 p-3 border border-green-300 dark:border-green-800/50 rounded-lg bg-green-50 dark:bg-green-900/20 shadow-sm">
          <div className="flex items-center space-x-2">
            <CheckIcon />
            <span className="font-semibold text-green-800 dark:text-green-300">
              Integración con Bunny.net completada
            </span>
          </div>
          <div className="text-sm text-green-900 dark:text-green-100">
            <p>
              Configurado: {parts.join(" y ")}
            </p>
          </div>
          <Button
            onClick={() => handleKeepGoingClick("Bunny.net")}
            className="self-start mt-2"
            variant="default"
            disabled={isStreaming}
          >
            Continuar
          </Button>
        </div>
      );
    }
  }

  // --- Default: not configured, show setup button ---
  const providerLabel = provider === "bunny" ? "Bunny.net" : provider === "pocketbase" ? "PocketBase" : provider;

  return (
    <div className="flex flex-col gap-2 my-2 p-3 border rounded-md bg-secondary/10 dark:bg-secondary/20">
      <div className="text-sm">
        <div className="font-medium text-foreground">
          ¿Integrar con {providerLabel}?
        </div>
        <div className="text-muted-foreground text-xs">{children}</div>
      </div>
      <Button onClick={handleSetupClick} className="self-start w-full">
        Configurar {providerLabel}
      </Button>
    </div>
  );
};
