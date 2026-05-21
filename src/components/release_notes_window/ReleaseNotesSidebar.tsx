/**
 * DocsSidebar — Recursive tree navigation for documentation sections.
 *
 * Renders the DocTree as a collapsible sidebar with:
 *   - Expandable section groups (directories)
 *   - Clickable page links (md files)
 *   - Active page highlighting
 *   - Indentation by depth level
 *   - Full-text search across all doc content (debounced)
 */

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, FileText, FolderOpen, Folder, Search, X, Link2 } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { ipc } from "@/ipc/types";
import type { DocTreeNode } from "@/types/docsTypes";
import type { DocSearchResult } from "@/types/docsTypes";
import { Dot } from "lucide-react";

interface DocsSidebarProps {
    tree: DocTreeNode | null;
    isLoading: boolean;
    activePath: string | null;
    onNavigate: (relativePath: string, anchor?: string, query?: string) => void;
}

export function ReleaseNotesSidebar({
    tree,
    isLoading,
    activePath,
    onNavigate,
}: {
    tree: DocTreeNode | null;
    isLoading: boolean;
    activePath: string | null;
    onNavigate: (relativePath: string, anchor?: string, query?: string) => void;
}) {
    const [searchQuery, setSearchQuery] = useState("");
    const [debouncedQuery, setDebouncedQuery] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

    // Debounce search input
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    // Full-text search via IPC
    const { data: searchResults, isFetching: searchLoading } = useQuery({
        queryKey: ["docsSearch", "release-notes", searchQuery],
        queryFn: async () => {
            if (!searchQuery || searchQuery.length < 2) return [];
            return ipc.system.searchDocs({ query: searchQuery, baseDir: "release-notes" });
        },
        enabled: debouncedQuery.length >= 2,
        staleTime: 30_000,
    });

    const isSearchMode = debouncedQuery.length >= 2;

    const clearSearch = useCallback(() => {
        setSearchQuery("");
        setDebouncedQuery("");
        inputRef.current?.focus();
    }, []);

    if (isLoading || !tree) {
        return (
            <div className="flex-1 p-4 space-y-3">
                {[...Array(6)].map((_, i) => (
                    <div key={i} className="h-6 rounded-md bg-muted/50 animate-pulse" style={{ width: `${60 + (i % 3) * 15}%`, animationDelay: `${i * 0.1}s` }} />
                ))}
            </div>
        );
    }

    console.log("ReleaseNotes tree:", tree);

    return (
        <div className="flex flex-col h-full">
            {/* Search bar */}
            <div className="p-3 border-b border-border">
                <div className="relative">
                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                        ref={inputRef}
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Buscar en la documentación..."
                        className="w-full pl-8 pr-8 py-1.5 rounded-md border border-border bg-background text-foreground typo-body placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                    />
                    {searchQuery && (
                        <button
                            type="button"
                            onClick={clearSearch}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                        >
                            <X size={14} />
                        </button>
                    )}
                </div>
            </div>

            {/* Content: search results or tree */}
            <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
                {isSearchMode ? (
                    <SearchResults
                        query={debouncedQuery}
                        results={searchResults ?? []}
                        isSearching={searchLoading}
                        activePath={activePath}
                        onNavigate={(path, anchor) => {
                            const q = debouncedQuery;
                            onNavigate(path, anchor, q);
                            clearSearch();
                        }}
                    />
                ) : (
                    tree.children?.map((child, idx) => (
                        <TreeNode
                            key={child.id}
                            node={child}
                            depth={0}
                            activePath={activePath}
                            onNavigate={onNavigate}
                            searchQuery=""
                            defaultOpen={idx === 0}
                        />
                    ))
                )}
            </div>
        </div>
    );
}

// ─── Search results ─────────────────────────────────────────────────────────

