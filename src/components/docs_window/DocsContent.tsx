/**
 * DocsContent — Main content area for the documentation viewer.
 *
 * Fetches and renders a documentation page by its relative path.
 * Uses DocsMarkdownRenderer to convert markdown to native React components.
 *
 * Supports "search highlight": after navigating from a search result,
 * the matched text is found in the DOM, wrapped in a <mark>, scrolled to,
 * and auto-faded after a few seconds.
 */

import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { ipc } from "@/ipc/types";
import { DocsMarkdownRenderer } from "./DocsMarkdownRenderer";
import { BookOpen, Loader2 } from "@/components/ui/icons";

interface DocsContentProps {
    activePath: string | null;
    /** Search query to highlight in the rendered content after navigation */
    searchHighlight?: string | null;
    /** Anchor ID to scroll to after page loads (from sidebar heading click) */
    scrollToAnchor?: string | null;
    /** Called after the highlight/scroll completes */
    onHighlightDone?: () => void;
}

/**
 * Walk the DOM tree to find a text node containing the query (accent-insensitive),
 * wrap the match in a <mark> element, scroll to it, and auto-remove after delay.
 */
function highlightAndScroll(container: HTMLElement, query: string): void {
    const normalize = (s: string) =>
        s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

    const queryNorm = normalize(query);
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);

    let node: Text | null;
    while ((node = walker.nextNode() as Text | null)) {
        const text = node.textContent || "";
        const textNorm = normalize(text);
        if (!textNorm.includes(queryNorm)) continue;

        // Found it — highlight the parent block element (the whole line)
        const blockParent = findBlockParent(node);
        if (!blockParent) continue;

        // Save original background
        const origBg = blockParent.style.backgroundColor;
        const origTransition = blockParent.style.transition;
        const origRadius = blockParent.style.borderRadius;

        // Apply highlight
        blockParent.style.backgroundColor = "color-mix(in srgb, var(--primary) 25%, transparent)";
        blockParent.style.borderRadius = "6px";
        blockParent.style.transition = "background-color 1s ease";

        // Scroll into view
        blockParent.scrollIntoView({ behavior: "smooth", block: "center" });

        // Fade out after 3 seconds
        setTimeout(() => {
            blockParent.style.backgroundColor = "transparent";
            // Clean up styles after transition
            setTimeout(() => {
                blockParent.style.backgroundColor = origBg;
                blockParent.style.transition = origTransition;
                blockParent.style.borderRadius = origRadius;
            }, 1100);
        }, 3000);

        return;
    }
}

/** Walk up from a text node to find the closest block-level parent */
function findBlockParent(node: Node): HTMLElement | null {
    const blockTags = new Set(["P", "LI", "DIV", "H1", "H2", "H3", "H4", "H5", "H6", "TD", "TH", "BLOCKQUOTE", "PRE"]);
    let el = node.parentElement;
    while (el) {
        if (blockTags.has(el.tagName)) return el;
        el = el.parentElement;
    }
    return null;
}

export function DocsContent({ activePath, searchHighlight, scrollToAnchor, onHighlightDone }: DocsContentProps) {
    const { data: pageData, isLoading, error } = useQuery({
        queryKey: ["docPage", activePath],
        queryFn: () => ipc.system.getDocPage({ relativePath: activePath! }),
        enabled: !!activePath,
    });

    const articleRef = useRef<HTMLElement>(null);
    // Track which highlight has been applied to avoid re-running
    const appliedHighlightRef = useRef<string | null>(null);

    // Highlight search match after content renders
    useEffect(() => {
        if (!searchHighlight || isLoading || !pageData || !articleRef.current) return;
        if (appliedHighlightRef.current === searchHighlight) return;

        appliedHighlightRef.current = searchHighlight;

        const timer = setTimeout(() => {
            if (articleRef.current) {
                highlightAndScroll(articleRef.current, searchHighlight);
            }
            onHighlightDone?.();
        }, 300);

        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchHighlight, pageData, isLoading]);

    // Scroll to anchor ID (from sidebar heading click)
    useEffect(() => {
        if (!scrollToAnchor || isLoading || !pageData) return;

        const timer = setTimeout(() => {
            const el = document.getElementById(scrollToAnchor);
            if (el) {
                el.scrollIntoView({ behavior: "smooth", block: "start" });
            }
        }, 200);

        return () => clearTimeout(timer);
    }, [scrollToAnchor, pageData, isLoading]);

    // Reset applied highlight when navigating to a different page normally (no search)
    useEffect(() => {
        if (!searchHighlight) {
            appliedHighlightRef.current = null;
        }
    }, [activePath, searchHighlight]);

    // No page selected
    if (!activePath) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground p-8">
                <BookOpen size={48} className="opacity-30" />
                <p className="typo-body opacity-60">Selecciona un artículo del panel lateral</p>
            </div>
        );
    }

    // Loading
    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-full">
                <Loader2 size={24} className="animate-spin text-muted-foreground" />
            </div>
        );
    }

    // Error
    if (error || !pageData) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground p-8">
                <p className="typo-body">No se pudo cargar la página.</p>
                <p className="typo-micro opacity-50">{String(error?.message || "Contenido no disponible")}</p>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto px-8 py-10">
            {/* Markdown content */}
            <article ref={articleRef} className="docs-article">
                <DocsMarkdownRenderer content={pageData.markdown} />
            </article>
        </div>
    );
}
