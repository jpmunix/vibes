import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Folder,
  FolderOpen,
  Loader2,
  Search,
  X,
  FilePlus,
  FolderPlus,
  Pencil,
  Trash2,
  FileCode,
  FileText,
  File as FileIcon,
  ExternalLink,
} from "@/components/ui/icons";
import { selectedFileAtom } from "@/atoms/viewAtoms";
import { useSetAtom } from "jotai";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { AppFileSearchResult } from "@/ipc/types";
import { useSearchAppFiles } from "@/hooks/useSearchAppFiles";
import { ipc } from "@/ipc/types";
import { useLoadApp } from "@/hooks/useLoadApp";
import { showError } from "@/lib/toast";

interface FileTreeProps {
  appId: number | null;
  files: string[];
}

interface TreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children: TreeNode[];
}

// ═══════════════════════════════════════════════════════════════════
// File type icons — map extensions to appropriate icons
// ═══════════════════════════════════════════════════════════════════

const CODE_EXTENSIONS = new Set([
  "ts", "tsx", "js", "jsx", "mjs", "cjs",
  "php", "phtml",
  "py", "rb", "go", "rs", "java", "cpp", "c", "h",
  "vue", "svelte", "astro",
  "sh", "bash", "zsh",
]);

const TEXT_EXTENSIONS = new Set([
  "md", "mdx", "txt", "log", "csv",
  "json", "yaml", "yml", "toml", "xml",
  "html", "htm", "css", "scss", "sass", "less",
  "twig", "volt",
  "env", "gitignore", "dockerignore", "editorconfig",
  "ini", "conf", "cfg", "htaccess", "neon",
]);

/** Color hint for file icons based on extension */
function getFileIconColor(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  // PHP ecosystem
  if (ext === "php" || ext === "phtml") return "text-indigo-400";
  if (ext === "twig") return "text-lime-400";
  if (ext === "volt") return "text-emerald-400";
  // TypeScript / JS
  if (ext === "ts" || ext === "tsx") return "text-blue-400";
  if (ext === "js" || ext === "jsx" || ext === "mjs") return "text-yellow-400";
  // Styles
  if (ext === "css" || ext === "scss" || ext === "sass") return "text-pink-400";
  // HTML
  if (ext === "html" || ext === "htm") return "text-orange-400";
  // Data
  if (ext === "json") return "text-yellow-500";
  if (ext === "yaml" || ext === "yml" || ext === "toml") return "text-green-400";
  // Config
  if (ext === "md" || ext === "mdx") return "text-blue-300";
  if (ext === "ini" || ext === "conf" || ext === "cfg" || ext === "htaccess" || ext === "neon") return "text-gray-400";
  // Images
  if (["png", "jpg", "jpeg", "gif", "svg", "ico", "webp"].includes(ext)) return "text-purple-400";
  // SQL
  if (ext === "sql") return "text-cyan-400";
  return "text-muted-foreground";
}

function FileTypeIcon({ name, size = 16 }: { name: string; size?: number }) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const color = getFileIconColor(name);

  if (CODE_EXTENSIONS.has(ext)) {
    return <FileCode size={size} className={color} />;
  }
  if (TEXT_EXTENSIONS.has(ext)) {
    return <FileText size={size} className={color} />;
  }
  return <FileIcon size={size} className={color} />;
}

// ═══════════════════════════════════════════════════════════════════
// Utilities
// ═══════════════════════════════════════════════════════════════════

const useDebouncedValue = <T,>(value: T, delay = 200) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
};

const highlightMatch = (text: string, query: string) => {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return text;

  const lowerText = text.toLowerCase();
  const lowerQuery = trimmedQuery.toLowerCase();
  const index = lowerText.indexOf(lowerQuery);

  if (index === -1) {
    return text;
  }

  const end = index + trimmedQuery.length;

  return (
    <>
      {text.slice(0, index)}
      <mark className="rounded-sm bg-primary/15 px-0.5 text-foreground">
        {text.slice(index, end)}
      </mark>
      {text.slice(end)}
    </>
  );
};

