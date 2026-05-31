import React, { useMemo, useDeferredValue, useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { StopCircle, CheckCircle2, Clock, XCircle, FileText } from "@/components/ui/icons";

import { markdownParser } from "@/workers/markdownParserWorkerClient";
import { ContentPiece, CustomTagInfo } from "@/workers/markdown_parser_types";

import { VibesWrite } from "./VibesWrite";
import { VibesRename } from "./VibesRename";
import { VibesDelete } from "./VibesDelete";
import { VibesAddDependency } from "./VibesAddDependency";
import { VibesExecuteSql } from "./VibesExecuteSql";
import { VibesLogs } from "./VibesLogs";
import { VibesGrep } from "./VibesGrep";
import { VibesGit } from "./VibesGit";
import { VibesGitCommit } from "./VibesGitCommit";
import { VibesAskUser } from "./VibesAskUser";
import { VibesAddIntegration } from "./VibesAddIntegration";
import { VibesEdit } from "./VibesEdit";
import { VibesSearchReplace } from "./VibesSearchReplace";
import { VibesPatch } from "./VibesPatch";
import { VibesTypecheckSummary } from "./VibesTypecheckSummary";
import { VibesCodebaseContext } from "./VibesCodebaseContext";
import { VibesThink } from "./VibesThink";
import { CodeHighlight } from "./CodeHighlight";
import { useAtomValue, useSetAtom } from "jotai";
import { isStreamingByIdAtom, selectedChatIdAtom, isZenModeAtom, isFlowModeAtom } from "@/atoms/chatAtoms";
import { artifactsSidebarOpenAtom, selectedArtifactPathAtom } from "@/atoms/uiAtoms";
import { CustomTagState } from "./stateTypes";
import { VibesOutput } from "./VibesOutput";
import { FilesChangedBar } from "./FilesChangedBar";
import { VibesProblemSummary } from "./VibesProblemSummary";


import { VibesWebCrawl } from "./VibesWebCrawl";
import { VibesCodeSearchResult } from "./VibesCodeSearchResult";
import { VibesCodeSearch } from "./VibesCodeSearch";
import { VibesRead } from "./VibesRead";
import { VibesListFiles } from "./VibesListFiles";
import { VibesDatabaseSchema } from "./VibesDatabaseSchema";
import { VibesSupabaseTableSchema } from "./VibesSupabaseTableSchema";
import { VibesSupabaseProjectInfo } from "./VibesSupabaseProjectInfo";
import { VibesStatus } from "./VibesStatus";
import { SuggestedAction } from "@/lib/schemas";
import { FixAllErrorsButton } from "./FixAllErrorsButton";
import { unescapeXmlAttr, unescapeXmlContent } from "../../../shared/xmlEscape";
import { CompactToolBadge, shouldCompact, getToolDetail, resolveToolMeta, type ToolBadgeState } from "./CompactToolBadge";
import { GroupedToolBadges, type BadgeItem } from "./GroupedToolBadges";
import { LiveThinkingPanel } from "./LiveThinkingPanel";
import { FlowThinkBlock } from "./FlowThinkBlock";
import { FlowActivityTrace } from "./FlowActivityTrace";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function cleanVibesPath(p: string): string {
  const dotIndex = p.indexOf(".vibes/");
  if (dotIndex !== -1) {
    return p.substring(dotIndex);
  }
  const noDotIndex = p.indexOf("vibes/");
  if (noDotIndex !== -1) {
    return "." + p.substring(noDotIndex);
  }
  return p;
}


/** Clickable token-usage pill: shows Icon + price, click opens detailed breakdown */
const TokenUsageBadge: React.FC<{
  icon: React.ElementType;
  color: string;
  label: string;
  detail?: string;
  modalContent: React.ReactNode;
}> = ({ icon: Icon, color, label, detail, modalContent }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-muted/50 hover:bg-accent text-xs mb-4 cursor-pointer transition-colors"
      >
        <Icon size={12} className={color} />
        {detail && (
          <span className="text-muted-foreground">{detail}</span>
        )}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className={`flex items-center gap-2 ${color}`}>
              <Icon size={20} />
              {label}
              {detail && <span className="text-muted-foreground font-normal typo-body ml-1">{detail}</span>}
            </DialogTitle>
          </DialogHeader>
          <div className="mt-2">{modalContent}</div>
        </DialogContent>
      </Dialog>
    </>
  );
};

const VIBES_CUSTOM_TAGS = [
  "vibes-write",
  "vibes-rename",
  "vibes-delete",
  "vibes-add-dependency",
  "vibes-execute-sql",
  "vibes-read-logs",
  "vibes-add-integration",
  "vibes-output",
  "vibes-problem-report",
  "vibes-chat-summary",
  "set_chat_summary",
  "vibes-edit",
  "vibes-grep",
  "vibes-search-replace",
  "vibes-codebase-context",

  "vibes-web-crawl",
  "vibes-code-search-result",
  "vibes-code-search",
  "vibes-read",
  "think",
  "thought",
  "vibes-command",
  "vibes-mcp-tool-call",
  "vibes-mcp-tool-result",

  "vibes-list-files",
  "vibes-database-schema",
  "vibes-supabase-table-schema",
  "vibes-supabase-project-info",
  "vibes-pocketbase-info",
  "vibes-pocketbase-storage-info",
  "vibes-bunny-db-info",
  "vibes-bunny-storage-info",
  "vibes-status",
  "vibes-think",
  "vibes-git",
  "vibes-git-commit",
  "vibes-ask-user",
  "vibes-patch",
  "vibes-run-command",
  "vibes-start-process",
  "vibes-stop-process",
  "vibes-list-processes",
  "vibes-wait-http",
  "vibes-typecheck-summary",
  "vibes-token-usage",
  "vibes-cancelled",
  "vibes-files-changed",
];

const REMARK_PLUGINS = [remarkGfm];

const customLink = ({
  node: _node,
  ...props
}: {
  node?: any;
  [key: string]: any;
}) => (
  <a
    {...props}
    onClick={(e) => {
      e.preventDefault();
      window.open(props.href, "_blank");
    }}
    className="text-blue-400 hover:text-blue-300 underline"
  />
);

// Custom blockquote that applies purple styling for agent answer quotes
// Detected by a zero-width space (\u200B) prefix injected by the question reply handler
const customBlockquote = ({ children, ...props }: any) => {
  const textContent = extractTextFromChildren(children);
  const isAnswerQuote = textContent.trimStart().startsWith("\u200B");

  if (isAnswerQuote) {
    const strippedChildren = stripZwsMarker(children);
    return (
      <blockquote
        {...props}
        style={{
          borderLeft: "3px solid var(--accent-teal-quote-border)",
          padding: "6px 12px",
          margin: "10px 0",
          background: "var(--accent-teal-quote-bg)",
          borderRadius: "0 6px 6px 0",
          color: "var(--accent-teal-quote-text)",
          fontStyle: "normal",
          fontSize: "13px",
        }}
      >
        {strippedChildren}
      </blockquote>
    );
  }

  return <blockquote {...props}>{children}</blockquote>;
};

// Extract text from React children for content detection
function extractTextFromChildren(children: any): string {
  if (typeof children === "string") return children;
  if (Array.isArray(children)) return children.map(extractTextFromChildren).join("");
  if (children?.props?.children) return extractTextFromChildren(children.props.children);
  return "";
}

