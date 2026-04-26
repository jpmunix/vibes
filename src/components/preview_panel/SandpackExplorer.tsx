/**
 * SandpackExplorer — Beta file explorer using Sandpack components.
 *
 * Uses @codesandbox/sandpack-react with a custom theme that maps directly
 * to the app's CSS variables for seamless dark/light mode integration.
 *
 * File operations (create/rename/delete) are implemented via useSandpack()
 * hooks since the built-in SandpackFileExplorer is read-only.
 *
 * This is a BETA component — accessed via a toggle button in the existing CodeView.
 */
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import {
  SandpackProvider,
  SandpackLayout,
  SandpackCodeEditor,
  SandpackFileExplorer,
  useSandpack,
} from "@codesandbox/sandpack-react";
import { ipc } from "@/ipc/types";
import { useTheme } from "@/contexts/ThemeContext";
import {
  Loader2, ArrowLeft, RefreshCw,
  FilePlus, FolderPlus, Trash2, Pencil,
} from "@/components/ui/icons";
import { showError } from "@/lib/toast";

interface SandpackExplorerProps {
  appId: number;
  files: string[];
  onBack: () => void;
}

/**
 * Load all file contents from the app via IPC.
 * Returns Sandpack-compatible { "/path": { code: "content" } }
 */
async function loadAllFiles(
  appId: number,
  filePaths: string[],
): Promise<Record<string, { code: string }>> {
  const BATCH_SIZE = 20;
  const result: Record<string, { code: string }> = {};

  for (let i = 0; i < filePaths.length; i += BATCH_SIZE) {
    const batch = filePaths.slice(i, i + BATCH_SIZE);
    const contents = await Promise.allSettled(
      batch.map(async (fp) => {
        const content = await ipc.app.readAppFile({ appId, filePath: fp });
        return { path: fp, content };
      }),
    );
    for (const entry of contents) {
      if (entry.status === "fulfilled") {
        const key = entry.value.path.startsWith("/")
          ? entry.value.path
          : `/${entry.value.path}`;
        result[key] = { code: entry.value.content };
      }
    }
  }
  return result;
}

/** Auto-detect best file to open on start */
function detectActiveFile(filePaths: string[]): string {
  const priorities = [
    "index.tsx", "index.ts", "index.jsx", "index.js",
    "App.tsx", "App.jsx", "App.js",
    "main.tsx", "main.ts", "main.js",
    "page.tsx", "page.jsx",
  ];
  for (const needle of priorities) {
    const match = filePaths.find(
      (fp) => fp.endsWith(needle) && fp.split("/").length <= 3,
    );
    if (match) return match.startsWith("/") ? match : `/${match}`;
  }
  const first = filePaths[0];
  return first?.startsWith("/") ? first : `/${first ?? "index.js"}`;
}

/* ═══════════════════════════════════════════════════════════════════
 * Theme — maps directly to the app's CSS variables
 * ═══════════════════════════════════════════════════════════════════ */

/**
 * Build a Sandpack theme that reads CSS variables from our app's globals.css.
 * This ensures Sandpack follows the app's dark/light mode perfectly.
 *
 * Per Context7 docs: Sandpack's theme object values become --sp-* CSS vars,
 * and we can pass CSS var() references directly as color values.
 */
