import { useAtom, useAtomValue } from "jotai";
import { pendingVisualChangesAtom } from "@/atoms/previewAtoms";
import { Button } from "@/components/ui/button";
import { ipc } from "@/ipc/types";
import { Check, X } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { showError, showSuccess } from "@/lib/toast";
import { selectedAppIdAtom } from "@/atoms/appAtoms";

interface VisualEditingChangesDialogProps {
  onReset?: () => void;
  iframeRef?: React.RefObject<HTMLIFrameElement | null>;
}

export function VisualEditingChangesDialog({
  onReset,
  iframeRef,
}: VisualEditingChangesDialogProps) {
  const [pendingChanges, setPendingChanges] = useAtom(pendingVisualChangesAtom);
  const selectedAppId = useAtomValue(selectedAppIdAtom);
  const [isSaving, setIsSaving] = useState(false);
  const textContentCache = useRef<Map<string, string>>(new Map());
  const [allResponsesReceived, setAllResponsesReceived] = useState(false);
  const expectedResponsesRef = useRef<Set<string>>(new Set());
  const isWaitingForResponses = useRef(false);

  // Listen for text content responses
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "vibes-text-content-response") {
        const { componentId, text } = event.data;
        if (text !== null) {
          textContentCache.current.set(componentId, text);
        }

        // Mark this response as received
        expectedResponsesRef.current.delete(componentId);

        // Check if all responses received (only if we're actually waiting)
        if (
          isWaitingForResponses.current &&
          expectedResponsesRef.current.size === 0
        ) {
          setAllResponsesReceived(true);
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // Execute when all responses are received
  useEffect(() => {
    if (allResponsesReceived && isSaving) {
      const applyChanges = async () => {
        try {
          const changesToSave = Array.from(pendingChanges.values());

          // Update changes with cached text content (only as fallback if not already set by panel)
          const updatedChanges = changesToSave.map((change) => {
            // If textContent was explicitly set (e.g., from text editing panel), keep it
            if (change.textContent) {
              return change;
            }
            // Otherwise, use the cached text from the iframe (if available)
            const cachedText = textContentCache.current.get(change.componentId);
            if (cachedText !== undefined) {
              return { ...change, textContent: cachedText };
            }
            return change;
          });

          await ipc.visualEditing.applyChanges({
            appId: selectedAppId!,
            changes: updatedChanges,
          });

          setPendingChanges(new Map());
          textContentCache.current.clear();
          showSuccess("Visual changes saved to source files");
          onReset?.();
        } catch (error) {
          console.error("Failed to save visual editing changes:", error);
          showError(`Failed to save changes: ${error}`);
        } finally {
          setIsSaving(false);
          setAllResponsesReceived(false);
          isWaitingForResponses.current = false;
        }
      };

      applyChanges();
    }
  }, [
    allResponsesReceived,
    isSaving,
    pendingChanges,
    selectedAppId,
    onReset,
    setPendingChanges,
  ]);

  if (pendingChanges.size === 0) return null;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const changesToSave = Array.from(pendingChanges.values());

      // Separate changes that already have textContent from those that need iframe text
      const changesNeedingIframeText = changesToSave.filter(
        (change) => !change.textContent && change.textContent !== "",
      );

      if (changesNeedingIframeText.length > 0 && iframeRef?.current?.contentWindow) {
        // Reset state for new request
        setAllResponsesReceived(false);
        expectedResponsesRef.current.clear();
        isWaitingForResponses.current = true;

        // Only track components that actually need text from iframe
        for (const change of changesNeedingIframeText) {
          expectedResponsesRef.current.add(change.componentId);
        }

        // Request text content only for components that need it
        for (const change of changesNeedingIframeText) {
          iframeRef.current.contentWindow.postMessage(
            {
              type: "get-vibes-text-content",
              data: { componentId: change.componentId },
            },
            "*",
          );
        }

        // Safety timeout: if iframe doesn't respond within 2 seconds, proceed anyway
        setTimeout(() => {
          if (isWaitingForResponses.current && expectedResponsesRef.current.size > 0) {
            console.warn("Timeout waiting for iframe text responses, proceeding with save");
            expectedResponsesRef.current.clear();
            setAllResponsesReceived(true);
          }
        }, 2000);
      } else {
        // All changes already have textContent or no iframe — save directly
        await ipc.visualEditing.applyChanges({
          appId: selectedAppId!,
          changes: changesToSave,
        });

        setPendingChanges(new Map());
        textContentCache.current.clear();
        showSuccess("Visual changes saved to source files");
        onReset?.();
        setIsSaving(false);
      }
    } catch (error) {
      console.error("Failed to save visual editing changes:", error);
      showError(`Failed to save changes: ${error}`);
      setIsSaving(false);
      isWaitingForResponses.current = false;
    }
  };

  const handleDiscard = () => {
    setPendingChanges(new Map());
    onReset?.();
  };

  return (
    <div className="bg-[var(--background)] border-b border-[var(--border)] px-2 lg:px-4 py-1.5 flex flex-col lg:flex-row items-start lg:items-center lg:justify-between gap-1.5 lg:gap-4 flex-wrap">
      <p className="text-xs lg:text-sm w-full lg:w-auto">
        <span className="font-medium">{pendingChanges.size}</span> component
        {pendingChanges.size > 1 ? "s" : ""} modified
      </p>
      <div className="flex gap-1 lg:gap-2 w-full lg:w-auto flex-wrap">
        <Button size="sm" onClick={handleSave} disabled={isSaving}>
          <Check size={14} className="mr-1" />
          <span>{isSaving ? "Guardando..." : "Guardar cambios"}</span>
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={handleDiscard}
          disabled={isSaving}
        >
          <X size={14} className="mr-1" />
          <span>Discard</span>
        </Button>
      </div>
    </div>
  );
}