// Strip the invisible zero-width space marker from React children tree
function stripZwsMarker(children: any): any {
  if (typeof children === "string") return children.replace(/\u200B/g, "");
  if (Array.isArray(children)) return children.map(stripZwsMarker);
  if (children?.props?.children) {
    const { children: innerChildren, ...rest } = children.props;
    return { ...children, props: { ...rest, children: stripZwsMarker(innerChildren) } };
  }
  return children;
}

export const MARKDOWN_COMPONENTS = {
  a: customLink,
  code: CodeHighlight,
  blockquote: customBlockquote,
};

export const VanillaMarkdownParser = React.memo(function VanillaMarkdownParser({ content }: { content: string }) {
  return (
    <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={MARKDOWN_COMPONENTS}>
      {content}
    </ReactMarkdown>
  );
});

interface VibesMarkdownParserProps {
  content: string;
  isStreaming?: boolean;
  chatId?: number;
  forceFullMode?: boolean;
  isGitMessage?: boolean;
}

/**
 * Custom component to parse markdown content with Vibes-specific tags
 */
export const VibesMarkdownParser = React.memo(function VibesMarkdownParser({
  content,
  isStreaming: forceStreaming,
  chatId: forceChatId,
  forceFullMode,
  isGitMessage,
}: VibesMarkdownParserProps) {
  const selectedChatId = useAtomValue(selectedChatIdAtom);
  const chatId = forceChatId ?? selectedChatId;
  const isStreamingMap = useAtomValue(isStreamingByIdAtom);
  const isStreaming = forceStreaming ?? (isStreamingMap.get(chatId!) ?? false);
  const isZenModeAtomValue = useAtomValue(isZenModeAtom);
  const isZenMode = forceFullMode ? false : isZenModeAtomValue;
  const isFlowModeAtomValue = useAtomValue(isFlowModeAtom);
  const isFlowMode = forceFullMode ? false : isFlowModeAtomValue;

  const setSelectedPath = useSetAtom(selectedArtifactPathAtom);
  const setSidebarOpen = useSetAtom(artifactsSidebarOpenAtom);

  // Optimize: Do we really need to defer content and use a worker if it's not streaming?
  // When a message is static (not streaming), we want to parse it exactly once
  // synchronously so that fast scrolling doesn't create flashes of unparsed content.
  const deferredContent = useDeferredValue(content);
  const activeContent = isStreaming ? deferredContent : content;

  // Initialize with synchronous parse to avoid flash of content
  const [contentPieces, setContentPieces] = useState<ContentPiece[]>(() => {
    return parseCustomTags(activeContent);
  });

  // Keep state in sync with content changes, particularly on remount
  // or when static content updates.
  useEffect(() => {
    let isCancelled = false;

    if (isStreaming) {
      // Use worker for updates to avoid blocking main thread ONLY during active streaming
      markdownParser
        .parse(activeContent)
        .then((pieces) => {
          if (!isCancelled) {
            setContentPieces(pieces);
          }
        })
        .catch((err) => {
          console.error("Worker extraction failed, falling back to sync:", err);
          if (!isCancelled) {
            setContentPieces(parseCustomTags(activeContent));
          }
        });
    } else {
      // For static messages, parse synchronously immediately.
      // This is crucial for fast scrolling so there's zero frames of delay.
      setContentPieces(parseCustomTags(activeContent));
    }

    return () => {
      isCancelled = true;
    };
  }, [activeContent, isStreaming]);

  // Extract error messages and track positions
  const { errorMessages, lastErrorIndex, errorCount } = useMemo(() => {

    const errors: string[] = [];
    let lastIndex = -1;
    let count = 0;

    contentPieces.forEach((piece, index) => {
      if (
        piece.type === "custom-tag" &&
        piece.tagInfo.tag === "vibes-output" &&
        piece.tagInfo.attributes.type === "error"
      ) {
        const errorMessage = piece.tagInfo.attributes.message;
        if (errorMessage?.trim()) {
          errors.push(errorMessage.trim());
          count++;
          lastIndex = index;
        }
      }
    });

    return {
      errorMessages: errors,
      lastErrorIndex: lastIndex,
      errorCount: count,
    };
  }, [contentPieces]);

  // Group content pieces for compact rendering
  const renderPieces = () => {
    const elements: React.ReactNode[] = [];
    let badgeGroup: BadgeItem[] = [];
    let groupIndex = 0;

    // Find the last think tag index so we can keep it expanded during streaming
    const THINK_TAGS = new Set(["think", "thought", "vibes-think"]);
    let lastThinkIndex = -1;
    if (isStreaming) {
      for (let i = contentPieces.length - 1; i >= 0; i--) {
        const p = contentPieces[i];
        if (p.type === "custom-tag" && THINK_TAGS.has(p.tagInfo.tag)) {
          lastThinkIndex = i;
          break;
        }
      }
    }

    const flushBadgeGroup = () => {
      if (badgeGroup.length > 0) {
        // Token-usage badges are no longer rendered inline — they live in ChatMessage footer.
        const groupableBadges = badgeGroup.filter(b => b.tag !== "vibes-token-usage");

        const currentGroupIndex = groupIndex;
        groupIndex++;

        if (groupableBadges.length > 0) {
          const capturedBadges = [...groupableBadges];
          elements.push(
            <div key={`badge-group-${elements.length}`} className="mt-1.5 mb-4">
              <GroupedToolBadges
                badges={capturedBadges}
                isStreaming={isStreaming}
                isFirstGroup={currentGroupIndex === 0}
              />
            </div>
          );
        }

        badgeGroup = [];
      }
    };

    // Helper: check if the next non-whitespace piece is a compactable tag
    const isNextPieceCompactable = (currentIndex: number): boolean => {
      for (let i = currentIndex + 1; i < contentPieces.length; i++) {
        const next = contentPieces[i];
        if (next.type === "markdown") {
          if (next.content && next.content.trim()) return false; // real markdown text
          continue; // whitespace-only, skip
        }
        if (next.type === "custom-tag") {
          return shouldCompact(next.tagInfo.tag);
        }
      }
      return false;
    };

    // Buffer for consecutive flow-mode think blocks (merged into one FlowThinkBlock)
    let flowThinkBuffer: string[] = [];
    const flushFlowThinkBuffer = (isActivelyStreaming = false) => {
      if (flowThinkBuffer.length > 0) {
        const merged = flowThinkBuffer.join("\n\n");
        elements.push(
          <FlowThinkBlock
            key={`flow-think-merged-${elements.length}`}
            content={merged}
            markdownComponents={MARKDOWN_COMPONENTS}
            isStreaming={isActivelyStreaming}
          />
        );
        flowThinkBuffer = [];
      }
    };

    // Tags that produce visible output in zen/flow mode
    const ZEN_ALLOWED_TAGS = new Set(["vibes-output", "vibes-ask-user", "vibes-cancelled", "vibes-git-commit", "vibes-files-changed"]);

    // Helper: check if there's another flow-mode think tag ahead, skipping invisible pieces.
    // Invisible pieces = whitespace-only markdown + tool tags that zen mode discards.
    const isNextPieceFlowThink = (currentIndex: number): boolean => {
      for (let i = currentIndex + 1; i < contentPieces.length; i++) {
        const next = contentPieces[i];
        if (next.type === "markdown") {
          if (next.content && next.content.trim()) return false; // real prose breaks the run
          continue; // whitespace-only, skip
        }
        if (next.type === "custom-tag") {
          const nextTag = next.tagInfo.tag;
          // Think tag with content → yes, merge
          if (THINK_TAGS.has(nextTag) && next.tagInfo.content?.trim()) return true;
          // Visible zen tag (output, ask-user) → breaks the run
          if (ZEN_ALLOWED_TAGS.has(nextTag)) return false;
          // Everything else (tool tags) is invisible in flow mode → skip over
          continue;
        }
      }
      return false;
    };

    contentPieces.forEach((piece, index) => {
      if (piece.type === "markdown") {
        const isWhitespaceOnly = !piece.content || !piece.content.trim();
        // Only flush if this is real markdown content AND we're not between compactable tags
        if (!isZenMode && isWhitespaceOnly && badgeGroup.length > 0 && isNextPieceCompactable(index)) {
          // Skip whitespace between compactable tags — don't break the row
          return;
        }
        // In flow mode, skip whitespace between consecutive think tags (keep them merged)
        if (isFlowMode && isZenMode && isWhitespaceOnly && flowThinkBuffer.length > 0 && isNextPieceFlowThink(index)) {
          return;
        }
        // Real prose content: flush any pending flow think buffer first
        if (piece.content && piece.content.trim()) {
          flushFlowThinkBuffer();
        }
        flushBadgeGroup();
        if (piece.content && piece.content.trim()) {
          elements.push(
            <React.Fragment key={index}>
              <ReactMarkdown
                remarkPlugins={REMARK_PLUGINS}
                components={MARKDOWN_COMPONENTS}
              >
                {piece.content}
              </ReactMarkdown>
            </React.Fragment>
          );
        }
      } else {
        const { tag, attributes, inProgress } = piece.tagInfo;
        const state = getState({ isStreaming, inProgress });
        const isThinkTag = THINK_TAGS.has(tag);

        // ── Zen / Flow Mode: skip almost all custom tags ──
        // Only keep: vibes-output (errors/warnings), vibes-ask-user (interactive).
        // Flow mode additionally keeps think tags visible as expanded panels.
        // Token-usage is discarded. Everything else is discarded.
        if (isZenMode) {
          if (ZEN_ALLOWED_TAGS.has(tag)) {
            // Non-think tag: flush pending think buffer first
            flushFlowThinkBuffer();
            // Render output/ask-user normally
            elements.push(
              <React.Fragment key={index}>
                {renderCustomTag(piece.tagInfo, { isStreaming })}
              </React.Fragment>
            );
          } else if (isFlowMode && isThinkTag && piece.tagInfo.content?.trim()) {
            // Flow mode: accumulate consecutive think tags into the buffer
            flowThinkBuffer.push(piece.tagInfo.content);
            // If the next piece is NOT another think tag, flush now —
            // BUT only if there's actual visible content after us (prose, output, etc.).
            // If we're just at the end of the parsed content during streaming,
            // let the final flush handle it (it knows about streaming state).
            if (!isNextPieceFlowThink(index)) {
              const hasVisibleContentAfter = contentPieces.slice(index + 1).some((p) => {
                if (p.type === "markdown") return !!(p.content && p.content.trim());
                if (p.type === "custom-tag") return ZEN_ALLOWED_TAGS.has(p.tagInfo.tag);
                return false;
              });
              if (hasVisibleContentAfter || !isStreaming) {
                flushFlowThinkBuffer(); // non-think content follows → think block is done
              }
              // else: streaming and nothing visible after → let final flush handle it
            }
          } else if (isFlowMode && shouldCompact(tag) && tag !== "vibes-token-usage") {
            // Enhanced Flow Mode: Render a quiet inline text-only status line
            flushFlowThinkBuffer();
            elements.push(
              <FlowActivityTrace
                key={`flow-trace-${index}`}
                tag={tag}
                attributes={attributes}
                state={state}
                originalContent={renderModalContent(piece.tagInfo, { isStreaming })}
              />
            );
          }
          // All other tags: skip entirely — no DOM, no badges, no modals

          // Error button after last error (still useful in zen mode)
          if (
            index === lastErrorIndex &&
            errorCount > 1 &&
            !isStreaming &&
            chatId
          ) {
            flushFlowThinkBuffer();
            elements.push(
              <div key={`fix-errors-${index}`} className="mt-3 w-full flex">
                <FixAllErrorsButton
                  errorMessages={errorMessages}
                  chatId={chatId}
                />
              </div>
            );
          }
          return; // Skip full-mode rendering below
        }

        // ── Full Mode (existing behavior) ──
        if (shouldCompact(tag)) {
          const detail = getToolDetail(tag, attributes);
          const originalContent = renderModalContent(piece.tagInfo, { isStreaming });
          const badgeState: ToolBadgeState = state;

          // During streaming, keep the LAST think tag expanded as a LiveThinkingPanel
          if (isThinkTag && isStreaming && index === lastThinkIndex && piece.tagInfo.content) {
            flushBadgeGroup();
            elements.push(
              <LiveThinkingPanel
                key={`live-think-${index}`}
                content={piece.tagInfo.content}
                isActive={inProgress}
              />
            );
          } else if (badgeState === "pending") {
            // Other pending tags: skip — the streaming loader handles in-progress indication
          } else {
            // Finished/aborted items accumulate as structured badge data
            badgeGroup.push({
              tag,
              state: badgeState,
              detail,
              originalContent,
              attributes,
            });
          }
        } else {
          // Non-compactable tags render normally
          flushBadgeGroup();
          elements.push(
            <React.Fragment key={index}>
              {renderCustomTag(piece.tagInfo, { isStreaming })}
            </React.Fragment>
          );
        }

        // Error button after last error
        if (
          index === lastErrorIndex &&
          errorCount > 1 &&
          !isStreaming &&
          chatId
        ) {
          flushBadgeGroup();
          elements.push(
            <div key={`fix-errors-${index}`} className="mt-3 w-full flex">
              <FixAllErrorsButton
                errorMessages={errorMessages}
                chatId={chatId}
              />
            </div>
          );
        }
      }
    });

    flushFlowThinkBuffer(isStreaming);
    flushBadgeGroup();

    // Append per-message artifact buttons for any .vibes/*.md files mentioned or written
    if (!isStreaming && !isGitMessage) {
      const vibesMatchSet = new Set<string>();

      for (const piece of contentPieces) {
        if (piece.type === "markdown") {
          if (piece.content) {
            // Match any .md file inside .vibes/ (not just plan/walkthrough)
            const matches = Array.from(piece.content.matchAll(/\.?vibes\/[\w\-.]+\.md/g) || []).map(m => cleanVibesPath(m[0]));
            for (const m of matches) vibesMatchSet.add(m);
          }
        } else if (piece.type === "custom-tag") {
          const tag = piece.tagInfo.tag;
          if (["vibes-write", "vibes-patch", "vibes-edit", "vibes-search-replace"].includes(tag)) {
            const pathAttr = piece.tagInfo.attributes.path;
            if (pathAttr && /\.?vibes\/[\w\-.]+\.md/.test(pathAttr)) {
              vibesMatchSet.add(cleanVibesPath(pathAttr));
            }
          }
        }
      }

      const pathsToRender = Array.from(vibesMatchSet);

      if (pathsToRender.length > 0) {
        elements.push(
          <div key="artifact-buttons" className="mt-3 pt-3 border-t border-border/20 flex flex-wrap gap-2">
            {pathsToRender.map((artifactPath) => {
              // Derive a human-friendly label from the filename prefix
              const basename = artifactPath.split("/").pop() || artifactPath;
              let label = "Ver documento";
              if (/^plan[-_]/i.test(basename)) label = "Ver plan";
              else if (/^walk(?:through)?[-_]/i.test(basename)) label = "Ver cambios";
              else if (/^summary[-_]/i.test(basename) || /^resumen[-_]/i.test(basename)) label = "Ver resumen";

              return (
                <button
                  key={artifactPath}
                  type="button"
                  className="inline-flex items-center justify-center gap-2 rounded-md px-3 h-8 text-sm font-normal bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80 transition-colors cursor-pointer"
                  onClick={() => {
                    const normalizedPath = cleanVibesPath(artifactPath);
                    setSelectedPath(normalizedPath);
                    setSidebarOpen(true);
                  }}
                >
                  <FileText size={14} />
                  {label}
                </button>
              );
            })}
          </div>
        );
      }
    }

    return elements;
  };

  return <>{renderPieces()}</>;
});

