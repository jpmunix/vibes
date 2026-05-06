import { useAtom, useAtomValue } from "jotai";
import { artifactsSidebarOpenAtom, selectedArtifactPathAtom } from "@/atoms/uiAtoms";
import { selectedAppIdAtom } from "@/atoms/appAtoms";
import { useQuery } from "@tanstack/react-query";
import { ipc } from "@/ipc/types";
import { Panel, PanelResizeHandle } from "react-resizable-panels";
import { X, GripVertical, Loader2 } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { VibesMarkdownParser } from "./VibesMarkdownParser";

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

  if (!isOpen) return null;

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
        <div className="flex items-center justify-between p-3 border-b border-border/50">
          <div className="flex flex-col overflow-hidden">
            <span className="font-semibold text-sm truncate">{path ? path.split('/').pop() : "Artefacto"}</span>
            {path && <span className="text-xs text-muted-foreground truncate">{path}</span>}
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setIsOpen(false)}>
            <X size={16} />
          </Button>
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
          ) : content ? (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <VibesMarkdownParser content={content} forceFullMode />
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