function SearchResults({
    query,
    results,
    isSearching,
    activePath,
    onNavigate,
}: {
    query: string;
    results: DocSearchResult[];
    isSearching: boolean;
    activePath: string | null;
    onNavigate: (path: string, anchor?: string) => void;
}) {
    if (isSearching) {
        return (
            <div className="p-3 space-y-2">
                {[...Array(4)].map((_, i) => (
                    <div key={i} className="space-y-1.5">
                        <div className="h-4 rounded bg-muted/50 animate-pulse" style={{ width: `${50 + i * 10}%` }} />
                        <div className="h-3 rounded bg-muted/30 animate-pulse" style={{ width: `${70 + i * 5}%` }} />
                    </div>
                ))}
            </div>
        );
    }

    if (results.length === 0) {
        return (
            <div className="p-4 text-center">
                <Search size={24} className="mx-auto text-muted-foreground/40 mb-2" />
                <span className="typo-button text-muted-foreground ml-2">Notas de Versión</span>
                <p className="typo-body text-muted-foreground">
                    Sin resultados para "<span className="font-medium text-foreground">{query}</span>"
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-1">
            <div className="px-2 py-1 typo-micro text-muted-foreground">
                {results.length} resultado{results.length !== 1 ? "s" : ""}
            </div>
            {results.map((result, idx) => {
                const isActive = activePath === result.relativePath;
                return (
                    <button
                        key={`${result.relativePath}-${idx}`}
                        type="button"
                        className={cn(
                            "w-full text-left rounded-md px-3 py-2 transition-colors cursor-pointer group",
                            isActive
                                ? "bg-primary/10"
                                : "hover:bg-sidebar-accent",
                        )}
                        onClick={() => onNavigate(result.relativePath, result.anchor)}
                    >
                        <div className={cn(
                            "typo-menu-item font-medium truncate flex items-center gap-1.5",
                            isActive ? "text-primary" : "text-foreground",
                        )}>
                            <FileText size={13} className={cn("shrink-0", isActive ? "text-primary" : "text-muted-foreground")} />
                            {result.title}
                        </div>
                        {result.sectionTitle && (
                            <div className="mt-0.5 text-[10px] text-muted-foreground/60 truncate">
                                § {result.sectionTitle}
                            </div>
                        )}
                        <div className="mt-0.5 text-xs text-muted-foreground/80 line-clamp-2 leading-relaxed">
                            <HighlightedSnippet
                                snippet={result.snippet}
                                matchStart={result.matchStart}
                                matchLength={result.matchLength}
                            />
                        </div>
                    </button>
                );
            })}
        </div>
    );
}

function HighlightedSnippet({ snippet, matchStart, matchLength }: { snippet: string; matchStart: number; matchLength: number }) {
    if (matchStart < 0 || matchLength <= 0) {
        return <>{snippet}</>;
    }
    const before = snippet.slice(0, matchStart);
    const match = snippet.slice(matchStart, matchStart + matchLength);
    const after = snippet.slice(matchStart + matchLength);
    return (
        <>
            {before}
            <span className="text-primary font-semibold bg-primary/10 rounded-sm px-0.5">{match}</span>
            {after}
        </>
    );
}

// ─── Recursive tree node ────────────────────────────────────────────────────

interface TreeNodeProps {
    node: DocTreeNode;
    depth: number;
    activePath: string | null;
    onNavigate: (relativePath: string, anchor?: string) => void;
    searchQuery: string;
    defaultOpen?: boolean;
}

function TreeNode({ node, depth, activePath, onNavigate, searchQuery, defaultOpen = false }: TreeNodeProps) {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    // Filter: if there's a search query, only show matching nodes
    const isVisible = useMemo(() => {
        if (!searchQuery) return true;
        return nodeMatchesSearch(node, searchQuery);
    }, [node, searchQuery]);

    // Auto-expand sections that contain the active page
    useEffect(() => {
        if (activePath && node.type === "section" && containsPath(node, activePath)) {
            setIsOpen(true);
        }
    }, [activePath, node]);

    // Auto-expand when search matches
    useEffect(() => {
        if (searchQuery && isVisible && node.type === "section") {
            setIsOpen(true);
        }
    }, [searchQuery, isVisible, node.type]);

    if (!isVisible) return null;

    if (node.type === "page") {
        const isActive = activePath === node.relativePath;
        const hasAnchors = node.anchors && node.anchors.length > 0;

        return (
            <div>
                <button
                    type="button"
                    className={cn(
                        "w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors cursor-pointer typo-menu-item group",
                        isActive
                            ? "bg-primary/10 text-primary"
                            : "hover:bg-sidebar-accent text-foreground/80 hover:text-foreground",
                    )}
                    style={{ paddingLeft: `${12 + depth * 16}px` }}
                    onClick={() => onNavigate(node.relativePath)}
                >
                    <FileText size={14} className={cn("shrink-0", isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
                    <span className="truncate">{node.title}</span>
                </button>

                {/* Anchor sub-items — only visible when this page is active */}
                {isActive && hasAnchors && (
                    <div className="mt-0.5">
                        {node.anchors!.map((anchor) => (
                            <button
                                key={anchor.id}
                                type="button"
                                className="w-full text-left flex items-center gap-2 px-2 py-1 rounded-md transition-colors cursor-pointer typo-menu-item text-muted-foreground hover:text-foreground hover:bg-sidebar-accent"
                                style={{ paddingLeft: `${12 + (depth + 1) * 16}px` }}
                                onClick={() => onNavigate(node.relativePath, anchor.id)}
                            >
                                <Dot size={12} className="shrink-0 opacity-50" />
                                <span className="truncate text-xs">{anchor.title}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        );
    }

    // Section (directory)
    return (
        <div>
            <button
                type="button"
                className={cn(
                    "w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors cursor-pointer typo-menu-item group",
                    "hover:bg-sidebar-accent text-foreground/90 hover:text-foreground",
                )}
                style={{ paddingLeft: `${12 + depth * 16}px` }}
                onClick={() => setIsOpen(!isOpen)}
            >
                <ChevronRight
                    size={14}
                    className={cn(
                        "shrink-0 text-muted-foreground transition-transform duration-150",
                        isOpen && "rotate-90",
                    )}
                />
                {isOpen
                    ? <FolderOpen size={14} className="shrink-0 text-muted-foreground" />
                    : <Folder size={14} className="shrink-0 text-muted-foreground" />
                }
                <span className="truncate font-medium">{node.title}</span>
            </button>

            {isOpen && node.children && (
                <div className="mt-0.5">
                    {node.children.map((child) => (
                        <TreeNode
                            key={child.id}
                            node={child}
                            depth={depth + 1}
                            activePath={activePath}
                            onNavigate={onNavigate}
                            searchQuery={searchQuery}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function containsPath(node: DocTreeNode, path: string): boolean {
    if (node.type === "page" && node.relativePath === path) return true;
    if (node.children) {
        return node.children.some((child) => containsPath(child, path));
    }
    return false;
}

function nodeMatchesSearch(node: DocTreeNode, query: string): boolean {
    // Check this node's title and description
    if (node.title.toLowerCase().includes(query)) return true;
    if (node.description?.toLowerCase().includes(query)) return true;

    // For sections, check children recursively
    if (node.children) {
        return node.children.some((child) => nodeMatchesSearch(child, query));
    }

    return false;
}