/**
 * Pre-process content to handle unclosed custom tags
 * Adds closing tags at the end of the content for any unclosed custom tags
 * Assumes the opening tags are complete and valid
 * Returns the processed content and a map of in-progress tags
 */
function preprocessUnclosedTags(content: string): {
  processedContent: string;
  inProgressTags: Map<string, Set<number>>;
} {
  let processedContent = content;
  // Map to track which tags are in progress and their positions
  const inProgressTags = new Map<string, Set<number>>();

  // For each tag type, check if there are unclosed tags
  for (const tagName of VIBES_CUSTOM_TAGS) {
    // Count opening and closing tags
    const openTagPattern = new RegExp(`<${tagName}(?:\\s[^>]*)?>`, "g");
    const closeTagPattern = new RegExp(`</${tagName}>`, "g");

    // Track the positions of opening tags
    const openingMatches: RegExpExecArray[] = [];
    let match;

    // Reset regex lastIndex to start from the beginning
    openTagPattern.lastIndex = 0;

    while ((match = openTagPattern.exec(processedContent)) !== null) {
      openingMatches.push({ ...match });
    }

    const openCount = openingMatches.length;
    const closeCount = (processedContent.match(closeTagPattern) || []).length;

    // If we have more opening than closing tags
    const missingCloseTags = openCount - closeCount;
    if (missingCloseTags > 0) {
      // Add the required number of closing tags at the end
      processedContent += Array(missingCloseTags)
        .fill(`</${tagName}>`)
        .join("");

      // Mark the last N tags as in progress where N is the number of missing closing tags
      const inProgressIndexes = new Set<number>();
      const startIndex = openCount - missingCloseTags;
      for (let i = startIndex; i < openCount; i++) {
        inProgressIndexes.add(openingMatches[i].index);
      }
      inProgressTags.set(tagName, inProgressIndexes);
    }
  }

  return { processedContent, inProgressTags };
}