// Convert flat file list to tree structure
const buildFileTree = (files: string[]): TreeNode[] => {
  const root: TreeNode[] = [];

  files.forEach((path) => {
    const parts = path.split("/");
    let currentLevel = root;

    parts.forEach((part, index) => {
      const isLastPart = index === parts.length - 1;
      const currentPath = parts.slice(0, index + 1).join("/");

      // Check if this node already exists at the current level
      const existingNode = currentLevel.find((node) => node.name === part);

      if (existingNode) {
        // If we found the node, just drill down to its children for the next level
        currentLevel = existingNode.children;
      } else {
        // Create a new node
        const newNode: TreeNode = {
          name: part,
          path: currentPath,
          isDirectory: !isLastPart,
          children: [],
        };

        currentLevel.push(newNode);
        currentLevel = newNode.children;
      }
    });
  });

  return root;
};

// Sort nodes to show directories first
const sortNodes = (nodes: TreeNode[]): TreeNode[] => {
  return [...nodes].sort((a, b) => {
    if (a.isDirectory === b.isDirectory) {
      return a.name.localeCompare(b.name);
    }
    return a.isDirectory ? -1 : 1;
  });
};

// ═══════════════════════════════════════════════════════════════════
// Context Menu — fully inline, no native dialogs
// ═══════════════════════════════════════════════════════════════════

interface ContextMenuState {
  x: number;
  y: number;
  node?: TreeNode; // undefined = root (empty space click)
}

type MenuMode =
  | { type: "idle" }
  | { type: "new-file" }
  | { type: "new-folder" }
  | { type: "rename" };

interface ContextMenuProps {
  menu: ContextMenuState;
  appId: number;
  onClose: () => void;
  onRefresh: () => void;
  onRequestDelete: (node: TreeNode) => void;
}

