import { useAtom, useAtomValue } from "jotai";
import { artifactsSidebarOpenAtom, selectedArtifactPathAtom } from "@/atoms/uiAtoms";
import { selectedAppIdAtom } from "@/atoms/appAtoms";
import { useQuery } from "@tanstack/react-query";
import { ipc } from "@/ipc/types";
import { Panel, PanelResizeHandle } from "react-resizable-panels";
import { X, GripVertical, Loader2, Share2 } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { VibesMarkdownParser } from "./VibesMarkdownParser";
import { useMemo, useState, useCallback } from "react";
import { showSuccess, showError } from "@/lib/toast";

/**
 * Extract the first H1 heading from markdown content.
 * Returns { title, body } where body keeps the H1 for standalone viewing
 * but the sidebar strips it from the rendered output.
 */
function extractH1(raw: string): { title: string | null; body: string } {
  const match = raw.match(/^(#\s+.+)\r?\n?/m);
  if (!match) return { title: null, body: raw };
  const title = match[1].replace(/^#\s+/, "").trim();
  // Remove the H1 line (and any blank line right after it) from the body
  const body = raw.replace(match[0], "").replace(/^\s*\n/, "");
  return { title, body };
}

export function ArtifactSidebar() {
  const [isOpen, setIsOpen] = useAtom(artifactsSidebarOpenAtom);
  const path = useAtomValue(selectedArtifactPathAtom);
  const appId = useAtomValue(selectedAppIdAtom);

  const { data: content, isLoading, error } = useQuery({
    queryKey: ["chatArtifactContent", appId, path],
    queryFn: async () => {
      if (!appId || !path) return null;
      return await ipc.chat.getChatArtifactContent({ appId, path });
    },
    enabled: isOpen && !!appId && !!path,
  });

  // Parse H1 and strip it from rendered body
  const { title, body } = useMemo(() => {
    if (!content) return { title: null, body: "" };
    return extractH1(content);
  }, [content]);

  // Share artifact via md.mnstatic.com
  const [isSharing, setIsSharing] = useState(false);
  const handleShare = useCallback(async () => {
    if (isSharing || !content) return;
    setIsSharing(true);
    try {
      const shareTitle = title || (path ? path.split("/").pop() : "Artefacto") || "Artefacto";
      const result = await ipc.markdownShare.uploadDocument({
        title: shareTitle,
        content: content,
        format: "md",
      });
      await navigator.clipboard.writeText(result.data.share_url);
      showSuccess("URL del artefacto copiada al portapapeles");
    } catch (e) {
      showError(e);
    } finally {
      setIsSharing(false);
    }
  }, [isSharing, content, title, path]);

  if (!isOpen) return null;

  const displayTitle = title || (path ? path.split("/").pop() : "Artefacto");

  return (
    <>
      <PanelResizeHandle className="relative flex w-px items-center justify-center bg-border after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 cursor-col-resize">
        <div className="z-10 flex h-4 w-3 items-center justify-center rounded-sm border bg-border dark:bg-zinc-800">
          <GripVertical className="h-2.5 w-2.5 text-zinc-500" />
        </div>
      </PanelResizeHandle>
      <Panel
        id="artifact-sidebar"
        order={4}
        minSize={20}
        defaultSize={30}
        className="flex flex-col bg-sidebar border-l border-border/50 h-full"
      >
        {/* Header with title + actions */}
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border/50">
          <h1
            className="text-base font-bold truncate leading-tight"
            title={displayTitle ?? undefined}
          >
            {displayTitle}
          </h1>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleShare}
              disabled={isSharing || !content}
              title="Compartir artefacto"
            >
              {isSharing ? (
                <Loader2 className="animate-spin" size={14} />
              ) : (
                <Share2 size={14} />
              )}
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIsOpen(false)}>
              <X size={14} />
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          {isLoading ? (
            <div className="flex justify-center items-center h-full">
              <Loader2 className="animate-spin text-muted-foreground" size={24} />
            </div>
          ) : error ? (
            <div className="text-destructive text-sm text-center mt-10">
              Error al cargar el artefacto: {(error as Error).message}
            </div>
          ) : body ? (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <VibesMarkdownParser content={body} forceFullMode />
            </div>
          ) : (
            <div className="text-muted-foreground text-sm text-center mt-10">
              No se encontró contenido.
            </div>
          )}
        </div>
      </Panel>
    </>
  );
}