/**
 * Parse the content to extract custom tags and markdown sections into a unified array
 */
function parseCustomTags(content: string): ContentPiece[] {
  const { processedContent, inProgressTags } = preprocessUnclosedTags(content);

  const tagPattern = new RegExp(
    `<(${VIBES_CUSTOM_TAGS.join("|")})\\s*([^>]*)>(.*?)<\\/\\1>`,
    "gs",
  );

  const contentPieces: ContentPiece[] = [];
  let lastIndex = 0;
  let match;

  // Find all custom tags
  while ((match = tagPattern.exec(processedContent)) !== null) {
    const [fullMatch, tag, attributesStr, tagContent] = match;
    const startIndex = match.index;

    // Add the markdown content before this tag
    if (startIndex > lastIndex) {
      contentPieces.push({
        type: "markdown",
        content: processedContent.substring(lastIndex, startIndex),
      });
    }

    // Parse attributes and unescape values
    const attributes: Record<string, string> = {};
    const attrPattern = /([\w-]+)="([^"]*)"/g;
    let attrMatch;
    while ((attrMatch = attrPattern.exec(attributesStr)) !== null) {
      attributes[attrMatch[1]] = unescapeXmlAttr(attrMatch[2]);
    }

    // Check if this tag was marked as in progress
    const tagInProgressSet = inProgressTags.get(tag);
    const isInProgress = tagInProgressSet?.has(startIndex);

    // Add the tag info with unescaped content
    contentPieces.push({
      type: "custom-tag",
      tagInfo: {
        tag,
        attributes,
        content: unescapeXmlContent(tagContent),
        fullMatch,
        inProgress: isInProgress || false,
      },
    });

    lastIndex = startIndex + fullMatch.length;
  }

  // Add the remaining markdown content
  if (lastIndex < processedContent.length) {
    contentPieces.push({
      type: "markdown",
      content: processedContent.substring(lastIndex),
    });
  }

  return contentPieces;
}

function getState({
  isStreaming,
  inProgress,
}: {
  isStreaming?: boolean;
  inProgress?: boolean;
}): CustomTagState {
  if (!inProgress) {
    return "finished";
  }
  return isStreaming ? "pending" : "aborted";
}

/**
 * Render a custom tag based on its type
 */
