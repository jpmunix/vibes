import { FileEditor } from "./FileEditor";
import { FileTree } from "./FileTree";
import { lazy, Suspense, useEffect, useState } from "react";
import { useLoadApp } from "@/hooks/useLoadApp";
import { RefreshCw, Maximize2, Minimize2, TestTube, Loader2 } from "@/components/ui/icons";
import { useAtomValue } from "jotai";
import { selectedFileAtom } from "@/atoms/viewAtoms";

// Lazy-load the Sandpack explorer to avoid bundling it when not used
const SandpackExplorer = lazy(() =>
  import("./SandpackExplorer").then((m) => ({ default: m.SandpackExplorer })),
);

interface App {
  id?: number;
  files?: string[];
}

export interface CodeViewProps {
  loading: boolean;
  app: App | null;
}

// Code view component that displays app files or status messages
export const CodeView = ({ loading, app }: CodeViewProps) => {
  const selectedFile = useAtomValue(selectedFileAtom);
  const { refreshApp } = useLoadApp(app?.id ?? null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [useSandpack, setUseSandpack] = useState(false);

  useEffect(() => {
    if (!isFullscreen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsFullscreen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isFullscreen]);

  if (loading) {
    return <div className="text-center py-4 typo-caption">Cargando archivos...</div>;
  }

  if (!app) {
    return (
      <div className="text-center py-4 typo-caption">
        No hay aplicación seleccionada
      </div>
    );
  }

  if (app.files && app.files.length > 0) {
    // ── Sandpack Beta view ──
    if (useSandpack && app.id != null) {
      return (
        <div
          className={`flex flex-col bg-background ${isFullscreen ? "fixed inset-0 z-50 h-screen w-screen shadow-2xl" : "h-full"}`}
        >
          <Suspense
            fallback={
              <div className="flex items-center justify-center h-full gap-2">
                <Loader2 size={20} className="animate-spin text-primary" />
                <span className="typo-caption text-muted-foreground">
                  Cargando explorador beta…
                </span>
              </div>
            }
          >
            <SandpackExplorer
              appId={app.id}
              files={app.files}
              onBack={() => setUseSandpack(false)}
            />
          </Suspense>
        </div>
      );
    }

    // ── Classic view ──
    return (
      <div
        className={`flex flex-col bg-background ${isFullscreen ? "fixed inset-0 z-50 h-screen w-screen shadow-2xl" : "h-full"}`}
      >
        {/* Toolbar */}
        <div className="flex items-center p-2 border-b space-x-2">
          <button
            onClick={() => refreshApp()}
            className="p-1 rounded hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={loading || !app.id}
            title="Actualizar archivos"
          >
            <RefreshCw size={16} />
          </button>
          <div className="text-sm text-muted-foreground">
            {app.files.length} archivo{app.files.length === 1 ? "" : "s"}
          </div>
          <div className="flex-1" />
          <button
            onClick={() => setUseSandpack(true)}
            className="flex items-center gap-1.5 px-2 py-1 rounded text-sm hover:bg-accent transition-colors"
            title="Abrir explorador beta (Sandpack)"
          >
            <TestTube size={14} className="text-primary" />
            <span className="text-muted-foreground">Explorador</span>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-primary/15 text-primary">
              BETA
            </span>
          </button>
          <button
            onClick={() => setIsFullscreen((value) => !value)}
            className="p-1 rounded hover:bg-accent"
            title={
              isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"
            }
          >
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-1 overflow-hidden">
          <div className="w-1/3 border-r overflow-hidden flex flex-col min-h-0">
            <FileTree appId={app.id ?? null} files={app.files} />
          </div>
          <div className="w-2/3">
            {selectedFile ? (
              <FileEditor
                appId={app.id ?? null}
                filePath={selectedFile.path}
                initialLine={selectedFile.line ?? null}
              />
            ) : (
              <div className="text-center py-4 typo-caption">
                Selecciona un archivo para ver
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="text-center py-4 typo-caption">
      No se encontraron archivos
    </div>
  );
};