function buildVibesTheme(isDark: boolean) {
  if (isDark) {
    return {
      colors: {
        surface1: "var(--background)",          // editor bg
        surface2: "var(--sidebar)",             // file explorer bg
        surface3: "var(--border)",              // borders/hovers
        clickable: "var(--muted-foreground)",   // icons / clickable text
        base: "var(--foreground)",              // main text
        disabled: "var(--muted-foreground)",
        hover: "var(--accent)",                 // hover bg
        inputBackground: "var(--background)",
        accent: "var(--primary)",               // highlights, active items
        error: "var(--destructive)",
        errorSurface: "var(--destructive)",
      },
      syntax: {
        plain: "var(--foreground)",
        comment: { color: "#6A737D", fontStyle: "italic" as const },
        keyword: "#c792ea",       // purple (Material/Night Owl inspired)
        tag: "#7fdbca",           // teal
        punctuation: "#89ddff",   // light cyan
        definition: "#82aaff",    // blue
        property: "#addb67",      // green
        static: "#f78c6c",        // orange
        string: "#ecc48d",        // amber
      },
      font: {
        body: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        mono: '"Geist Mono", "Fira Code", "JetBrains Mono", monospace',
        size: "13px",
        lineHeight: "1.6",
      },
    };
  }
  // Light theme
  return {
    colors: {
      surface1: "var(--background)",
      surface2: "var(--sidebar)",
      surface3: "var(--border)",
      clickable: "var(--muted-foreground)",
      base: "var(--foreground)",
      disabled: "var(--muted-foreground)",
      hover: "var(--accent)",
      inputBackground: "var(--background)",
      accent: "var(--primary)",
      error: "var(--destructive)",
      errorSurface: "var(--destructive)",
    },
    syntax: {
      plain: "var(--foreground)",
      comment: { color: "#6a737d", fontStyle: "italic" as const },
      keyword: "#d73a49",
      tag: "#22863a",
      punctuation: "#24292e",
      definition: "#6f42c1",
      property: "#005cc5",
      static: "#e36209",
      string: "#032f62",
    },
    font: {
      body: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      mono: '"Geist Mono", "Fira Code", "JetBrains Mono", monospace',
      size: "13px",
      lineHeight: "1.6",
    },
  };
}

/* ═══════════════════════════════════════════════════════════════════
 * FileOperationsToolbar — add/rename/delete via useSandpack()
 * Per Context7: SandpackFileExplorer is read-only. We must use
 * sandpack.addFile/deleteFile for file operations.
 * ═══════════════════════════════════════════════════════════════════ */

