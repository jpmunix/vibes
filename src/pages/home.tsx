import { useNavigate, useSearch } from "@tanstack/react-router";
import { useAtom, useSetAtom } from "jotai";
import { homeChatInputValueAtom, selectedDesignAtom } from "../atoms/chatAtoms";
import { selectedAppIdAtom } from "@/atoms/appAtoms";
import { ipc } from "@/ipc/types";
import { generateCuteAppName } from "@/lib/utils";
import { useLoadApps } from "@/hooks/useLoadApps";
import { useSettings } from "@/hooks/useSettings";
import { SetupBanner } from "@/components/SetupBanner";
import { isPreviewOpenAtom } from "@/atoms/viewAtoms";
import { useState, useEffect, useCallback, useRef } from "react";

import { HomeChatInput } from "@/components/chat/HomeChatInput";

import { useAppVersion } from "@/hooks/useAppVersion";

import { useTheme } from "@/contexts/ThemeContext";
import { showError } from "@/lib/toast";
import { invalidateAppQuery } from "@/hooks/useLoadApp";
import { useQueryClient } from "@tanstack/react-query";
import { ForceCloseDialog } from "@/components/ForceCloseDialog";

import type { FileAttachment } from "@/ipc/types";
import { NEON_TEMPLATE_IDS, DEFAULT_TEMPLATE_ID } from "@/shared/templates";
import { getEffectiveDefaultChatMode } from "@/lib/schemas";
import { ReleaseNotesDialog } from "@/components/ReleaseNotesDialog";
import { neonTemplateHook } from "@/client_logic/template_hook";

// Adding an export for attachments
export interface HomeSubmitOptions {
  attachments?: FileAttachment[];
}

