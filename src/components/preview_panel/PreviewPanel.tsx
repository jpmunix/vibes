import { useAtom, useAtomValue } from "jotai";
import {
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
import { useEffect, useRef } from "react";
import { PanelGroup, Panel, PanelResizeHandle } from "react-resizable-panels";
import { useRunApp } from "@/hooks/useRunApp";
import { useSupabase } from "@/hooks/useSupabase";
import { VersionPane } from "../chat/VersionPane";
import { cn } from "@/lib/utils";
import {
  naturalEditingPanelOpenAtom,
  visualEditingSelectedComponentAtom,
  previewIframeRefAtom,
} from "@/atoms/previewAtoms";


// Lazy load heavy panels — they are only needed when user switches to their specific tab
const ConfigurePanel = React.lazy(() =>
  import("./ConfigurePanel").then((m) => ({ default: m.ConfigurePanel }))
);
const PublishPanel = React.lazy(() =>
  import("./PublishPanel").then((m) => ({ default: m.PublishPanel }))
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

// Main PreviewPanel component
export function PreviewPanel() {
  const [previewMode, setPreviewMode] = useAtom(previewModeAtom);
  const selectedAppId = useAtomValue(selectedAppIdAtom);
  const { runApp, stopApp, loading, app } = useRunApp();
  const { loadEdgeLogs } = useSupabase();
  const runningAppIdRef = useRef<number | null>(null);
  const key = useAtomValue(previewPanelKeyAtom);

  // Natural Editing Panel atoms
  const naturalEditingPanelOpen = useAtomValue(naturalEditingPanelOpenAtom);
  const visualEditingSelectedComponent = useAtomValue(visualEditingSelectedComponentAtom);
  const previewIframeRef = useAtomValue(previewIframeRefAtom);

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
        <div className={cn("h-full", previewMode === "versions" ? "overflow-hidden" : "overflow-y-auto")}>
          {previewMode === "versions" ? (
            <PanelGroup direction="horizontal">
              <Panel id="version-list" defaultSize={35} minSize={20} maxSize={50}>
                <VersionPane
                  isVisible={true}
                  onClose={() => setPreviewMode("preview")}
                />
              </Panel>
              <PanelResizeHandle className="relative flex w-px h-full items-center justify-center bg-border after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 cursor-col-resize" />
              <Panel id="version-preview" minSize={30}>
                <Suspense fallback={<LazyFallback />}>
                  <PreviewIframe key={key} loading={loading} />
                </Suspense>
              </Panel>
            </PanelGroup>
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
          ) : (
            <Problems />
          )}
        </div>
      </div>
    </div>
  );
}