function FileOperationsToolbar() {
  const { sandpack } = useSandpack();
  const { addFile, deleteFile, activeFile, files } = sandpack;

  const handleAddFile = () => {
    const name = window.prompt("Nombre del archivo (ej: src/utils.ts):");
    if (!name) return;
    const path = name.startsWith("/") ? name : `/${name}`;
    addFile(path, "");
  };

  const handleAddFolder = () => {
    const name = window.prompt("Nombre de la carpeta (ej: src/components):");
    if (!name) return;
    // Sandpack represents folders via file paths — create a placeholder
    const folderPath = name.startsWith("/") ? name : `/${name}`;
    const placeholderPath = `${folderPath.replace(/\/$/, "")}/.gitkeep`;
    addFile(placeholderPath, "");
  };

  const handleRename = () => {
    if (!activeFile) return;
    const newName = window.prompt("Nuevo nombre:", activeFile);
    if (!newName || newName === activeFile) return;
    const path = newName.startsWith("/") ? newName : `/${newName}`;
    // Rename = copy content to new path + delete old
    const content = files[activeFile]?.code ?? "";
    addFile(path, content);
    deleteFile(activeFile);
  };

  const handleDelete = () => {
    if (!activeFile) return;
    const confirm = window.confirm(`¿Eliminar ${activeFile}?`);
    if (!confirm) return;
    deleteFile(activeFile);
  };

  return (
    <div className="flex items-center gap-0.5">
      <button
        onClick={handleAddFile}
        className="p-1 rounded hover:bg-accent"
        title="Nuevo archivo"
      >
        <FilePlus size={14} />
      </button>
      <button
        onClick={handleAddFolder}
        className="p-1 rounded hover:bg-accent"
        title="Nueva carpeta"
      >
        <FolderPlus size={14} />
      </button>
      <button
        onClick={handleRename}
        className="p-1 rounded hover:bg-accent disabled:opacity-40"
        title="Renombrar archivo activo"
        disabled={!activeFile}
      >
        <Pencil size={14} />
      </button>
      <button
        onClick={handleDelete}
        className="p-1 rounded hover:bg-accent text-destructive disabled:opacity-40"
        title="Eliminar archivo activo"
        disabled={!activeFile}
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
 * Main SandpackExplorer component
 * ═══════════════════════════════════════════════════════════════════ */

export function SandpackExplorer({
  appId,
  files: filePaths,
  onBack,
}: SandpackExplorerProps) {
  const { isDarkMode } = useTheme();
  const [sandpackFiles, setSandpackFiles] = useState<Record<
    string,
    { code: string }
  > | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadingRef = useRef(false);

  const activeFile = useMemo(
    () => detectActiveFile(filePaths),
    [filePaths],
  );

  const loadFiles = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const loaded = await loadAllFiles(appId, filePaths);
      if (Object.keys(loaded).length === 0) {
        setError("No se pudieron cargar los archivos");
      } else {
        setSandpackFiles(loaded);
      }
    } catch (err) {
      console.error("Error loading files for Sandpack:", err);
      setError(
        err instanceof Error ? err.message : "Error cargando archivos",
      );
      showError(err);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [appId, filePaths]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const theme = useMemo(() => buildVibesTheme(isDarkMode), [isDarkMode]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <Loader2 size={24} className="animate-spin text-primary" />
        <span className="typo-caption text-muted-foreground">
          Cargando archivos en Sandpack…
        </span>
        <span className="typo-caption text-muted-foreground/60">
          {filePaths.length} archivo{filePaths.length !== 1 ? "s" : ""}
        </span>
      </div>
    );
  }

  if (error || !sandpackFiles) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <span className="typo-caption text-destructive">
          {error ?? "Error desconocido"}
        </span>
        <div className="flex gap-2">
          <button
            onClick={onBack}
            className="px-3 py-1.5 rounded text-sm bg-muted hover:bg-muted/80"
          >
            Volver al explorador clásico
          </button>
          <button
            onClick={loadFiles}
            className="px-3 py-1.5 rounded text-sm bg-primary text-primary-foreground hover:opacity-90"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center p-2 border-b space-x-2 shrink-0">
        <button
          onClick={onBack}
          className="p-1 rounded hover:bg-accent"
          title="Volver al explorador clásico"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="text-sm font-medium text-foreground flex items-center gap-1.5">
          Explorador
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-primary/15 text-primary">
            BETA
          </span>
        </div>
        <div className="text-sm text-muted-foreground">
          {filePaths.length} archivo{filePaths.length !== 1 ? "s" : ""}
        </div>
        <div className="flex-1" />
        <button
          onClick={loadFiles}
          className="p-1 rounded hover:bg-accent"
          title="Recargar archivos"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Sandpack — fills all remaining space */}
      <div className="flex-1 min-h-0 overflow-hidden sp-vibes-wrapper">
        <style>{`
          /* ── Force Sandpack to fill available space ── */
          .sp-vibes-wrapper .sp-wrapper {
            height: 100% !important;
          }
          .sp-vibes-wrapper .sp-layout {
            height: 100% !important;
            border: none !important;
            border-radius: 0 !important;
          }
          .sp-vibes-wrapper .sp-file-explorer {
            min-width: 200px;
            max-width: 280px;
            height: 100% !important;
            overflow-y: auto;
          }
          .sp-vibes-wrapper .sp-stack {
            height: 100% !important;
          }
          .sp-vibes-wrapper .sp-code-editor {
            flex: 1;
            height: 100% !important;
          }
          .sp-vibes-wrapper .cm-editor {
            height: 100% !important;
          }
          .sp-vibes-wrapper .cm-scroller {
            overflow: auto !important;
          }

          /* ── Tree item styling ── */
          .sp-vibes-wrapper .sp-file-explorer .sp-button {
            font-size: 13px;
          }
          .sp-vibes-wrapper .sp-tab-button {
            font-size: 12px;
          }
        `}</style>
        <SandpackProvider
          files={sandpackFiles}
          options={{
            activeFile,
            visibleFiles: [activeFile],
          }}
          theme={theme}
        >
          {/* File operations toolbar inside provider so useSandpack() works */}
          <div className="flex items-center px-2 py-1 border-b">
            <FileOperationsToolbar />
          </div>
          <SandpackLayout>
            <SandpackFileExplorer
              autoHiddenFiles={false}
            />
            <SandpackCodeEditor
              showTabs
              showLineNumbers
              showInlineErrors
              wrapContent
              closableTabs
            />
          </SandpackLayout>
        </SandpackProvider>
      </div>
    </div>
  );
}