export default function HomePage() {
  const [inputValue, setInputValue] = useAtom(homeChatInputValueAtom);
  const navigate = useNavigate();
  const search = useSearch({ from: "/" });
  const setSelectedAppId = useSetAtom(selectedAppIdAtom);
  const { refreshApps } = useLoadApps();
  const { settings, updateSettings, envVars } = useSettings();

  const setIsPreviewOpen = useSetAtom(isPreviewOpenAtom);
  const [isLoading, setIsLoading] = useState(false);
  const [forceCloseDialogOpen, setForceCloseDialogOpen] = useState(false);
  const [forceCloseData, setForceCloseData] = useState<{
    performanceData?: any;
    appVersion?: string;
    platform?: string;
    recentLogs?: string;
  }>({});

  const appVersion = useAppVersion();
  const [releaseNotesOpen, setReleaseNotesOpen] = useState(false);
  const { theme, intensity } = useTheme();
  const queryClient = useQueryClient();
  const [selectedDesign, setSelectedDesign] = useAtom(selectedDesignAtom);

  // Listen for force-close events
  useEffect(() => {
    const unsubscribe = ipc.events.system.onForceCloseDetected((data) => {
      setForceCloseData(data);
      setForceCloseDialogOpen(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const updateLastVersionLaunched = async () => {
      if (
        appVersion &&
        settings &&
        settings.lastShownReleaseNotesVersion !== appVersion
      ) {
        const shouldShowReleaseNotes = !!settings.lastShownReleaseNotesVersion;
        await updateSettings({
          lastShownReleaseNotesVersion: appVersion,
        });
        // It feels spammy to show release notes if it's
        // the users very first time.
        if (!shouldShowReleaseNotes) {
          return;
        }

        try {
          const result = await ipc.system.doesReleaseNoteExist({
            version: appVersion,
          });

          if (result.exists) {
            setReleaseNotesOpen(true);
          }
        } catch (err) {
          console.warn(
            "Unable to check if release note exists for: " + appVersion,
            err,
          );
        }
      }
    };
    updateLastVersionLaunched();
  }, [appVersion, settings, updateSettings, theme]);

  // Get the appId from search params
  const appId = search.appId ? Number(search.appId) : null;



  // Redirect to app details page if appId is present
  useEffect(() => {
    if (appId) {
      navigate({ to: "/app-details", search: { appId } });
    }
  }, [appId, navigate]);

  // Apply the user's preferred default chat mode on Home screen for new apps
  const hasAppliedDefaultChatMode = useRef(false);
  useEffect(() => {
    // Wait for settings to load
    if (settings && envVars && !hasAppliedDefaultChatMode.current) {
      hasAppliedDefaultChatMode.current = true;
      const effectiveDefault = getEffectiveDefaultChatMode(settings);
      if (settings.selectedChatMode !== effectiveDefault) {
        updateSettings({ selectedChatMode: effectiveDefault });
      }
    }
  }, [settings, envVars, updateSettings]);

  const handleSubmit = async (options?: HomeSubmitOptions) => {
    const attachments = options?.attachments || [];

    if (!inputValue.trim() && attachments.length === 0) return;

    try {
      setIsLoading(true);

      // Try to generate a title from the prompt
      let appName = generateCuteAppName();
      try {
        const { title } = await ipc.app.generateAppTitle({
          prompt: inputValue,
        });
        if (title) {
          appName = title;
        }
      } catch (error) {
        console.warn("Failed to generate app title, using cute name:", error);
      }

      // Create the chat and navigate
      const result = await ipc.app.createApp({
        name: appName,
        templateId: settings?.selectedTemplateId || DEFAULT_TEMPLATE_ID,
      });
      if (
        settings?.selectedTemplateId &&
        NEON_TEMPLATE_IDS.has(settings.selectedTemplateId)
      ) {
        await neonTemplateHook({
          appId: result.app.id,
          appName: result.app.name,
        });
      }

      // Stream the message in the dedicated chat window (not here — avoids race condition)
      const prompt = inputValue;

      // Convert FileAttachments to base64 ChatAttachments for IPC transfer
      let convertedAttachments: Array<{ name: string; type: string; data: string; attachmentType: "upload-to-codebase" | "chat-context" }> | undefined;
      if (attachments && attachments.length > 0) {
        convertedAttachments = await Promise.all(
          attachments.map(
            (attachment) =>
              new Promise<{ name: string; type: string; data: string; attachmentType: "upload-to-codebase" | "chat-context" }>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => {
                  resolve({
                    name: attachment.file.name,
                    type: attachment.file.type,
                    data: reader.result as string,
                    attachmentType: attachment.type,
                  });
                };
                reader.onerror = () => reject(reader.error);
                reader.readAsDataURL(attachment.file);
              }),
          ),
        );
      }

      setInputValue("");
      setSelectedAppId(result.app.id);
      setIsPreviewOpen(false);
      await refreshApps(); // Ensure refreshApps is awaited if it's async
      await invalidateAppQuery(queryClient, { appId: result.app.id });
      // Install selected design system (DESIGN.md) into the project before opening the chat
      console.log(`[Home] 🎨 DESIGN CHECK — selectedDesign:`, selectedDesign);
      console.log(`[Home] 🎨 DESIGN CHECK — app.path: "${result.app.path}", app.id: ${result.app.id}`);
      if (selectedDesign) {
        console.log(`[Home] 🎨 DESIGN: id="${selectedDesign.id}", hasCustomContent=${!!selectedDesign.customContent}, customContentLen=${selectedDesign.customContent?.length ?? 0}`);
        try {
          if (selectedDesign.customContent) {
            // Custom design — write content directly
            console.log(`[Home] 🎨 DESIGN: Calling writeCustomDesign (content ${selectedDesign.customContent.length} chars, appPath "${result.app.path}")`);
            const writeResult = await ipc.design.writeCustomDesign({ content: selectedDesign.customContent, appPath: result.app.path });
            console.log(`[Home] 🎨 DESIGN: writeCustomDesign result:`, writeResult);
          } else {
            // Brand design — download via getdesign CLI
            console.log(`[Home] 🎨 DESIGN: Calling addDesign (brand "${selectedDesign.id}", appPath "${result.app.path}")`);
            const addResult = await ipc.design.addDesign({ brand: selectedDesign.id, appPath: result.app.path });
            console.log(`[Home] 🎨 DESIGN: addDesign result: contentLen=${addResult?.content?.length}`);
          }
        } catch (designError) {
          // Non-blocking — log but don't prevent app creation
          console.error("[Home] 🎨 DESIGN ERROR:", designError);
        }
        setSelectedDesign(null);
      } else {
        console.log(`[Home] 🎨 DESIGN: No design selected — skipping`);
      }

      // Open chat window with prompt + attachments — the window will start streaming on mount
      ipc.system.openChatWindow({
        appId: result.app.id,
        chatId: result.chatId,
        prompt,
        chatMode: settings?.selectedChatMode || "agent",
        attachments: convertedAttachments,
        theme,
        themeIntensity: intensity,
      });
      navigate({ to: "/app-details", search: { appId: result.app.id } });
    } catch (error) {
      console.error("Failed to create chat:", error);
      showError("Error al crear la aplicación. " + (error as any).toString());
      setIsLoading(false); // Ensure loading state is reset on error
    }
    // No finally block needed for setIsLoading(false) here if navigation happens on success
  };

  // Dynamic loading phases for app creation
  const CREATION_PHASES = [
    { title: "Pensando un nombre genial", subtitle: "La IA está eligiendo el nombre perfecto para tu app…", icon: "💭" },
    { title: "Preparando el proyecto", subtitle: "Creando la estructura de archivos y configuración…", icon: "📁" },
    { title: "Instalando dependencias", subtitle: "Preparando todo lo necesario para tu nueva app…", icon: "📦" },
    { title: "Inicializando el repositorio", subtitle: "Configurando Git para control de versiones…", icon: "🔧" },
    { title: "Aplicando tu tema", subtitle: "Personalizando los estilos y colores de la app…", icon: "🎨" },
    { title: "¡Casi listo!", subtitle: "Abriendo el entorno de desarrollo…", icon: "🚀" },
  ];

  const [creationPhase, setCreationPhase] = useState(0);
  const [phaseVisible, setPhaseVisible] = useState(true);

  useEffect(() => {
    if (!isLoading) {
      setCreationPhase(0);
      setPhaseVisible(true);
      return;
    }

    // Timings that roughly match real operations
    const phaseTimings = [1800, 2200, 3000, 1500, 1200, 5000];
    let timeoutId: NodeJS.Timeout;
    let fadeTimeoutId: NodeJS.Timeout;

    const advancePhase = (currentPhase: number) => {
      if (currentPhase >= CREATION_PHASES.length - 1) return;

      const delay = phaseTimings[currentPhase] || 2000;
      timeoutId = setTimeout(() => {
        // Fade out
        setPhaseVisible(false);
        fadeTimeoutId = setTimeout(() => {
          // Switch phase and fade in
          setCreationPhase(currentPhase + 1);
          setPhaseVisible(true);
          advancePhase(currentPhase + 1);
        }, 300);
      }, delay);
    };

    advancePhase(0);

    return () => {
      clearTimeout(timeoutId);
      clearTimeout(fadeTimeoutId);
    };
  }, [isLoading]);

  // Loading overlay for app creation
  if (isLoading) {
    const phase = CREATION_PHASES[creationPhase];
    return (
      <div className="flex flex-col items-center justify-center w-full min-h-full relative overflow-hidden">
        {/* Ambient glow orbs (same as main view) */}
        <div
          aria-hidden
          className="home-orb home-orb--primary pointer-events-none absolute rounded-full"
          style={{ width: "900px", height: "900px", top: "40%", left: "50%" }}
        />
        <div
          aria-hidden
          className="home-orb home-orb--accent pointer-events-none absolute rounded-full"
          style={{ width: "600px", height: "600px", top: "15%", left: "65%" }}
        />

        <style>{`
          .home-orb {
            transform: translate(-50%, -50%);
            filter: blur(100px);
            z-index: 0;
          }
          .home-orb--primary {
            background: radial-gradient(
              circle,
              color-mix(in oklch, var(--primary) 45%, transparent) 0%,
              color-mix(in oklch, var(--primary) 20%, transparent) 40%,
              transparent 70%
            );
            animation: home-orb-breathe 6s cubic-bezier(0.4, 0, 0.2, 1) infinite;
          }
          .home-orb--accent {
            background: radial-gradient(
              circle,
              color-mix(in oklch, var(--primary) 30%, oklch(0.7 0.15 280 / 0.4)) 0%,
              color-mix(in oklch, var(--primary) 10%, transparent) 50%,
              transparent 70%
            );
            animation: home-orb-breathe 8s cubic-bezier(0.4, 0, 0.2, 1) 1.5s infinite;
          }
          @keyframes home-orb-breathe {
            0%, 100% { transform: translate(-50%, -50%) scale(0.9); opacity: 0.55; }
            50%      { transform: translate(-50%, -50%) scale(1.15); opacity: 0.85; }
          }

          .phase-fade {
            transition: opacity 0.3s ease-in-out, transform 0.3s ease-in-out;
          }
          .phase-fade.visible {
            opacity: 1;
            transform: translateY(0);
          }
          .phase-fade.hidden {
            opacity: 0;
            transform: translateY(8px);
          }

          @keyframes progress-shimmer {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(200%); }
          }
        `}</style>

        <div className="relative z-10 w-full max-w-5xl flex flex-col items-center p-8">
          {/* Loading Spinner */}
          <div className="relative w-24 h-24 mb-8">
            <div className="absolute top-0 left-0 w-full h-full border-8 border-gray-200 dark:border-gray-700 rounded-full"></div>
            <div className="absolute top-0 left-0 w-full h-full border-8 border-t-primary rounded-full animate-spin"></div>
          </div>

          <div className="relative w-full" style={{ minHeight: '5rem' }}>
            <div className={`phase-fade ${phaseVisible ? 'visible' : 'hidden'} flex flex-col items-center w-full`}>
              <h2 className="typo-section-title mb-2">
                {phase.title}
              </h2>
              <p className="typo-caption text-center max-w-md mb-6">
                {phase.subtitle}
              </p>
            </div>
          </div>

          {/* Progress dots */}
          <div className="flex items-center gap-2 mt-2">
            {CREATION_PHASES.map((_, i) => (
              <div
                key={i}
                className="rounded-full transition-[width,background-color,opacity] duration-500"
                style={{
                  width: i === creationPhase ? 24 : 8,
                  height: 8,
                  backgroundColor: i <= creationPhase
                    ? 'var(--primary)'
                    : 'var(--muted)',
                  opacity: i <= creationPhase ? 1 : 0.3,
                }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Main Home Page Content
  return (
    <div className="flex flex-col items-center justify-center w-full min-h-full relative overflow-hidden">
      {/* ═══ Premium ambient background ═══ */}
      {/* Primary orb — centered */}
      <div
        aria-hidden
        className="home-orb home-orb--primary pointer-events-none absolute rounded-full"
        style={{ width: "900px", height: "900px", top: "35%", left: "50%" }}
      />
      {/* Secondary accent orb — top-right, shifted hue */}
      <div
        aria-hidden
        className="home-orb home-orb--accent pointer-events-none absolute rounded-full"
        style={{ width: "600px", height: "600px", top: "10%", left: "70%" }}
      />
      {/* Tertiary soft orb — bottom-left */}
      <div
        aria-hidden
        className="home-orb home-orb--soft pointer-events-none absolute rounded-full"
        style={{ width: "500px", height: "500px", top: "65%", left: "20%" }}
      />

      {/* Subtle dot-grid overlay for depth */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[1]"
        style={{
          backgroundImage: "radial-gradient(circle, var(--foreground) 0.4px, transparent 0.4px)",
          backgroundSize: "24px 24px",
          opacity: 0.03,
        }}
      />

      <style>{`
        /* ── Ambient glow orbs ── */
        .home-orb {
          transform: translate(-50%, -50%);
          filter: blur(100px);
          z-index: 0;
        }
        .home-orb--primary {
          background: radial-gradient(
            circle,
            color-mix(in oklch, var(--primary) 45%, transparent) 0%,
            color-mix(in oklch, var(--primary) 20%, transparent) 40%,
            transparent 70%
          );
          animation: home-orb-breathe 6s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }
        .home-orb--accent {
          background: radial-gradient(
            circle,
            color-mix(in oklch, var(--primary) 30%, oklch(0.7 0.15 280 / 0.4)) 0%,
            color-mix(in oklch, var(--primary) 10%, transparent) 50%,
            transparent 70%
          );
          animation: home-orb-breathe 8s cubic-bezier(0.4, 0, 0.2, 1) 1.5s infinite;
        }
        .home-orb--soft {
          background: radial-gradient(
            circle,
            color-mix(in oklch, var(--primary) 25%, oklch(0.7 0.12 200 / 0.35)) 0%,
            transparent 60%
          );
          animation: home-orb-breathe 7s cubic-bezier(0.4, 0, 0.2, 1) 3s infinite;
        }
        @keyframes home-orb-breathe {
          0%, 100% { transform: translate(-50%, -50%) scale(0.9); opacity: 0.55; }
          50%      { transform: translate(-50%, -50%) scale(1.15); opacity: 0.85; }
        }

        }
      `}</style>

      <div className="relative z-10 w-full max-w-5xl flex flex-col items-center p-8">
        <ForceCloseDialog
          isOpen={forceCloseDialogOpen}
          onClose={() => setForceCloseDialogOpen(false)}
          performanceData={forceCloseData.performanceData}
          appVersion={forceCloseData.appVersion}
          platform={forceCloseData.platform}
          recentLogs={forceCloseData.recentLogs}
        />
        <SetupBanner />

        <div className="w-full">
          <HomeChatInput onSubmit={handleSubmit} />
        </div>

        <ReleaseNotesDialog
          isOpen={releaseNotesOpen}
          onOpenChange={setReleaseNotesOpen}
        />
      </div>
    </div>
  );
}
