import { useAtom, useAtomValue } from "jotai";
import {
  appConsoleEntriesAtom,
  previewModeAtom,
  previewPanelKeyAtom,
  selectedAppIdAtom,
} from "../../atoms/appAtoms";

import React, { Suspense } from "react";

// Lazy load CodeView to defer Monaco Editor initialization (~3.4s CPU savings)
// Monaco is only needed when user clicks the "Code" tab
const CodeView = React.lazy(() =>
  import("./CodeView").then((m) => ({ default: m.CodeView }))
);

const PreviewIframe = React.lazy(() =>
  import("./PreviewIframe").then((m) => ({ default: m.PreviewIframe }))
);
import { Problems } from "./Problems";
import { ChevronDown, ChevronUp, Logs } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PanelGroup, Panel, PanelResizeHandle } from "react-resizable-panels";
import { Console } from "./Console";
import { ConsoleTerminal } from "./ConsoleTerminal";
import { useRunApp } from "@/hooks/useRunApp";
import { useSupabase } from "@/hooks/useSupabase";
import { VersionPane } from "../chat/VersionPane";
import { cn } from "@/lib/utils";
import {
  naturalEditingPanelOpenAtom,
  visualEditingSelectedComponentAtom,
  previewIframeRefAtom,
} from "@/atoms/previewAtoms";
import { isPreviewExpandedAtom } from "@/atoms/viewAtoms";

// Lazy load heavy panels — they are only needed when user switches to their specific tab
const ConfigurePanel = React.lazy(() =>
  import("./ConfigurePanel").then((m) => ({ default: m.ConfigurePanel }))
);
const SecurityPanel = React.lazy(() =>
  import("./SecurityPanel").then((m) => ({ default: m.SecurityPanel }))
);
const PublishPanel = React.lazy(() =>
  import("./PublishPanel").then((m) => ({ default: m.PublishPanel }))
);
const GitPanel = React.lazy(() =>
  import("../GitPanel").then((m) => ({ default: m.GitPanel }))
);
const DatabasePanel = React.lazy(() =>
  import("../database/DatabasePanel").then((m) => ({ default: m.DatabasePanel }))
);
const NaturalEditingPanel = React.lazy(() =>
  import("./NaturalEditingPanel").then((m) => ({ default: m.NaturalEditingPanel }))
);

// Lightweight fallback for lazy-loaded panels
const LazyFallback = ({ text = "Cargando..." }: { text?: string }) => (
  <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
    {text}
  </div>
);

interface ConsoleHeaderProps {
  isOpen: boolean;
  onToggle: () => void;
  latestMessage?: string;
  consoleView: "logs" | "terminal";
  onViewChange: (view: "logs" | "terminal") => void;
}