function renderCustomTag(
  tagInfo: CustomTagInfo,
  { isStreaming }: { isStreaming: boolean },
): React.ReactNode {
  const { tag, attributes, content, inProgress } = tagInfo;

  switch (tag) {
    case "vibes-read":
      return (
        <VibesRead
          node={{
            properties: {
              path: attributes.path || "",
            },
          }}
        >
          {content}
        </VibesRead>
      );

    case "vibes-web-crawl":
      return (
        <VibesWebCrawl
          node={{
            properties: {
              url: attributes.url || attributes.query || "",
              state: getState({ isStreaming, inProgress }),
            },
          }}
        >
          {content}
        </VibesWebCrawl>
      );
    case "vibes-code-search":
      return (
        <VibesCodeSearch
          node={{
            properties: {
              query: attributes.query || "",
              state: getState({ isStreaming, inProgress }),
            },
          }}
        >
          {content}
        </VibesCodeSearch>
      );
    case "vibes-code-search-result":
      return (
        <VibesCodeSearchResult
          node={{
            properties: {},
          }}
        >
          {content}
        </VibesCodeSearchResult>
      );

    case "think":
    case "thought":
    case "vibes-think":
      return (
        <VibesThink
          node={{
            properties: {
              state: getState({ isStreaming, inProgress }),
            },
          }}
        >
          {content}
        </VibesThink>
      );
    case "vibes-write":
      return (
        <VibesWrite
          node={{
            properties: {
              path: attributes.path || "",
              description: attributes.description || "",
              retryCount: attributes["retry-count"] || "",
              state: getState({ isStreaming, inProgress }),
            },
          }}
        >
          {content}
        </VibesWrite>
      );

    case "vibes-rename":
      return (
        <VibesRename
          node={{
            properties: {
              from: attributes.from || "",
              to: attributes.to || "",
            },
          }}
        >
          {content}
        </VibesRename>
      );

    case "vibes-delete":
      return (
        <VibesDelete
          node={{
            properties: {
              path: attributes.path || "",
            },
          }}
        >
          {content}
        </VibesDelete>
      );

    case "vibes-add-dependency":
      return (
        <VibesAddDependency
          node={{
            properties: {
              packages: attributes.packages || "",
            },
          }}
        >
          {content}
        </VibesAddDependency>
      );

    case "vibes-execute-sql":
      return (
        <VibesExecuteSql
          node={{
            properties: {
              state: getState({ isStreaming, inProgress }),
              description: attributes.description || "",
            },
          }}
        >
          {content}
        </VibesExecuteSql>
      );

    case "vibes-read-logs":
      return (
        <VibesLogs
          node={{
            properties: {
              state: getState({ isStreaming, inProgress }),
              time: attributes.time || "",
              type: attributes.type || "",
              level: attributes.level || "",
              count: attributes.count || "",
            },
          }}
        >
          {content}
        </VibesLogs>
      );

    case "vibes-grep":
      return (
        <VibesGrep
          node={{
            properties: {
              state: getState({ isStreaming, inProgress }),
              query: attributes.query || "",
              include: attributes.include || "",
              exclude: attributes.exclude || "",
              "case-sensitive": attributes["case-sensitive"] || "",
              count: attributes.count || "",
            },
          }}
        >
          {content}
        </VibesGrep>
      );

    case "vibes-add-integration":
      return (
        <VibesAddIntegration
          node={{
            properties: {
              provider: attributes.provider || "",
            },
          }}
        >
          {content}
        </VibesAddIntegration>
      );

    case "vibes-edit":
      return (
        <VibesEdit
          node={{
            properties: {
              path: attributes.path || "",
              description: attributes.description || "",
              retryCount: attributes["retry-count"] || "",
              state: getState({ isStreaming, inProgress }),
            },
          }}
        >
          {content}
        </VibesEdit>
      );

    case "vibes-search-replace":
      return (
        <VibesSearchReplace
          node={{
            properties: {
              path: attributes.path || "",
              description: attributes.description || "",
              retryCount: attributes["retry-count"] || "",
              state: getState({ isStreaming, inProgress }),
            },
          }}
        >
          {content}
        </VibesSearchReplace>
      );

    case "vibes-patch":
      return (
        <VibesPatch
          node={{
            properties: {
              path: attributes.path || "",
              description: attributes.description || "",
              lines: attributes.lines || "",
              retryCount: attributes["retry-count"] || "",
              state: getState({ isStreaming, inProgress }),
            },
          }}
        >
          {content}
        </VibesPatch>
      );

    case "vibes-codebase-context":
      return (
        <VibesCodebaseContext
          node={{
            properties: {
              files: attributes.files || "",
              state: getState({ isStreaming, inProgress }),
            },
          }}
        >
          {content}
        </VibesCodebaseContext>
      );


    case "vibes-output":
      return (
        <VibesOutput
          type={attributes.type as "warning" | "error" | "success" | "info"}
          message={attributes.message}
        >
          {content}
        </VibesOutput>
      );

    case "vibes-problem-report":
      return (
        <VibesProblemSummary summary={attributes.summary}>
          {content}
        </VibesProblemSummary>
      );

    case "vibes-chat-summary":
    case "set_chat_summary":
      // Don't render anything for chat summary tags
      return null;

    case "vibes-command":
      // Botones de "Actualizar vista" y "Reiniciar app" eliminados a petición del usuario
      return null;

    case "vibes-list-files":
      return (
        <VibesListFiles
          node={{
            properties: {
              directory: attributes.directory || "",
              recursive: attributes.recursive || "",
              state: getState({ isStreaming, inProgress }),
            },
          }}
        >
          {content}
        </VibesListFiles>
      );

    case "vibes-database-schema":
      return (
        <VibesDatabaseSchema
          node={{
            properties: {
              state: getState({ isStreaming, inProgress }),
            },
          }}
        >
          {content}
        </VibesDatabaseSchema>
      );

    case "vibes-supabase-table-schema":
      return (
        <VibesSupabaseTableSchema
          node={{
            properties: {
              table: attributes.table || "",
              state: getState({ isStreaming, inProgress }),
            },
          }}
        >
          {content}
        </VibesSupabaseTableSchema>
      );

    case "vibes-supabase-project-info":
      return (
        <VibesSupabaseProjectInfo
          node={{
            properties: {
              state: getState({ isStreaming, inProgress }),
            },
          }}
        >
          {content}
        </VibesSupabaseProjectInfo>
      );

    case "vibes-bunny-db-info":
      return (
        <VibesSupabaseProjectInfo
          node={{
            properties: {
              state: getState({ isStreaming, inProgress }),
            },
          }}
        >
          {content}
        </VibesSupabaseProjectInfo>
      );

    case "vibes-bunny-storage-info":
      return (
        <VibesSupabaseProjectInfo
          node={{
            properties: {
              state: getState({ isStreaming, inProgress }),
            },
          }}
        >
          {content}
        </VibesSupabaseProjectInfo>
      );

    case "vibes-status":
      return (
        <VibesStatus
          node={{
            properties: {
              title: attributes.title || "Processing...",
              state: getState({ isStreaming, inProgress }),
            },
          }}
        >
          {content}
        </VibesStatus>
      );

    case "vibes-git":
      return (
        <VibesGit
          node={{
            properties: {
              state: getState({ isStreaming, inProgress }),
              operation: attributes.operation || "",
              file_path: attributes.file_path,
              commit: attributes.commit,
              branch: attributes.branch,
              ref: attributes.ref,
              message: attributes.message,
              limit: attributes.limit,
              offset: attributes.offset,
              index: attributes.index,
            },
          }}
        >
          {content}
        </VibesGit>
      );

    case "vibes-git-commit":
      return (
        <VibesGitCommit
          action={attributes.action}
          files={attributes.files}
        >
          {content}
        </VibesGitCommit>
      );

    case "vibes-ask-user":
      return (
        <VibesAskUser
          node={{
            properties: {
              state: getState({ isStreaming, inProgress }),
              question: attributes.question || "",
              options: attributes.options || "",
              context: attributes.context || "",
              requestId: attributes.requestid || "",
            },
          }}
        >
          {content}
        </VibesAskUser>
      );

    // === Process/command tools (Phase 1) ===
    case "vibes-run-command":
    case "vibes-start-process":
    case "vibes-stop-process":
    case "vibes-list-processes":
    case "vibes-wait-http": {
      const cmd = attributes.cmd || "";
      const url = attributes.url || "";
      const processId = attributes["process-id"] || "";
      const status = attributes.status || "";
      const exitCode = attributes["exit-code"] || "";
      const duration = attributes.duration || "";
      const count = attributes.count || "";

      const headerLabel = cmd || url || processId || tag;
      const statusColor = status === "success" || status === "ok" || status === "ready"
        ? "text-green-500"
        : status === "error" || status === "crashed"
          ? "text-red-500"
          : status === "timeout"
            ? "text-amber-500"
            : "text-muted-foreground";

      return (
        <div className="my-2 rounded-lg border border-border bg-muted/30 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 text-xs font-mono border-b border-border">
            <span className="text-muted-foreground">$</span>
            <span className="font-medium">{headerLabel}</span>
            {status && <span className={`ml-auto font-medium ${statusColor}`}>{status}</span>}
            {exitCode && <span className="text-muted-foreground">exit: {exitCode}</span>}
            {duration && <span className="text-muted-foreground">{duration}</span>}
            {count && <span className="text-muted-foreground">{count} processes</span>}
          </div>
          {content && (
            <div className="px-3 py-2 text-xs font-mono whitespace-pre-wrap break-all max-h-60 overflow-y-auto">
              {content}
            </div>
          )}
        </div>
      );
    }

    case "vibes-typecheck-summary":
      return (
        <VibesTypecheckSummary
          node={{
            properties: {
              "has-errors": attributes["has-errors"] || "false",
            },
          }}
        >
          {content}
        </VibesTypecheckSummary>
      );

    case "vibes-token-usage":
    case "vibes-pocketbase-info":
    case "vibes-pocketbase-storage-info":
      // Rendered primarily as compact badge + modal
      return null;

    case "vibes-cancelled":
      return (
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            padding: "4px 10px",
            borderRadius: "6px",
            background: "var(--muted)",
            marginTop: "8px",
          }}
        >
          <StopCircle size={13} style={{ color: "var(--muted-foreground)", opacity: 0.7 }} />
          <span
            style={{
              fontSize: "12px",
              color: "var(--muted-foreground)",
              fontWeight: 500,
            }}
          >
            Respuesta cancelada
          </span>
        </div>
      );

    case "vibes-files-changed":
      return (
        <FilesChangedBar
          files={parseInt(attributes.files || "0", 10)}
          insertions={parseInt(attributes.insertions || "0", 10)}
          deletions={parseInt(attributes.deletions || "0", 10)}
          paths={attributes.paths || ""}
        />
      );

    default:
      return null;
  }
}