function FileContextMenu({ menu, appId, onClose, onRefresh, onRequestDelete }: ContextMenuProps) {
  const setSelectedFile = useSetAtom(selectedFileAtom);
  const menuRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<MenuMode>({ type: "idle" });
  const [inputValue, setInputValue] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close on outside click or Escape (only in idle mode)
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (mode.type !== "idle") {
          setMode({ type: "idle" });
          setInputValue("");
        } else {
          onClose();
        }
      }
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose, mode]);

  // Auto-focus input when mode changes to an input mode
  useEffect(() => {
    if (mode.type === "new-file" || mode.type === "new-folder" || mode.type === "rename") {
      // Small delay so the input is rendered first
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [mode]);

  const basePath = menu.node
    ? (menu.node.isDirectory ? menu.node.path : menu.node.path.split("/").slice(0, -1).join("/"))
    : "";

  const handleSubmit = async () => {
    const name = inputValue.trim();
    if (!name || loading) return;

    setLoading(true);
    try {
      if (mode.type === "new-file") {
        const filePath = basePath ? `${basePath}/${name}` : name;
        await ipc.app.editAppFile({ appId, filePath, content: "", skipCommit: true });
        onRefresh();
        setSelectedFile({ path: filePath, line: null });
      } else if (mode.type === "new-folder") {
        const folderPath = basePath ? `${basePath}/${name}` : name;
        await ipc.app.editAppFile({ appId, filePath: `${folderPath}/.gitkeep`, content: "", skipCommit: true });
        onRefresh();
      } else if (mode.type === "rename" && menu.node) {
        const parts = menu.node.path.split("/");
        const oldName = parts[parts.length - 1];
        if (name !== oldName) {
          const parentPath = parts.slice(0, -1).join("/");
          const newPath = parentPath ? `${parentPath}/${name}` : name;
          await ipc.app.renameAppFile({ appId, oldPath: menu.node.path, newPath });
          onRefresh();
        }
      }
      onClose();
    } catch (err) {
      showError(err);
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!menu.node || loading) return;
    setLoading(true);
    try {
      await ipc.app.deleteAppFile({ appId, filePath: menu.node.path });
      onRefresh();
      onClose();
    } catch (err) {
      showError(err);
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setMode({ type: "idle" });
      setInputValue("");
    }
  };

  // ── Input view (new-file, new-folder, rename) ──
  if (mode.type === "new-file" || mode.type === "new-folder" || mode.type === "rename") {
    const label = mode.type === "new-file"
      ? "Nuevo archivo"
      : mode.type === "new-folder"
        ? "Nueva carpeta"
        : "Renombrar";

    return (
      <div
        ref={menuRef}
        className="fixed z-[999] min-w-[220px] max-w-[280px] rounded-md border bg-popover shadow-lg p-3 animate-in fade-in-0 zoom-in-95"
        style={{ top: menu.y, left: menu.x }}
      >
        <p className="text-xs text-muted-foreground mb-1.5">{label}</p>
        <input
          ref={inputRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={mode.type === "new-folder" ? "nombre-carpeta" : "nombre.ext"}
          className="w-full bg-background border rounded px-2 py-1 text-sm outline-none focus:border-primary transition-colors"
          disabled={loading}
        />
        <div className="flex gap-2 justify-end mt-2">
          <button
            onClick={() => { setMode({ type: "idle" }); setInputValue(""); }}
            className="px-2.5 py-1 text-xs rounded border hover:bg-accent transition-colors"
            disabled={loading}
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            className="px-2.5 py-1 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            disabled={!inputValue.trim() || loading}
          >
            {loading ? "Creando…" : mode.type === "rename" ? "Renombrar" : "Crear"}
          </button>
        </div>
      </div>
    );
  }

  // ── Idle view (menu items) ──
  const menuItems: ({
    label: string;
    icon: React.ReactNode;
    action: () => void;
    destructive?: boolean;
  } | null)[] = [
    {
      label: "Nuevo archivo",
      icon: <FilePlus size={14} />,
      action: () => { setInputValue(""); setMode({ type: "new-file" }); },
    },
    {
      label: "Nueva carpeta",
      icon: <FolderPlus size={14} />,
      action: () => { setInputValue(""); setMode({ type: "new-folder" }); },
    },
    null, // separator
    {
      label: "Abrir externamente",
      icon: <ExternalLink size={14} />,
      action: () => {
        onClose();
        if (appId) {
          ipc.app.openAppFile({ appId, filePath: menu.node?.path ?? "." }).catch(showError);
        }
      },
    },
  ];

  if (menu.node) {
    const oldName = menu.node.path.split("/").pop() ?? "";
    menuItems.push(
      null, // separator
      {
        label: "Renombrar",
        icon: <Pencil size={14} />,
        action: () => { setInputValue(oldName); setMode({ type: "rename" }); },
      },
      {
        label: "Eliminar",
        icon: <Trash2 size={14} />,
        action: () => { onClose(); onRequestDelete(menu.node!); },
        destructive: true,
      },
    );
  }

  return (
    <div
      ref={menuRef}
      className="fixed z-[999] min-w-[180px] rounded-md border bg-popover shadow-lg py-1 animate-in fade-in-0 zoom-in-95"
      style={{ top: menu.y, left: menu.x }}
    >
      {menuItems.map((item, i) =>
        item === null ? (
          <div key={`sep-${i}`} className="h-px bg-border my-1 mx-2" />
        ) : (
          <button
            key={item.label}
            onClick={item.action}
            className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent transition-colors ${
              item.destructive ? "text-destructive hover:text-destructive" : "text-popover-foreground"
            }`}
          >
            {item.icon}
            {item.label}
          </button>
        ),
      )}
    </div>
  );
}



// ═══════════════════════════════════════════════════════════════════
// FileTree (main component)
// ═══════════════════════════════════════════════════════════════════

// File tree component
export const FileTree = ({ appId, files }: FileTreeProps) => {
  const [searchValue, setSearchValue] = useState("");
  const [searchMode, setSearchMode] = useState<"content" | "name">("name");
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TreeNode | null>(null);
  const prevAppIdRef = useRef<number | null>(appId);
  const { refreshApp } = useLoadApp(appId);

  // Reset search when appId changes to prevent unnecessary IPC calls with old search term
  useEffect(() => {
    if (prevAppIdRef.current !== appId) {
      prevAppIdRef.current = appId;
      setSearchValue("");
    }
  }, [appId]);

  const debouncedSearch = useDebouncedValue(searchValue, 250);
  const isContentSearch = searchMode === "content" && debouncedSearch.trim().length > 0;
  const isNameSearch = searchMode === "name" && debouncedSearch.trim().length > 0;

  // Content search via IPC grep (only when in content mode)
  const {
    results: searchResults,
    loading: searchLoading,
    error: searchError,
  } = useSearchAppFiles(appId, isContentSearch ? debouncedSearch : "");

  const matchesByPath = useMemo(() => {
    const map = new Map<string, AppFileSearchResult>();
    for (const result of searchResults) {
      map.set(result.path, result);
    }
    return map;
  }, [searchResults]);

  // Name search — filter files locally
  const nameFilteredFiles = useMemo(() => {
    if (!isNameSearch) return files;
    const query = debouncedSearch.toLowerCase();
    return files.filter((fp) => {
      const name = fp.split("/").pop()?.toLowerCase() ?? "";
      return name.includes(query);
    });
  }, [files, isNameSearch, debouncedSearch]);

  const visibleFiles = useMemo(() => {
    if (isContentSearch) {
      return files.filter((filePath) => matchesByPath.has(filePath));
    }
    if (isNameSearch) {
      return nameFilteredFiles;
    }
    return files;
  }, [files, isContentSearch, isNameSearch, matchesByPath, nameFilteredFiles]);

  const treeData = useMemo(() => buildFileTree(visibleFiles), [visibleFiles]);

  // In content search mode, create a flat list of matching files with match counts
  const searchResultsList = useMemo(() => {
    if (!isContentSearch) return [];
    return Array.from(matchesByPath.entries())
      .map(([path, result]) => ({
        path,
        matchCount: result.snippets?.length ?? 0,
        result,
      }))
      .sort((a, b) => {
        if (b.matchCount !== a.matchCount) return b.matchCount - a.matchCount;
        return a.path.localeCompare(b.path);
      });
  }, [isContentSearch, matchesByPath]);

  const handleRefresh = useCallback(() => {
    refreshApp();
  }, [refreshApp]);

  const isSearchActive = isContentSearch || isNameSearch;

  // ── Collapse / Expand signals ──
  // collapseGen: bumped to force all TreeNodeItems to re-evaluate their
  // default expanded state.  expandFirstLevel tracks whether the
  // first directory level should be opened.
  const [collapseGen, setCollapseGen] = useState(0);
  const [expandFirstLevel, setExpandFirstLevel] = useState(false);

  const handleCollapseAll = useCallback(() => {
    setExpandFirstLevel(false);
    setCollapseGen((g) => g + 1);
  }, []);

  const handleExpandFirstLevel = useCallback(() => {
    setExpandFirstLevel(true);
    setCollapseGen((g) => g + 1);
  }, []);

  return (
    <div className="file-tree mt-2 flex h-full flex-col">
      {/* Search bar */}
      <div className="px-2 pb-2">
        <div className="relative">
          <Search
            size={14}
            className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            placeholder={searchMode === "name" ? "Buscar por nombre" : "Buscar en contenido"}
            className="h-8 pl-7 pr-16 text-sm"
            data-testid="file-tree-search"
            disabled={!appId}
          />
          {searchValue && (
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setSearchValue("")}
              aria-label="Borrar búsqueda"
            >
              <X size={14} />
            </button>
          )}
          {searchLoading && (
            <Loader2
              size={14}
              className="absolute right-7 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground"
            />
          )}
        </div>

        {/* Search mode toggle + collapse/expand buttons */}
        <div className="mt-1.5 flex items-center gap-1">
          <button
            onClick={() => { setSearchMode("name"); setSearchValue(""); }}
            className={`px-2 py-0.5 text-xs rounded transition-colors ${
              searchMode === "name"
                ? "bg-primary/15 text-primary font-medium"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            Nombre
          </button>
          <button
            onClick={() => { setSearchMode("content"); setSearchValue(""); }}
            className={`px-2 py-0.5 text-xs rounded transition-colors ${
              searchMode === "content"
                ? "bg-primary/15 text-primary font-medium"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            Contenido
          </button>

          {/* ── Collapse / Expand buttons ── */}
          <div className="ml-auto flex items-center gap-0.5">
            <button
              onClick={handleCollapseAll}
              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="Colapsar todo"
            >
              <ChevronsDownUp size={14} />
            </button>
            <button
              onClick={handleExpandFirstLevel}
              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="Expandir primer nivel"
            >
              <ChevronsUpDown size={14} />
            </button>
          </div>

          {isSearchActive && (
            <span className="text-xs text-muted-foreground">
              {isContentSearch
                ? searchLoading
                  ? "Buscando..."
                  : `${matchesByPath.size} coincidencia${matchesByPath.size === 1 ? "" : "s"}`
                : `${nameFilteredFiles.length} de ${files.length}`}
            </span>
          )}
        </div>
      </div>

      <div
        className="flex-1 overflow-auto"
        onContextMenu={(e) => {
          // Right-click on empty space → root context menu
          if (e.target === e.currentTarget && appId) {
            e.preventDefault();
            setContextMenu({ x: e.clientX, y: e.clientY });
          }
        }}
      >
        {isContentSearch && searchError && (
          <div className="px-3 py-2 text-xs text-red-500">
            {searchError.message}
          </div>
        )}
        {isContentSearch &&
        !searchLoading &&
        !searchError &&
        matchesByPath.size === 0 ? (
          <div className="px-3 py-2 text-xs text-muted-foreground">
            No hay archivos que coincidan con tu búsqueda.
          </div>
        ) : isContentSearch ? (
          <div className="px-2 py-1">
            {searchResultsList.map(({ path, matchCount, result }) => (
              <SearchResultItem
                key={path}
                path={path}
                matchCount={matchCount}
                result={result}
              />
            ))}
          </div>
        ) : (
          <ul className="ml-4">
            <li className="py-0.5">
              {/* Virtual root "/" — right-click for root-level create */}
              <div
                className="flex items-center rounded px-1.5 py-0.5 text-sm hover:bg-(--sidebar) cursor-pointer group"
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setContextMenu({ x: e.clientX, y: e.clientY }); // no node = root
                }}
              >
                <span className="mr-1 flex-shrink-0">
                  <FolderOpen size={16} className="text-primary/70" />
                </span>
                <span className="text-muted-foreground font-mono">/</span>
              </div>
              <TreeNodes
                nodes={treeData}
                level={1}
                matchesByPath={matchesByPath}
                isSearchMode={isNameSearch}
                searchQuery={debouncedSearch}
                appId={appId}
                onContextMenu={setContextMenu}
                collapseGen={collapseGen}
                expandFirstLevel={expandFirstLevel}
              />
            </li>
          </ul>
        )}
      </div>

      {/* Context menu */}
      {contextMenu && appId && (
        <FileContextMenu
          menu={contextMenu}
          appId={appId}
          onClose={() => setContextMenu(null)}
          onRefresh={handleRefresh}
          onRequestDelete={(node) => {
            setContextMenu(null);
            setDeleteTarget(node);
          }}
        />
      )}

      {/* Delete confirmation — standard AlertDialog */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Eliminar {deleteTarget?.isDirectory ? "carpeta" : "archivo"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará <strong>{deleteTarget?.name}</strong>
              {deleteTarget?.isDirectory ? " y todo su contenido" : ""}.
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!deleteTarget || !appId) return;
                try {
                  await ipc.app.deleteAppFile({ appId, filePath: deleteTarget.path });
                  handleRefresh();
                } catch (err) {
                  showError(err);
                } finally {
                  setDeleteTarget(null);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════
// TreeNodes
// ═══════════════════════════════════════════════════════════════════

interface TreeNodesProps {
  nodes: TreeNode[];
  level: number;
  matchesByPath: Map<string, AppFileSearchResult>;
  isSearchMode: boolean;
  searchQuery: string;
  appId: number | null;
  onContextMenu: (state: ContextMenuState | null) => void;
  collapseGen: number;
  expandFirstLevel: boolean;
}

// Tree nodes component
const TreeNodes = ({
  nodes,
  level,
  matchesByPath,
  isSearchMode,
  searchQuery,
  appId,
  onContextMenu,
  collapseGen,
  expandFirstLevel,
}: TreeNodesProps) => (
  <ul className="ml-4">
    {sortNodes(nodes).map((node) => (
      <TreeNodeItem
        key={node.path}
        node={node}
        level={level}
        matchesByPath={matchesByPath}
        isSearchMode={isSearchMode}
        searchQuery={searchQuery}
        appId={appId}
        onContextMenu={onContextMenu}
        collapseGen={collapseGen}
        expandFirstLevel={expandFirstLevel}
      />
    ))}
  </ul>
);

interface TreeNodeProps {
  node: TreeNode;
  level: number;
  matchesByPath: Map<string, AppFileSearchResult>;
  isSearchMode: boolean;
  searchQuery: string;
  appId: number | null;
  onContextMenu: (state: ContextMenuState | null) => void;
  collapseGen: number;
  expandFirstLevel: boolean;
}

// ═══════════════════════════════════════════════════════════════════
// Search result item (flat list in content search mode)
// ═══════════════════════════════════════════════════════════════════

interface SearchResultItemProps {
  path: string;
  matchCount: number;
  result: AppFileSearchResult;
}

const SearchResultItem = ({
  path,
  matchCount,
  result,
}: SearchResultItemProps) => {
  const setSelectedFile = useSetAtom(selectedFileAtom);
  const [isExpanded, setIsExpanded] = useState(false);

  const handleFileClick = () => {
    setIsExpanded(!isExpanded);
  };

  const handleSnippetClick = (line: number) => {
    setSelectedFile({
      path,
      line,
    });
  };

  const fileName = path.split("/").pop() ?? path;

  return (
    <div className="py-1">
      <div
        className="flex items-center rounded px-1.5 py-1 text-sm hover:bg-(--sidebar) cursor-pointer"
        onClick={handleFileClick}
      >
        {/* Chevron */}
        <span className="text-muted-foreground mr-1.5 flex-shrink-0">
          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>

        {/* File icon */}
        <span className="mr-1.5 flex-shrink-0">
          <FileTypeIcon name={fileName} size={14} />
        </span>

        {/* Path */}
        <span className="truncate flex-1">{path}</span>

        {/* Count badge (right-aligned, circular) */}
        <span
          className="
      ml-auto
      flex h-5 min-w-[1.25rem] items-center justify-center
      rounded-full
      bg-muted
      text-xs font-medium
      text-muted-foreground
    "
        >
          {matchCount}
        </span>
      </div>

      {isExpanded &&
        result.snippets &&
        result.snippets.length > 0 &&
        result.snippets.map((snippet, index) => (
          <div
            key={`${snippet.line}-${index}`}
            className="ml-12 mr-2 py-0.5 text-xs cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              handleSnippetClick(snippet.line);
            }}
          >
            <div className="font-mono text-xs leading-tight text-foreground truncate">
              <span className="text-muted-foreground">{snippet.before}</span>
              <mark className="bg-primary/20 text-foreground font-medium px-0.5 rounded">
                {snippet.match}
              </mark>
              <span className="text-muted-foreground">{snippet.after}</span>
            </div>
          </div>
        ))}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════
// Individual tree node
// ═══════════════════════════════════════════════════════════════════

const TreeNodeItem = ({
  node,
  level,
  matchesByPath,
  isSearchMode,
  searchQuery,
  appId,
  onContextMenu,
  collapseGen,
  expandFirstLevel,
}: TreeNodeProps) => {
  // Default: all directories collapsed (false)
  const [expanded, setExpanded] = useState(false);
  const setSelectedFile = useSetAtom(selectedFileAtom);
  const match = isSearchMode ? matchesByPath.get(node.path) : undefined;

  // React to collapse/expand signals from the parent toolbar
  useEffect(() => {
    if (!node.isDirectory) return;
    // expandFirstLevel=true → only level 1 dirs (direct children of /)
    // expandFirstLevel=false → collapse everything
    setExpanded(expandFirstLevel && level === 1);
  }, [collapseGen]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isSearchMode && node.isDirectory) {
      setExpanded(true);
    }
  }, [isSearchMode, node.isDirectory]);

  const handleClick = () => {
    if (node.isDirectory) {
      setExpanded(!expanded);
    } else {
      setSelectedFile({
        path: node.path,
        line: match?.snippets?.[0]?.line ?? null,
      });
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onContextMenu({ x: e.clientX, y: e.clientY, node });
  };

  return (
    <li className="py-0.5">
      <div
        className="flex items-center rounded px-1.5 py-0.5 text-sm hover:bg-(--sidebar) cursor-pointer group"
        onClick={handleClick}
        onContextMenu={handleContextMenu}
      >
        {/* Icon */}
        <span className="mr-1 flex-shrink-0">
          {node.isDirectory ? (
            expanded ? (
              <FolderOpen size={16} className="text-primary/70" />
            ) : (
              <Folder size={16} className="text-primary/50" />
            )
          ) : (
            <FileTypeIcon name={node.name} size={16} />
          )}
        </span>

        {/* Name */}
        <span className="truncate flex-1">
          {isSearchMode ? highlightMatch(node.name, searchQuery) : node.name}
        </span>

        {/* Directory chevron */}
        {node.isDirectory && (
          <span className="text-muted-foreground/50 ml-1 flex-shrink-0">
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </span>
        )}
      </div>

      {match?.matchesContent &&
        match.snippets &&
        match.snippets.length > 0 &&
        match.snippets.map((snippet, index) => (
          <div
            key={`${snippet.line}-${index}`}
            className="ml-6 mr-2 py-0.5 text-xs cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedFile({
                path: node.path,
                line: snippet.line,
              });
            }}
          >
            <div className="font-mono text-xs leading-tight text-foreground truncate">
              <span className="text-muted-foreground">{snippet.before}</span>
              <mark className="bg-primary/20 text-foreground font-medium px-0.5 rounded">
                {snippet.match}
              </mark>
              <span className="text-muted-foreground">{snippet.after}</span>
            </div>
          </div>
        ))}

      {node.isDirectory && expanded && node.children.length > 0 && (
        <TreeNodes
          nodes={node.children}
          level={level + 1}
          matchesByPath={matchesByPath}
          isSearchMode={isSearchMode}
          searchQuery={searchQuery}
          appId={appId}
          onContextMenu={onContextMenu}
          collapseGen={collapseGen}
          expandFirstLevel={expandFirstLevel}
        />
      )}
    </li>
  );
};