// Console header component
const ConsoleHeader = ({
  isOpen,
  onToggle,
  latestMessage,
  consoleView,
  onViewChange,
}: ConsoleHeaderProps) => (
  <div className="flex items-center gap-2 px-4 py-1.5 border-t border-border bg-background">
    <div
      onClick={onToggle}
      className="flex items-start gap-2 cursor-pointer hover:bg-[var(--background-darkest)] transition-colors flex-1 min-w-0"
    >
      <Logs size={16} className="mt-0.5 shrink-0" />
      <div className="flex flex-col min-w-0">
        <span className="text-sm font-medium whitespace-nowrap">
          {consoleView === "logs" ? "Mensajes del sistema" : "Consola"}
        </span>
        {!isOpen && latestMessage && (
          <span className="text-xs text-gray-500 truncate max-w-[200px] md:max-w-[400px]">
            {latestMessage}
          </span>
        )}
      </div>
    </div>

    {isOpen && (
      <div className="flex items-center bg-muted rounded-md p-0.5 mr-2">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onViewChange("logs");
          }}
          className={cn(
            "px-2 py-0.5 text-[10px] font-medium rounded transition-colors",
            consoleView === "logs"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Logs
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onViewChange("terminal");
          }}
          className={cn(
            "px-2 py-0.5 text-[10px] font-medium rounded transition-colors",
            consoleView === "terminal"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Console
        </button>
      </div>
    )}

    <div
      onClick={onToggle}
      className="cursor-pointer hover:bg-[var(--background-darkest)] p-1 rounded transition-colors"
    >
      {isOpen ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
    </div>
  </div>
);

// Main PreviewPanel component
export function PreviewPanel() {
  const [previewMode, setPreviewMode] = useAtom(previewModeAtom);
  const selectedAppId = useAtomValue(selectedAppIdAtom);
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);
  const [consoleView, setConsoleView] = useState<"logs" | "terminal">("logs");
  const { runApp, stopApp, loading, app } = useRunApp();
  const { loadEdgeLogs } = useSupabase();
  const runningAppIdRef = useRef<number | null>(null);
  const key = useAtomValue(previewPanelKeyAtom);
  const consoleEntries = useAtomValue(appConsoleEntriesAtom);

  // Natural Editing Panel atoms
  const naturalEditingPanelOpen = useAtomValue(naturalEditingPanelOpenAtom);
  const visualEditingSelectedComponent = useAtomValue(visualEditingSelectedComponentAtom);
  const previewIframeRef = useAtomValue(previewIframeRefAtom);
  const isPreviewExpanded = useAtomValue(isPreviewExpandedAtom);

  const latestMessage =
    consoleEntries.length > 0
      ? consoleEntries[consoleEntries.length - 1]?.message
      : undefined;

  useEffect(() => {
    const previousAppId = runningAppIdRef.current;

    // Check if the selected app ID has changed
    if (selectedAppId !== previousAppId) {
      // Stop the previously running app, if any
      if (previousAppId !== null) {
        console.debug("Stopping previous app", previousAppId);
        stopApp(previousAppId);
        // We don't necessarily nullify the ref here immediately,
        // let the start of the next app update it or unmount handle it.
      }

      // Start the new app if an ID is selected
      if (selectedAppId !== null) {
        console.debug("Starting new app", selectedAppId);
        runApp(selectedAppId); // Consider adding error handling for the promise if needed
        runningAppIdRef.current = selectedAppId; // Update ref to the new running app ID
      } else {
        // If selectedAppId is null, ensure no app is marked as running
        runningAppIdRef.current = null;
      }
    }

    // Cleanup function: This runs when the component unmounts OR before the effect runs again.
    // We only want to stop the app on actual unmount. The logic above handles stopping
    // when the appId changes. So, we capture the running appId at the time the effect renders.
    const appToStopOnUnmount = runningAppIdRef.current;
    return () => {
      if (appToStopOnUnmount !== null) {
        const currentRunningApp = runningAppIdRef.current;
        if (currentRunningApp !== null) {
          console.debug(
            "Component unmounting or selectedAppId changing, stopping app",
            currentRunningApp,
          );
          stopApp(currentRunningApp);
          runningAppIdRef.current = null; // Clear ref on stop
        }
      }
    };
    // Dependencies: run effect when selectedAppId changes.
    // runApp/stopApp are stable due to useCallback.
  }, [selectedAppId, runApp, stopApp]);

  // Load edge logs if app has Supabase project configured
  useEffect(() => {
    const projectId = app?.supabaseProjectId;
    const organizationSlug = app?.supabaseOrganizationSlug ?? undefined;
    if (!projectId) return;

    // Load logs immediately
    loadEdgeLogs({ projectId, organizationSlug }).catch((error) => {
      console.error("Failed to load edge logs:", error);
    });

    // Poll for new logs every 5 seconds
    const intervalId = setInterval(() => {
      loadEdgeLogs({ projectId, organizationSlug }).catch((error) => {
        console.error("Failed to load edge logs:", error);
      });
    }, 5000);

    return () => clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app?.supabaseProjectId, app?.supabaseOrganizationSlug]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-hidden">
        <PanelGroup direction="vertical">
          <Panel id="content" minSize={30}>
            <div className="h-full overflow-y-auto">
              {previewMode === "versions" ? (
                <VersionPane
                  isVisible={true}
                  onClose={() => setPreviewMode("preview")}
                />
              ) : previewMode === "git" ? (
                <Suspense fallback={<LazyFallback />}>
                  <GitPanel
                    onClose={() => setPreviewMode("preview")}
                  />
                </Suspense>
              ) : previewMode === "preview" ? (
                <div className="flex h-full">
                  <div className="flex-1 min-w-0 h-full">
                    <Suspense fallback={<LazyFallback />}>
                      <PreviewIframe key={key} loading={loading} />
                    </Suspense>
                  </div>
                  {naturalEditingPanelOpen &&
                    visualEditingSelectedComponent && (
                      <Suspense fallback={<LazyFallback />}>
                        <NaturalEditingPanel
                          selectedComponent={visualEditingSelectedComponent}
                          iframeRef={previewIframeRef}
                        />
                      </Suspense>
                    )}
                </div>
              ) : previewMode === "code" ? (
                <Suspense fallback={<LazyFallback text="Cargando editor..." />}>
                  <CodeView loading={loading} app={app} />
                </Suspense>
              ) : previewMode === "configure" ? (
                <Suspense fallback={<LazyFallback />}>
                  <ConfigurePanel />
                </Suspense>
              ) : previewMode === "publish" ? (
                <Suspense fallback={<LazyFallback />}>
                  <PublishPanel />
                </Suspense>
              ) : previewMode === "security" ? (
                <Suspense fallback={<LazyFallback />}>
                  <SecurityPanel />
                </Suspense>
              ) : previewMode === "database" ? (
                <Suspense fallback={<LazyFallback />}>
                  <DatabasePanel />
                </Suspense>
              ) : (
                <Problems />
              )}
            </div>
          </Panel>
          {!isPreviewExpanded && isConsoleOpen && (
            <>
              <PanelResizeHandle className="h-1 bg-border hover:bg-gray-400 transition-colors cursor-row-resize" />
              <Panel id="console" minSize={10} defaultSize={30}>
                <div className="flex flex-col h-full">
                  <ConsoleHeader
                    isOpen={true}
                    onToggle={() => setIsConsoleOpen(false)}
                    latestMessage={latestMessage}
                    consoleView={consoleView}
                    onViewChange={setConsoleView}
                  />
                  {consoleView === "logs" ? <Console /> : <ConsoleTerminal />}
                </div>
              </Panel>
            </>
          )}
        </PanelGroup>
      </div>
      {!isPreviewExpanded && !isConsoleOpen && (
        <ConsoleHeader
          isOpen={false}
          onToggle={() => setIsConsoleOpen(true)}
          latestMessage={latestMessage}
          consoleView={consoleView}
          onViewChange={setConsoleView}
        />
      )}
    </div>
  );
}