/**
 * Render clean modal body content for a compactable tag.
 * Unlike renderCustomTag, this renders ONLY the useful body content (path, description,
 * code, file listing, etc.) without the wrapper UI (borders, headers, icons, expand/collapse buttons).
 * The CompactToolBadge modal already provides the title, icon, and detail.
 */
function renderModalContent(
  tagInfo: CustomTagInfo,
  { isStreaming }: { isStreaming: boolean },
): React.ReactNode {
  const { tag, attributes, content, inProgress } = tagInfo;

  switch (tag) {
    // === Think: already renders clean content, reuse existing ===
    case "think":
    case "thought":
    case "vibes-think":
      return renderCustomTag(tagInfo, { isStreaming });

    // === File operations: path + description + code ===
    case "vibes-write":
    case "vibes-edit":
    case "vibes-search-replace":
    case "vibes-patch": {
      const path = attributes.path || "";
      const description = attributes.description || "";
      const retryCount = attributes["retry-count"] || "";
      return (
        <div className="space-y-3">
          {path && (
            <div className="text-xs text-muted-foreground font-mono bg-muted/30 px-3 py-1.5 rounded">
              {path}
              {retryCount && Number(retryCount) > 1 && (
                <span className="ml-2 italic text-amber-500">(reintento {Number(retryCount) - 1})</span>
              )}
            </div>
          )}
          {description && (
            <div className="typo-caption">
              <span className="font-medium">Summary: </span>{description}
            </div>
          )}
          {content && (
            <div className="text-xs overflow-hidden">
              <CodeHighlight className="language-typescript">{content}</CodeHighlight>
            </div>
          )}
        </div>
      );
    }

    // === Read file ===
    case "vibes-read": {
      const path = attributes.path || "";
      const startLine = attributes.start_line;
      const endLine = attributes.end_line;
      let lineRangeText = "";
      if (startLine && endLine) lineRangeText = `líneas ${startLine}-${endLine}`;
      else if (startLine) lineRangeText = `desde línea ${startLine}`;
      else if (endLine) lineRangeText = `hasta línea ${endLine}`;

      const ext = path.split(".").pop()?.toLowerCase() || "";
      let langClass = "language-typescript";
      if (ext === "json") langClass = "language-json";
      else if (ext === "md") langClass = "language-markdown";
      else if (ext === "css") langClass = "language-css";
      else if (ext === "html") langClass = "language-html";
      else if (ext === "sh" || ext === "bash") langClass = "language-shell";
      else if (ext === "sql") langClass = "language-sql";
      else if (ext === "yml" || ext === "yaml") langClass = "language-yaml";
      else if (ext === "xml") langClass = "language-xml";

      return (
        <div className="space-y-2">
          {path && (
            <div className="text-xs text-muted-foreground font-mono bg-muted/30 px-3 py-1.5 rounded">
              {path}
              {lineRangeText && <span className="ml-2 text-muted-foreground">({lineRangeText})</span>}
            </div>
          )}
          {content && (
            <div className="text-xs overflow-hidden">
              <CodeHighlight className={langClass}>{content}</CodeHighlight>
            </div>
          )}
        </div>
      );
    }

    // === Delete file ===
    case "vibes-delete": {
      const path = attributes.path || "";
      return (
        <div className="space-y-2">
          {path && (
            <div className="text-xs text-muted-foreground font-mono bg-muted/30 px-3 py-1.5 rounded">
              {path}
            </div>
          )}
          {content && <div className="typo-caption">{content}</div>}
        </div>
      );
    }

    // === Rename file ===
    case "vibes-rename": {
      const from = attributes.from || "";
      const to = attributes.to || "";
      return (
        <div className="space-y-2">
          {from && (
            <div className="text-xs text-muted-foreground font-mono bg-muted/30 px-3 py-1.5 rounded">
              <span className="font-medium">From:</span> {from}
            </div>
          )}
          {to && (
            <div className="text-xs text-muted-foreground font-mono bg-muted/30 px-3 py-1.5 rounded">
              <span className="font-medium">To:</span> {to}
            </div>
          )}
          {content && <div className="typo-caption">{content}</div>}
        </div>
      );
    }

    // === Grep ===
    case "vibes-grep": {
      const query = attributes.query || "";
      const includePattern = attributes.include || "";
      const excludePattern = attributes.exclude || "";
      const count = attributes.count || "";
      let description = `"${query}"`;
      if (includePattern) description += ` in ${includePattern}`;
      if (excludePattern) description += ` excluding ${excludePattern}`;
      const resultSummary = count ? `${count} match${count === "1" ? "" : "es"}` : "";

      return (
        <div className="space-y-2">
          <div className="typo-caption">
            {description}
            {resultSummary && <span className="ml-2 text-muted-foreground/70">({resultSummary})</span>}
          </div>
          {content && (
            <div className="text-xs overflow-hidden">
              <CodeHighlight className="language-log">{content}</CodeHighlight>
            </div>
          )}
        </div>
      );
    }

    // === Code search ===
    case "vibes-code-search": {
      const query = attributes.query || "";
      return (
        <div className="space-y-2">
          {query && <div className="text-sm italic text-muted-foreground">{query}</div>}
          {content && (
            <div className="text-xs font-mono whitespace-pre-wrap break-all">{content}</div>
          )}
        </div>
      );
    }

    // === PocketBase ===
    case "vibes-pocketbase-info":
    case "vibes-pocketbase-storage-info": {
      return (
        <div className="space-y-2">
          {content && (
            <div className="text-xs overflow-hidden">
              <CodeHighlight className="language-markdown">{content}</CodeHighlight>
            </div>
          )}
        </div>
      );
    }

    // === Code search result ===
    case "vibes-code-search-result": {
      const files = content ? content.split("\n").map(l => l.trim()).filter(l => l && !l.startsWith("<") && !l.startsWith(">")) : [];
      return (
        <div className="space-y-2">
          {files.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {files.map((file, i) => {
                const fileName = file.split("/").pop() || file;
                const pathPart = file.substring(0, file.length - fileName.length) || "";
                return (
                  <div key={i} className="px-2 py-1 bg-muted rounded-lg">
                    <div className="text-sm font-medium">{fileName}</div>
                    {pathPart && <div className="text-xs text-muted-foreground">{pathPart}</div>}
                  </div>
                );
              })}
            </div>
          ) : (
            content && <div className="text-xs font-mono whitespace-pre-wrap break-all">{content}</div>
          )}
        </div>
      );
    }

    // === List files ===
    case "vibes-list-files": {
      const directory = attributes.directory || "";
      const isRecursive = attributes.recursive === "true";
      return (
        <div className="space-y-2">
          {directory && (
            <div className="text-xs text-muted-foreground font-mono bg-muted/30 px-3 py-1.5 rounded">
              {directory}{isRecursive ? " (recursive)" : ""}
            </div>
          )}
          {content && (
            <div className="text-xs font-mono whitespace-pre-wrap break-all max-h-80 overflow-y-auto bg-muted/20 p-3 rounded">
              {content}
            </div>
          )}
        </div>
      );
    }

    // === Web search ===
    case "dyad-web-search": {
      const query = attributes.query || content || "";
      return (
        <div className="space-y-2">
          {query && <div className="text-sm italic text-muted-foreground">{query}</div>}
          {content && content !== query && (
            <div className="typo-caption">{content}</div>
          )}
        </div>
      );
    }

    // === Web search result ===
    case "dyad-web-search-result":
      return (
        <div className="prose dark:prose-invert prose-sm max-w-none">
          {typeof content === "string" ? (
            <VanillaMarkdownParser content={content} />
          ) : (
            content
          )}
        </div>
      );

    // === Web crawl ===
    case "vibes-web-crawl":
      return (
        <div className="typo-caption">
          {content || ""}
        </div>
      );

    // === Add dependency ===
    case "vibes-add-dependency": {
      const packages = (attributes.packages || "").split(" ").filter(Boolean);
      return (
        <div className="space-y-2">
          {packages.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {packages.map((p) => (
                <span key={p} className="text-sm font-mono bg-muted px-2 py-1 rounded">
                  {p}
                </span>
              ))}
            </div>
          )}
          {content && (
            <div className="text-xs overflow-hidden">
              <CodeHighlight className="language-shell">{content}</CodeHighlight>
            </div>
          )}
        </div>
      );
    }

    // === Add integration ===
    case "vibes-add-integration":
      return renderCustomTag(tagInfo, { isStreaming });

    // === Execute SQL ===
    case "vibes-execute-sql": {
      const queryDescription = attributes.description || "";
      return (
        <div className="space-y-2">
          {queryDescription && (
            <div className="typo-caption">{queryDescription}</div>
          )}
          {content && (
            <div className="text-xs overflow-hidden">
              <CodeHighlight className="language-sql">{content}</CodeHighlight>
            </div>
          )}
        </div>
      );
    }

    // === Read logs ===
    case "vibes-read-logs": {
      const logCount = attributes.count || "";
      const logType = attributes.type || "all";
      const logLevel = attributes.level || "all";
      const filters: string[] = [];
      if (logType !== "all") filters.push(`type: ${logType}`);
      if (logLevel !== "all") filters.push(`level: ${logLevel}`);
      const filterDesc = filters.length > 0 ? ` (${filters.join(", ")})` : "";

      return (
        <div className="space-y-2">
          {(logCount || filterDesc) && (
            <div className="typo-caption">
              {logCount ? `${logCount} logs` : "Logs"}{filterDesc}
            </div>
          )}
          {content && (
            <div className="text-xs overflow-hidden">
              <CodeHighlight className="language-log">{content}</CodeHighlight>
            </div>
          )}
        </div>
      );
    }

    // === Codebase context ===
    case "vibes-codebase-context": {
      const files = (attributes.files || "").split(",").map(f => f.trim()).filter(Boolean);
      return (
        <div className="space-y-2">
          {files.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {files.map((file, i) => {
                const fileName = file.split("/").pop() || file;
                const pathPart = file.substring(0, file.length - fileName.length) || "";
                return (
                  <div key={i} className="px-2 py-1 bg-muted rounded-lg">
                    <div className="text-sm font-medium">{fileName}</div>
                    {pathPart && <div className="text-xs text-muted-foreground">{pathPart}</div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    // === MCP tool call ===

    // === Database schema ===
    case "vibes-database-schema":
      return (
        <div className="text-xs font-mono whitespace-pre-wrap max-h-80 overflow-y-auto bg-muted/20 p-3 rounded">
          {content || ""}
        </div>
      );

    // === Supabase table schema ===
    case "vibes-supabase-table-schema": {
      const table = attributes.table || "";
      return (
        <div className="space-y-2">
          {table && (
            <div className="typo-caption font-medium">{table}</div>
          )}
          {content && (
            <div className="text-xs font-mono whitespace-pre-wrap max-h-80 overflow-y-auto bg-muted/20 p-3 rounded">
              {content}
            </div>
          )}
        </div>
      );
    }

    // === Provider Project/Storage Info ===
    case "vibes-supabase-project-info":
    case "vibes-bunny-db-info":
    case "vibes-bunny-storage-info":
      return (
        <div className="text-xs font-mono whitespace-pre-wrap max-h-80 overflow-y-auto bg-muted/20 p-3 rounded">
          {content || ""}
        </div>
      );

    // === Status ===
    case "vibes-status": {
      const title = attributes.title || "Processing...";
      return (
        <div className="space-y-2">
          <div className="text-sm font-medium">{title}</div>
          {content && (
            <div className="text-xs font-mono whitespace-pre-wrap max-h-60 overflow-y-auto bg-muted/20 p-3 rounded">
              {content}
            </div>
          )}
        </div>
      );
    }

    // === MCP Tools ===
    case "vibes-mcp-tool-call": {
      const toolName = attributes.tool || attributes.server || "MCP Tool";
      return (
        <div className="space-y-2">
          {toolName && (
            <div className="text-sm font-medium text-purple-400">
              {toolName}
            </div>
          )}
          {content && (
            <div className="text-xs font-mono whitespace-pre-wrap max-h-[70vh] overflow-y-auto bg-muted/20 p-3 rounded border border-purple-500/20">
              {content}
            </div>
          )}
        </div>
      );
    }

    // === Git operations ===
    case "vibes-git": {
      const operation = attributes.operation || "";
      return (
        <div className="space-y-2">
          {operation && (
            <div className="typo-caption">
              <span className="font-medium">git {operation}</span>
            </div>
          )}
          {content && (
            <div className="text-xs overflow-hidden">
              <CodeHighlight className="language-log">{content}</CodeHighlight>
            </div>
          )}
        </div>
      );
    }

    // === Process/command tools (Phase 1) ===
    case "vibes-run-command": {
      const cmd = attributes.cmd || "";
      const status = attributes.status || "";
      const exitCode = attributes["exit-code"] || "";
      const duration = attributes.duration || "";
      const statusIcon = status === "success" ? <CheckCircle2 size={12} className="text-green-500" /> : status === "timeout" ? <Clock size={12} className="text-amber-500" /> : status === "error" ? <XCircle size={12} className="text-red-500" /> : null;

      return (
        <div className="space-y-2">
          {cmd && (
            <div className="text-xs text-muted-foreground font-mono bg-muted/30 px-3 py-1.5 rounded flex items-center gap-2">
              <span>$</span>
              <span className="font-medium">{cmd}</span>
              {statusIcon && <span className="ml-auto">{statusIcon}</span>}
              {exitCode && <span className="text-muted-foreground">exit: {exitCode}</span>}
              {duration && <span className="text-muted-foreground">{duration}</span>}
            </div>
          )}
          {content && (
            <div className="text-xs overflow-hidden">
              <CodeHighlight className="language-log">{content}</CodeHighlight>
            </div>
          )}
        </div>
      );
    }

    case "vibes-start-process":
    case "vibes-stop-process": {
      const cmd = attributes.cmd || "";
      const processId = attributes["process-id"] || "";
      const status = attributes.status || "";

      return (
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground font-mono bg-muted/30 px-3 py-1.5 rounded flex items-center gap-2">
            {cmd && <><span>$</span><span className="font-medium">{cmd}</span></>}
            {processId && <span className="font-medium">{processId}</span>}
            {status && <span className="ml-auto font-medium">{status}</span>}
          </div>
          {content && <div className="typo-caption whitespace-pre-wrap">{content}</div>}
        </div>
      );
    }

    case "vibes-list-processes": {
      const count = attributes.count || "";
      return (
        <div className="space-y-2">
          {count && <div className="typo-caption">{count} proceso(s)</div>}
          {content && (
            <div className="text-xs font-mono whitespace-pre-wrap max-h-60 overflow-y-auto bg-muted/20 p-3 rounded">
              {content}
            </div>
          )}
        </div>
      );
    }

    case "vibes-wait-http": {
      const url = attributes.url || "";
      const status = attributes.status || "";
      const httpStatus = attributes["http-status"] || "";
      const attempts = attributes.attempts || "";
      const responseTime = attributes["response-time"] || "";
      const statusIcon = status === "ok" ? <CheckCircle2 size={12} className="text-green-500" /> : <Clock size={12} className="text-amber-500" />;

      return (
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground font-mono bg-muted/30 px-3 py-1.5 rounded flex items-center gap-2">
            <span>{statusIcon}</span>
            <span className="font-medium">{url}</span>
            {httpStatus && <span className="text-green-500">HTTP {httpStatus}</span>}
            {attempts && <span>{attempts} intentos</span>}
            {responseTime && <span>{responseTime}</span>}
          </div>
          {content && <div className="typo-caption whitespace-pre-wrap">{content}</div>}
        </div>
      );
    }

    case "vibes-typecheck-summary": {
      return (
        <VibesTypecheckSummary
          node={{
            properties: {
              "has-errors": attributes["has-errors"] || "false",
              "force-open": "true",
            },
          }}
        >
          {content}
        </VibesTypecheckSummary>
      );
    }

    case "vibes-token-usage": {
      const inp = parseInt(attributes.input || "0", 10);
      const out = parseInt(attributes.output || "0", 10);
      const cached = parseInt(attributes.cached || "0", 10);
      const webSearches = parseInt(attributes["web-searches"] || "0", 10);
      const total = inp + out;
      const priceIn = parseFloat(attributes["price-input"] || "0");
      const priceOut = parseFloat(attributes["price-output"] || "0");

      // Path 1: direct cost from OpenCode (ground truth)
      const directCostStr = attributes["cost"];
      const directCost = directCostStr ? parseFloat(directCostStr) : null;
      const hasPricing = directCost !== null || priceIn > 0 || priceOut > 0 || webSearches > 0;

      // Path 2: legacy calculation (used only when no direct cost is available)
      const costInput = (inp - cached) * priceIn;
      const costCached = cached * priceIn * 0.5;
      const costOutput = out * priceOut;
      const costWebSearches = webSearches * 0.02; // Exa search cost is $0.02
      const costTotal = directCost !== null
        ? directCost
        : costInput + costCached + costOutput + costWebSearches;

      const fmtCost = (c: number) => {
        if (c < 0.001) return `$${c.toFixed(6)}`;
        if (c < 0.01) return `$${c.toFixed(4)}`;
        return `$${c.toFixed(3)}`;
      };

      return (
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-blue-100 dark:bg-blue-500/10 rounded-lg p-3">
              <div className="text-xs text-blue-600 dark:text-blue-400 mb-1">Input</div>
              <div className="text-lg font-bold text-blue-700 dark:text-blue-300">{inp.toLocaleString()}</div>
              {directCost === null && priceIn > 0 && <div className="text-xs text-blue-500/70 dark:text-blue-400/70 mt-1">{fmtCost(costInput)}</div>}
            </div>
            <div className="bg-amber-100 dark:bg-amber-500/10 rounded-lg p-3">
              <div className="text-xs text-amber-600 dark:text-amber-400 mb-1">Output</div>
              <div className="text-lg font-bold text-amber-700 dark:text-amber-300">{out.toLocaleString()}</div>
              {directCost === null && priceOut > 0 && <div className="text-xs text-amber-500/70 dark:text-amber-400/70 mt-1">{fmtCost(costOutput)}</div>}
            </div>
          </div>
          {cached > 0 && (
            <div className="bg-emerald-100 dark:bg-emerald-500/10 rounded-lg p-3">
              <div className="text-xs text-emerald-600 dark:text-emerald-400 mb-1">Cached Input</div>
              <div className="flex items-baseline gap-2">
                <span className="text-lg font-bold text-emerald-700 dark:text-emerald-300">{cached.toLocaleString()}</span>
                <span className="text-xs text-emerald-500/70 dark:text-emerald-400/70">({Math.round(cached / inp * 100)}% del input)</span>
              </div>
              {directCost === null && priceIn > 0 && <div className="text-xs text-emerald-500/70 dark:text-emerald-400/70 mt-1">{fmtCost(costCached)} (50% descuento)</div>}
            </div>
          )}
          {webSearches > 0 && (
            <div className="bg-fuchsia-100 dark:bg-fuchsia-500/10 rounded-lg p-3">
              <div className="text-xs text-fuchsia-600 dark:text-fuchsia-400 mb-1">Búsquedas Web</div>
              <div className="text-lg font-bold text-fuchsia-700 dark:text-fuchsia-300">{webSearches.toLocaleString()}</div>
              {directCost === null && <div className="text-xs text-fuchsia-500/70 dark:text-fuchsia-400/70 mt-1">{fmtCost(costWebSearches)} ($0.02 por búsqueda)</div>}
            </div>
          )}
          <div className="flex items-center justify-between text-xs text-muted-foreground border-t border-border pt-2">
            <span>Total: <strong className="text-foreground">{total.toLocaleString()} tokens</strong></span>
            {hasPricing && <span>Coste: <strong className="text-amber-600 dark:text-yellow-400">{fmtCost(costTotal)}</strong></span>}
          </div>
          {hasPricing && (
            <div className="text-xs text-muted-foreground/60 text-center mt-3">
              {directCost !== null
                ? "Coste real reportado directamente por OpenCode."
                : "Coste calculado con las tarifas publicadas por OpenRouter para este modelo."}
            </div>
          )}
        </div>
      );
    }

    default:
      // Fallback: render the full component
      return renderCustomTag(tagInfo, { isStreaming });
  }
}
