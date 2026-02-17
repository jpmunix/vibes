import { useNavigate, useSearch } from "@tanstack/react-router";
import { useAtom, useSetAtom } from "jotai";
import { homeChatInputValueAtom } from "../atoms/chatAtoms";
import { selectedAppIdAtom } from "@/atoms/appAtoms";
import { ipc } from "@/ipc/types";
import { generateCuteAppName } from "@/lib/utils";
import { useLoadApps } from "@/hooks/useLoadApps";
import { useSettings } from "@/hooks/useSettings";
import { SetupBanner } from "@/components/SetupBanner";
import { isPreviewOpenAtom } from "@/atoms/viewAtoms";
import { useState, useEffect, useCallback, useRef } from "react";

import { HomeChatInput } from "@/components/chat/HomeChatInput";
import { usePostHog } from "posthog-js/react";
import { INSPIRATION_PROMPTS } from "@/prompts/inspiration_prompts";
import { useAppVersion } from "@/hooks/useAppVersion";

import { useTheme } from "@/contexts/ThemeContext";
import { showError } from "@/lib/toast";
import { invalidateAppQuery } from "@/hooks/useLoadApp";
import { useQueryClient } from "@tanstack/react-query";
import { ForceCloseDialog } from "@/components/ForceCloseDialog";

