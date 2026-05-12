import { useAtom, useAtomValue } from "jotai";
import { artifactsSidebarOpenAtom, selectedArtifactPathAtom } from "@/atoms/uiAtoms";
import { selectedAppIdAtom } from "@/atoms/appAtoms";
import { selectedChatIdAtom, isStreamingByIdAtom } from "@/atoms/chatAtoms";
import { useQuery } from "@tanstack/react-query";
import { ipc } from "@/ipc/types";
import { Panel, PanelResizeHandle } from "react-resizable-panels";
import { X, GripVertical, Loader2, Share2, Pencil, Trash2, MessageSquare, ChevronDown, ChevronRight } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { VibesMarkdownParser } from "./VibesMarkdownParser";
import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { showSuccess, showError } from "@/lib/toast";
import { useArtifactComments, type ArtifactComment } from "@/hooks/useArtifactComments";
import { useChatArtifacts } from "@/hooks/useChatArtifacts";
import { useStreamChat } from "@/hooks/useStreamChat";
import { useSettings } from "@/hooks/useSettings";

/**
 * Extract the first H1 heading from markdown content.
 */
function extractH1(raw: string): { title: string | null; body: string } {
  const match = raw.match(/^(#\s+.+)\r?\n?/m);
  if (!match) return { title: null, body: raw };
  const title = match[1].replace(/^#\s+/, "").trim();
  const body = raw.replace(match[0], "").replace(/^\s*\n/, "");
  return { title, body };
}

/**
 * Find the nearest heading above a given text in the markdown body.
 */
function findNearestHeading(body: string, selectedText: string): string | null {
  const idx = body.indexOf(selectedText);
  if (idx === -1) return null;
  const before = body.substring(0, idx);
  const headings = before.match(/^#{1,6}\s+.+$/gm);
  if (!headings || headings.length === 0) return null;
  return headings[headings.length - 1].replace(/^#+\s+/, "").trim();
}

// ── DOM highlight helpers ───────────────────────────────────────────────────

const HIGHLIGHT_ATTR = "data-comment-id";
const HIGHLIGHT_CLASS = "artifact-comment-highlight";

/**
 * Walk all text nodes, concatenate them, find the needle in the full text,
 * then wrap the matching range across however many DOM nodes it spans.
 */
function highlightText(root: HTMLElement, needle: string, commentId: number): void {
  if (!needle || needle.length < 3) return;

  // 1. Collect all text nodes with their offset in the concatenated string
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const entries: { node: Text; start: number; end: number }[] = [];
  let offset = 0;
  let n: Text | null;
  while ((n = walker.nextNode() as Text | null)) {
    const len = n.textContent?.length || 0;
    entries.push({ node: n, start: offset, end: offset + len });
    offset += len;
  }
  if (entries.length === 0) return;

  // 2. Build the full text and find the needle (whitespace-normalized)
  const fullText = entries.map((e) => e.node.textContent || "").join("");
  const normFull = fullText.replace(/\s+/g, " ");
  const normNeedle = needle.replace(/\s+/g, " ").trim();
  const normIdx = normFull.indexOf(normNeedle);
  if (normIdx === -1) return;

  // 3. Map normalized index → original index
  let origStart = 0, origEnd = 0, normCount = 0;
  let foundStart = false;
  for (let i = 0; i < fullText.length; i++) {
    if (!foundStart && normCount === normIdx) { origStart = i; foundStart = true; }
    if (foundStart && normCount === normIdx + normNeedle.length) { origEnd = i; break; }
    if (/\s/.test(fullText[i])) {
      if (i === 0 || !/\s/.test(fullText[i - 1])) normCount++;
    } else {
      normCount++;
    }
  }
  if (!origEnd) origEnd = fullText.length;

  // 4. Wrap each text node segment individually within the matched range.
  //    This avoids extractContents/insertNode which breaks DOM structure
  //    in lists and other block-level elements, causing extra whitespace.
  try {
    for (const e of entries) {
      // Skip nodes entirely before or after the match range
      if (e.end <= origStart || e.start >= origEnd) continue;

      const nodeStart = Math.max(0, origStart - e.start);
      const nodeEnd = Math.min(e.node.textContent!.length, origEnd - e.start);

      const range = document.createRange();
      range.setStart(e.node, nodeStart);
      range.setEnd(e.node, nodeEnd);

      const mark = document.createElement("mark");
      mark.className = HIGHLIGHT_CLASS;
      mark.setAttribute(HIGHLIGHT_ATTR, String(commentId));
      mark.style.backgroundColor = "oklch(from var(--primary) l c h / 0.22)";
      mark.style.color = "inherit";
      mark.style.padding = "2px 1px";
      mark.style.borderRadius = "3px";
      mark.style.cursor = "pointer";

      range.surroundContents(mark);
    }
  } catch {
    // Silently fail if DOM manipulation is impossible
  }
}

/**
 * Remove all highlights from the DOM.
 */
function clearHighlights(root: HTMLElement): void {
  const marks = root.querySelectorAll(`mark.${HIGHLIGHT_CLASS}`);
  marks.forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) return;
    while (mark.firstChild) {
      parent.insertBefore(mark.firstChild, mark);
    }
    parent.removeChild(mark);
    parent.normalize(); // Merge adjacent text nodes
  });
}

// ── Main component ──────────────────────────────────────────────────────────

export function ArtifactSidebar() {
  const [isOpen, setIsOpen] = useAtom(artifactsSidebarOpenAtom);
  const path = useAtomValue(selectedArtifactPathAtom);
  const appId = useAtomValue(selectedAppIdAtom);
  const selectedChatId = useAtomValue(selectedChatIdAtom);
  const isStreamingById = useAtomValue(isStreamingByIdAtom);
  const isStreaming = !!(selectedChatId && isStreamingById.get(selectedChatId));

  // Close sidebar when switching chats
  const prevChatId = useRef(selectedChatId);
  useEffect(() => {
    if (prevChatId.current !== selectedChatId && isOpen) {
      setIsOpen(false);
    }
    prevChatId.current = selectedChatId;
  }, [selectedChatId, isOpen, setIsOpen]);

  const { artifacts, invalidateArtifacts } = useChatArtifacts(selectedChatId);
  const currentArtifact = useMemo(
    () => artifacts.find((a) => a.path === path),
    [artifacts, path]
  );
  const isAccepted = !!(currentArtifact?.accepted);

  const { data: content, isLoading, error } = useQuery({
    queryKey: ["chatArtifactContent", appId, path],
    queryFn: async () => {
      if (!appId || !path) return null;
      return await ipc.chat.getChatArtifactContent({ appId, path });
    },
    enabled: isOpen && !!appId && !!path,
    // Poll every 5s ONLY when sidebar is open AND agent finished responding.
    // This detects file changes post-acceptance so the backend can reset accepted.
    refetchInterval: (isOpen && !isStreaming) ? 5000 : false,
  });

  // ── Auto-register artifact if missing from DB ──────────────────────────
  // The content loads from disk (getChatArtifactContent), but accept/comment
  // features need a DB record. If the record was lost (dedup cleanup, race
  // condition during creation, etc.) we silently re-register it here.
  const autoRegisterAttempted = useRef<string | null>(null);
  useEffect(() => {
    if (
      isOpen &&
      !currentArtifact &&
      content && // file exists on disk
      path &&
      appId &&
      selectedChatId &&
      autoRegisterAttempted.current !== `${appId}:${path}:${selectedChatId}`
    ) {
      autoRegisterAttempted.current = `${appId}:${path}:${selectedChatId}`;
      ipc.chat.attachArtifactToChat({ appId, path, chatId: selectedChatId })
        .then(() => invalidateArtifacts())
        .catch(() => {}); // non-fatal
    }
  }, [isOpen, currentArtifact, content, path, appId, selectedChatId, invalidateArtifacts]);

  // ── Re-verify acceptance when content changes (post-agent modification) ─
  const prevContentRef2 = useRef<string | null>(null);
  useEffect(() => {
    if (content && prevContentRef2.current !== null && content !== prevContentRef2.current) {
      // Content changed on disk → force getChatArtifacts which checks mtime vs updatedAt
      invalidateArtifacts();
    }
    prevContentRef2.current = content ?? null;
  }, [content, invalidateArtifacts]);


  const { title, body } = useMemo(() => {
    if (!content) return { title: null, body: "" };
    return extractH1(content);
  }, [content]);

  const { comments, addComment, updateComment, deleteComment } = useArtifactComments(
    currentArtifact?.id ?? null
  );

  // ── Inline highlights ──────────────────────────────────────────────────
  const contentRef = useRef<HTMLDivElement>(null);
  const proseRef = useRef<HTMLDivElement>(null);

  // Apply highlights whenever comments or rendered content change
  useEffect(() => {
    const el = proseRef.current;
    if (!el) return;

    // Small delay to ensure markdown is fully rendered
    const timer = setTimeout(() => {
      clearHighlights(el);
      for (const c of comments) {
        if (c.selectedText) {
          highlightText(el, c.selectedText, c.id);
        }
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [comments, body]);

  // ── Active comment popover (shown when clicking a highlight) ───────────
  const [activeComment, setActiveComment] = useState<{
    comment: ArtifactComment;
    x: number;
    y: number;
  } | null>(null);

  const handleHighlightClick = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      const mark = target.closest(`mark.${HIGHLIGHT_CLASS}`);
      if (!mark) return;

      const commentId = Number(mark.getAttribute(HIGHLIGHT_ATTR));
      const c = comments.find((c) => c.id === commentId);
      if (!c || !contentRef.current) return;

      const markRect = mark.getBoundingClientRect();
      const containerRect = contentRef.current.getBoundingClientRect();

      setActiveComment({
        comment: c,
        x: markRect.left - containerRect.left + markRect.width / 2,
        y: markRect.bottom - containerRect.top + 4,
      });
      setEditingInlineId(null);
    },
    [comments]
  );

  // Editing inline
  const [editingInlineId, setEditingInlineId] = useState<number | null>(null);
  const [editInlineText, setEditInlineText] = useState("");

  // Dismiss active comment popover
  useEffect(() => {
    if (!activeComment) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("[data-active-comment]")) return;
      if (target.closest(`mark.${HIGHLIGHT_CLASS}`)) return;
      setActiveComment(null);
      setEditingInlineId(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [activeComment]);

  // ── Share ──────────────────────────────────────────────────────────────
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

  // ── Accept plan ────────────────────────────────────────────────────────
  const { streamMessage } = useStreamChat();
  const { updateSettings } = useSettings();
  const [reviewMessage, setReviewMessage] = useState("");
  const [isReviewOpen, setIsReviewOpen] = useState(false);

  const handleAcceptPlan = useCallback(async () => {
    if (!selectedChatId || !currentArtifact || isAccepted) return;

    // Mark as accepted (one-way)
    await ipc.chat.acceptArtifact(currentArtifact.id);
    invalidateArtifacts();

    let priorMessages: { prompt: string; role?: string }[] = [];
    if (comments.length > 0) {
      const reviewBlock = comments
        .map((c) => {
          const section = c.blockRef ? `**Sección:** ${c.blockRef}` : "";
          const selected = c.selectedText ? `**Texto seleccionado:** "${c.selectedText}"` : "";
          const comment = `**Comentario:** ${c.comment}`;
          return [section, selected, comment].filter(Boolean).join("\n");
        })
        .join("\n\n---\n\n");

      priorMessages = [
        {
          role: "system",
          prompt: `El usuario ha revisado el plan y ha dejado ${comments.length} comentario(s) sobre secciones específicas. Tenlos en cuenta durante la implementación:\n\n${reviewBlock}`,
        },
      ];
    }

    updateSettings({ selectedChatMode: "agent" });
    streamMessage({
      prompt: reviewMessage.trim() || "Acepto. Procede con lo propuesto.",
      chatId: selectedChatId,
      priorMessages,
      chatModeOverride: "agent",
    });
    setIsOpen(false);
    setIsReviewOpen(false);
    setReviewMessage("");
  }, [selectedChatId, currentArtifact, isAccepted, comments, updateSettings, streamMessage, setIsOpen, invalidateArtifacts, reviewMessage]);

  const [expandedReview, setExpandedReview] = useState(false);

  // ── Text selection → "Comentar" popover ────────────────────────────────
  const [selectionPopover, setSelectionPopover] = useState<{
    text: string;
    x: number;
    y: number;
  } | null>(null);
  const [commentInput, setCommentInput] = useState("");
  const [showCommentBox, setShowCommentBox] = useState(false);

  const handleMouseUp = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !contentRef.current) return;

    const range = selection.getRangeAt(0);
    if (!contentRef.current.contains(range.commonAncestorContainer)) return;

    const text = selection.toString().trim();
    if (text.length < 3 || isAccepted) return;

    const rect = range.getBoundingClientRect();
    const containerRect = contentRef.current.getBoundingClientRect();

    setSelectionPopover({
      text,
      x: rect.left - containerRect.left + rect.width / 2,
      y: rect.bottom - containerRect.top + 4,
    });
    setShowCommentBox(false);
    setCommentInput("");
    setActiveComment(null);
  }, []);

  const handleAddComment = useCallback(() => {
    if (!commentInput.trim() || !selectionPopover) return;

    const blockRef = body ? findNearestHeading(body, selectionPopover.text) : null;

    addComment.mutate(
      { selectedText: selectionPopover.text, blockRef, comment: commentInput.trim() },
      {
        onSuccess: () => {
          setSelectionPopover(null);
          setCommentInput("");
          setShowCommentBox(false);
          window.getSelection()?.removeAllRanges();
        },
      }
    );
  }, [commentInput, selectionPopover, body, addComment]);

  // Dismiss selection popover
  useEffect(() => {
    if (!selectionPopover) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("[data-comment-popover]")) return;
      if (target.closest("[data-comment-trigger]")) return;
      setSelectionPopover(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [selectionPopover]);

  // Scroll to a highlight when clicking a comment in the list
  const scrollToHighlight = useCallback((commentId: number) => {
    const mark = proseRef.current?.querySelector(
      `mark.${HIGHLIGHT_CLASS}[${HIGHLIGHT_ATTR}="${commentId}"]`
    );
    if (mark) {
      mark.scrollIntoView({ behavior: "smooth", block: "center" });
      // Flash effect
      mark.classList.add("ring-2", "ring-primary");
      setTimeout(() => mark.classList.remove("ring-2", "ring-primary"), 1500);
    }
  }, []);

  if (!isOpen) return null;

  const displayTitle = title || (path ? path.split("/").pop() : "Artefacto");
  const commentCount = comments.length;

  return (
    <>
      {/* Highlight styles */}
      <style>{`
        mark.${HIGHLIGHT_CLASS} {
          background-color: oklch(from var(--primary) l c h / 0.22) !important;
          color: inherit !important;
          cursor: pointer;
          padding: 2px 1px;
          border-radius: 3px;
          transition: background-color 0.2s, box-shadow 0.3s;
        }
        mark.${HIGHLIGHT_CLASS}:hover {
          background-color: oklch(from var(--primary) l c h / 0.35) !important;
        }
      `}</style>

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
        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border/50">
          <h1
            className="text-base font-bold truncate leading-tight"
            title={displayTitle ?? undefined}
          >
            {displayTitle}
          </h1>
          <div className="flex items-center gap-1 shrink-0">
            {isAccepted ? (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1 font-medium opacity-60 cursor-default"
                disabled
              >
                Aceptado
                {commentCount > 0 && (
                  <span className="inline-flex items-center gap-0.5 ml-0.5">
                    <MessageSquare size={11} />
                    <span>{commentCount}</span>
                  </span>
                )}
              </Button>
            ) : commentCount > 0 ? (
                <Popover open={isReviewOpen} onOpenChange={setIsReviewOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="default"
                      size="sm"
                      className="h-7 text-xs gap-1.5 font-medium"
                      title="Revisar y enviar comentarios"
                    >
                      Revisar &bull; {commentCount}
                      <MessageSquare size={11} className="ml-0.5" />
                      <ChevronDown size={14} className="opacity-70" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[22rem] p-3 shadow-xl" align="end" sideOffset={8}>
                    <div className="space-y-3">
                      <h4 className="text-sm font-medium">Enviar comentario</h4>
                      <div className="flex gap-2">
                        <input
                          autoFocus
                          type="text"
                          placeholder="Añade un mensaje opcional, ↵ para enviar"
                          value={reviewMessage}
                          onChange={(e) => setReviewMessage(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleAcceptPlan();
                            }
                          }}
                          className="flex h-8 w-full rounded-md border border-input bg-transparent px-2.5 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
                        />
                        <Button size="sm" className="h-8 px-3 text-xs" onClick={handleAcceptPlan}>
                          Enviar
                        </Button>
                      </div>
                      
                      <div className="pt-2 border-t border-border/50">
                        <button 
                          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-2 cursor-pointer w-full text-left"
                          onClick={() => setExpandedReview(!expandedReview)}
                        >
                          {expandedReview ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                          Ver {commentCount} comentario{commentCount !== 1 ? 's' : ''}
                        </button>
                        {expandedReview && (
                          <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar pr-1">
                            {comments.map((c) => (
                              <div key={c.id} className="text-xs bg-muted/40 p-2 rounded border border-border/50">
                                {c.selectedText && (
                                  <div className="text-muted-foreground/80 italic mb-1 border-l-2 border-primary/30 pl-1.5 truncate">
                                    "{c.selectedText}"
                                  </div>
                                )}
                                <div className="text-foreground/90">{c.comment}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              ) : (
                <Button
                  variant="default"
                  size="sm"
                  className="h-7 text-xs gap-1.5 font-medium"
                  onClick={handleAcceptPlan}
                  title="Aceptar el plan y proceder"
                >
                  Aceptar plan
                </Button>
              )
            }
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

        {/* Scrollable content */}
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
            <div
              className="relative"
              ref={contentRef}
              onMouseUp={handleMouseUp}
              onClick={handleHighlightClick}
            >
              {/* Rendered markdown with inline highlights */}
              <div className="prose prose-sm dark:prose-invert max-w-none" ref={proseRef}>
                <VibesMarkdownParser content={body} forceFullMode />
              </div>

              {/* ── Selection popover: "Comentar" button ─── */}
              {selectionPopover && !showCommentBox && (
                <div
                  data-comment-trigger
                  className="absolute z-50 animate-in fade-in slide-in-from-top-1 duration-150"
                  style={{
                    left: `${selectionPopover.x}px`,
                    top: `${selectionPopover.y}px`,
                    transform: "translateX(-50%)",
                  }}
                >
                  <button
                    onClick={() => setShowCommentBox(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground shadow-lg text-sm font-medium hover:bg-primary/90 transition-colors cursor-pointer"
                  >
                    <MessageSquare size={13} />
                    Comentar
                  </button>
                </div>
              )}

              {/* ── Comment input box ─── */}
              {selectionPopover && showCommentBox && (
                <div
                  data-comment-popover
                  className="absolute z-50 w-72 animate-in fade-in slide-in-from-top-1 duration-150"
                  style={{
                    left: `${selectionPopover.x}px`,
                    top: `${selectionPopover.y}px`,
                    transform: "translateX(-50%)",
                  }}
                >
                  <div className="rounded-lg bg-popover border border-border shadow-xl p-3">
                    <div className="text-xs text-muted-foreground mb-2 truncate italic">
                      "{selectionPopover.text.substring(0, 60)}
                      {selectionPopover.text.length > 60 ? "…" : ""}"
                    </div>
                    <textarea
                      autoFocus
                      value={commentInput}
                      onChange={(e) => setCommentInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleAddComment();
                        }
                        if (e.key === "Escape") setSelectionPopover(null);
                      }}
                      placeholder="Deja un comentario…"
                      className="w-full bg-transparent border border-border rounded-md px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary/30 resize-none"
                      rows={2}
                    />
                    <div className="flex justify-end gap-2 mt-2">
                      <button
                        onClick={() => setSelectionPopover(null)}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <Button
                        size="sm"
                        className="h-6 text-xs px-3"
                        onClick={handleAddComment}
                        disabled={!commentInput.trim() || addComment.isPending}
                      >
                        Añadir
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Inline comment popover (shown on highlight click) ─── */}
              {activeComment && (
                <div
                  data-active-comment
                  className="absolute z-50 w-72 animate-in fade-in slide-in-from-top-1 duration-150"
                  style={{
                    left: `${activeComment.x}px`,
                    top: `${activeComment.y}px`,
                    transform: "translateX(-50%)",
                  }}
                >
                  <div className="rounded-lg bg-popover border border-border shadow-xl p-3">
                    {/* Section badge */}
                    {activeComment.comment.blockRef && (
                      <div className="text-[10px] font-medium text-primary/70 mb-1 uppercase tracking-wide">
                        {activeComment.comment.blockRef}
                      </div>
                    )}

                    {!isAccepted && editingInlineId === activeComment.comment.id ? (
                      // Editing mode (only when not accepted)
                      <div>
                        <textarea
                          autoFocus
                          value={editInlineText}
                          onChange={(e) => setEditInlineText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              if (editInlineText.trim()) {
                                updateComment.mutate(
                                  { commentId: activeComment.comment.id, comment: editInlineText.trim() },
                                  {
                                    onSuccess: () => {
                                      setEditingInlineId(null);
                                      setActiveComment(null);
                                    },
                                  }
                                );
                              }
                            }
                            if (e.key === "Escape") setEditingInlineId(null);
                          }}
                          className="w-full bg-transparent border border-border rounded-md px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-primary/30 resize-none"
                          rows={2}
                        />
                        <div className="flex justify-end gap-2 mt-1.5">
                          <button
                            onClick={() => setEditingInlineId(null)}
                            className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                          >
                            Cancelar
                          </button>
                          <Button
                            size="sm"
                            className="h-5 text-[11px] px-2"
                            onClick={() => {
                              if (editInlineText.trim()) {
                                updateComment.mutate(
                                  { commentId: activeComment.comment.id, comment: editInlineText.trim() },
                                  {
                                    onSuccess: () => {
                                      setEditingInlineId(null);
                                      setActiveComment(null);
                                    },
                                  }
                                );
                              }
                            }}
                          >
                            Guardar
                          </Button>
                        </div>
                      </div>
                    ) : (
                      // Display mode
                      <div>
                        <p className="text-sm text-foreground/90 leading-relaxed">
                          {activeComment.comment.comment}
                        </p>
                        {!isAccepted && (
                          <div className="flex items-center justify-end gap-1 mt-2 pt-2 border-t border-border/50">
                            <button
                              onClick={() => {
                                setEditingInlineId(activeComment.comment.id);
                                setEditInlineText(activeComment.comment.comment);
                              }}
                              className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                              title="Editar"
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              onClick={() => {
                                deleteComment.mutate(activeComment.comment.id);
                                setActiveComment(null);
                              }}
                              className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                              title="Eliminar"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-muted-foreground text-sm text-center mt-10">
              No se encontró contenido.
            </div>
          )}

          {/* ── Bottom comments summary ─── */}
          {comments.length > 0 && (
            <div className="mt-6 border-t border-border/50 pt-4">
              <div className="flex items-center gap-1.5 mb-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                <MessageSquare size={12} />
                {comments.length} comentario{comments.length > 1 ? "s" : ""}
              </div>
              <div className="space-y-2">
                {comments.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => scrollToHighlight(c.id)}
                    className="w-full text-left group rounded-lg border border-border/40 hover:border-primary/30 bg-card/30 hover:bg-card/60 p-2.5 text-sm transition-all cursor-pointer"
                  >
                    {c.blockRef && (
                      <div className="text-[10px] font-medium text-primary/60 mb-0.5 uppercase tracking-wide">
                        {c.blockRef}
                      </div>
                    )}
                    {c.selectedText && (
                      <div className="text-xs text-muted-foreground/60 italic truncate mb-1">
                        "{c.selectedText}"
                      </div>
                    )}
                    <p className="text-foreground/80 leading-snug text-xs">{c.comment}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </Panel>
    </>
  );
}