import type { FileAttachment } from "@/ipc/types";
import { NEON_TEMPLATE_IDS } from "@/shared/templates";
import { getEffectiveDefaultChatMode } from "@/lib/schemas";
import { useFreeAgentQuota } from "@/hooks/useFreeAgentQuota";
import { ReleaseNotesDialog } from "@/components/ReleaseNotesDialog";

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
  const { isQuotaExceeded, isLoading: isQuotaLoading } = useFreeAgentQuota();

  const setIsPreviewOpen = useSetAtom(isPreviewOpenAtom);
  const [isLoading, setIsLoading] = useState(false);
  const [forceCloseDialogOpen, setForceCloseDialogOpen] = useState(false);
  const [forceCloseData, setForceCloseData] = useState<{
    performanceData?: any;
    appVersion?: string;
    platform?: string;
    recentLogs?: string;
  }>({});

  const posthog = usePostHog();
  const appVersion = useAppVersion();
  const [releaseNotesOpen, setReleaseNotesOpen] = useState(false);
  const { theme, intensity } = useTheme();
  const queryClient = useQueryClient();

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

  // State for random prompts
  const [randomPrompts, setRandomPrompts] = useState<
    typeof INSPIRATION_PROMPTS
  >([]);

  // Function to get random prompts using Fisher-Yates shuffle for true randomness
  const getRandomPrompts = useCallback(() => {
    const shuffled = [...INSPIRATION_PROMPTS];
    // Fisher-Yates shuffle algorithm for true randomness
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, 6);
  }, []);

  // Initialize random prompts
  useEffect(() => {
    setRandomPrompts(getRandomPrompts());
  }, [getRandomPrompts]);

  // Redirect to app details page if appId is present
  useEffect(() => {
    if (appId) {
      navigate({ to: "/app-details", search: { appId } });
    }
  }, [appId, navigate]);

  // Enforce "plan" mode as the absolute default on Home screen for new apps
  const hasAppliedDefaultChatMode = useRef(false);
  useEffect(() => {
    // Wait for settings to load
    if (settings && !hasAppliedDefaultChatMode.current) {
      hasAppliedDefaultChatMode.current = true;
      // Always force Plan mode on Home screen, regardless of user preferences or quota
      if (settings.selectedChatMode !== "plan") {
        updateSettings({ selectedChatMode: "plan" });
      }
    }
  }, [settings, updateSettings]);

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

      // Apply selected theme to the new app (if one is set)
      if (settings?.selectedThemeId) {
        await ipc.template.setAppTheme({
          appId: result.app.id,
          themeId: settings.selectedThemeId || null,
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
      posthog.capture("home:chat-submit");
      // Open chat window with prompt + attachments — the window will start streaming on mount
      ipc.system.openChatWindow({
        appId: result.app.id,
        chatId: result.chatId,
        prompt,
        chatMode: settings?.selectedChatMode || "plan",
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

  // Loading overlay for app creation
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center w-full min-h-full relative overflow-hidden">
        {/* Glow background effect */}
        <div
          aria-hidden
          className="glow-breath pointer-events-none absolute rounded-full"
          style={{
            width: "1400px",
            height: "1400px",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
          }}
        />

        <style>{`
          @keyframes breathe {
            0% {
              transform: translate(-50%, -50%) scale(0.9);
              opacity: 0.3;
              filter: blur(80px);
            }
            50% {
              transform: translate(-50%, -50%) scale(1.1);
              opacity: 0.5;
              filter: blur(100px);
            }
            100% {
              transform: translate(-50%, -50%) scale(0.9);
              opacity: 0.3;
              filter: blur(80px);
            }
          }

          .glow-breath {
            background: radial-gradient(
              circle,
              var(--primary) 0%,
              color-mix(in oklch, var(--primary) 55%, transparent) 20%,
              color-mix(in oklch, var(--primary) 30%, transparent) 40%,
              color-mix(in oklch, var(--primary) 12%, transparent) 60%,
              color-mix(in oklch, var(--primary) 4%, transparent) 80%,
              transparent 100%
            );
            animation: breathe 5s cubic-bezier(0.4, 0, 0.2, 1) infinite;
            z-index: 0;
          }
        `}</style>

        <div className="relative z-10 w-full max-w-5xl flex flex-col items-center p-8">
          {/* Loading Spinner */}
          <div className="relative w-24 h-24 mb-8">
            <div className="absolute top-0 left-0 w-full h-full border-8 border-gray-200 dark:border-gray-700 rounded-full"></div>
            <div className="absolute top-0 left-0 w-full h-full border-8 border-t-primary rounded-full animate-spin"></div>
          </div>
          <h2 className="text-2xl font-bold mb-2 text-gray-800 dark:text-gray-200">
            Construyendo tu aplicación
          </h2>
          <p className="text-gray-600 dark:text-gray-400 text-center max-w-md mb-8">
            Estamos configurando tu app con magia de IA. <br />
            Esto puede tardar un momento.
          </p>
        </div>
      </div>
    );
  }

  // Main Home Page Content
  return (
    <div className="flex flex-col items-center justify-center w-full min-h-full relative overflow-hidden">
      {/* Glow background effect */}
      <div
        aria-hidden
        className="glow-breath pointer-events-none absolute rounded-full"
        style={{
          width: "1400px",
          height: "1400px",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
        }}
      />

      <style>{`
        @keyframes breathe {
          0% {
            transform: translate(-50%, -50%) scale(0.9);
            opacity: 0.3;
            filter: blur(80px);
          }
          50% {
            transform: translate(-50%, -50%) scale(1.1);
            opacity: 0.5;
            filter: blur(100px);
          }
          100% {
            transform: translate(-50%, -50%) scale(0.9);
            opacity: 0.3;
            filter: blur(80px);
          }
        }

        .glow-breath {
          background: radial-gradient(
            circle,
            var(--primary) 0%,
            color-mix(in oklch, var(--primary) 55%, transparent) 20%,
            color-mix(in oklch, var(--primary) 30%, transparent) 40%,
            color-mix(in oklch, var(--primary) 12%, transparent) 60%,
            color-mix(in oklch, var(--primary) 4%, transparent) 80%,
            transparent 100%
          );
          animation: breathe 5s cubic-bezier(0.4, 0, 0.2, 1) infinite;
          z-index: 0;
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

          <div className="flex flex-col gap-4 mt-2">
            <div className="flex flex-wrap gap-4 justify-center">
              {randomPrompts.map((item, index) => (
                <button
                  type="button"
                  key={index}
                  onClick={() =>
                    setInputValue(`Constrúyeme ${item.label.toLowerCase()}`)
                  }
                  className="flex items-center gap-3 px-4 py-2 rounded-xl border border-primary/20
                             bg-primary/5 backdrop-blur-sm
                             transition-colors duration-200
                             hover:bg-primary/10 hover:shadow-md hover:border-primary/30
                             active:scale-[0.98]"
                >
                  <span className="text-foreground/70">
                    {item.icon}
                  </span>
                  <span className="text-sm font-medium text-foreground/70">
                    {item.label}
                  </span>
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setRandomPrompts(getRandomPrompts())}
              className="self-center flex items-center gap-2 px-4 py-2 rounded-xl border border-primary/20
                         bg-primary/5 backdrop-blur-sm
                         transition-colors duration-200
                         hover:bg-primary/10 hover:shadow-md hover:border-primary/30
                         active:scale-[0.98]"
            >
              <svg
                className="w-5 h-5 text-foreground/70"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              <span className="text-sm font-medium text-foreground/70">
                Más ideas
              </span>
            </button>
          </div>
        </div>
        {/*<PrivacyBanner />*/}

        <ReleaseNotesDialog
          isOpen={releaseNotesOpen}
          onOpenChange={setReleaseNotesOpen}
        />
      </div>
    </div>
  );
}
