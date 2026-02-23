import React, { useMemo, useDeferredValue, useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { markdownParser } from "@/workers/markdownParserWorkerClient";
import { ContentPiece, CustomTagInfo } from "@/workers/markdown_parser_types";

import { DyadWrite } from "./DyadWrite";
import { DyadRename } from "./DyadRename";
import { DyadDelete } from "./DyadDelete";
import { DyadAddDependency } from "./DyadAddDependency";
import { DyadExecuteSql } from "./DyadExecuteSql";
import { DyadLogs } from "./DyadLogs";
import { DyadGrep } from "./DyadGrep";
import { DyadGit } from "./DyadGit";
import { DyadAskUser } from "./DyadAskUser";
import { DyadAddIntegration } from "./DyadAddIntegration";
import { DyadEdit } from "./DyadEdit";
import { DyadSearchReplace } from "./DyadSearchReplace";
import { DyadPatch } from "./DyadPatch";
import { DyadTypecheckSummary } from "./DyadTypecheckSummary";
import { DyadCodebaseContext } from "./DyadCodebaseContext";
import { DyadThink } from "./DyadThink";
import { CodeHighlight } from "./CodeHighlight";
import { useAtomValue } from "jotai";
import { isStreamingByIdAtom, selectedChatIdAtom } from "@/atoms/chatAtoms";
import { CustomTagState } from "./stateTypes";
import { DyadOutput } from "./DyadOutput";
import { DyadProblemSummary } from "./DyadProblemSummary";
import { DyadMcpToolCall } from "./DyadMcpToolCall";
import { DyadMcpToolResult } from "./DyadMcpToolResult";

import { DyadWebCrawl } from "./DyadWebCrawl";
import { DyadCodeSearchResult } from "./DyadCodeSearchResult";
import { DyadCodeSearch } from "./DyadCodeSearch";
import { DyadRead } from "./DyadRead";
import { DyadListFiles } from "./DyadListFiles";
import { DyadDatabaseSchema } from "./DyadDatabaseSchema";
import { DyadSupabaseTableSchema } from "./DyadSupabaseTableSchema";
import { DyadSupabaseProjectInfo } from "./DyadSupabaseProjectInfo";
import { DyadStatus } from "./DyadStatus";
import { SuggestedAction } from "@/lib/schemas";
import { FixAllErrorsButton } from "./FixAllErrorsButton";
import { unescapeXmlAttr, unescapeXmlContent } from "../../../shared/xmlEscape";
import { CompactToolBadge, shouldCompact, getToolDetail, type ToolBadgeState } from "./CompactToolBadge";
import { GroupedToolBadges, type BadgeItem } from "./GroupedToolBadges";

const DYAD_CUSTOM_TAGS = [
  "dyad-write",
  "dyad-rename",
  "dyad-delete",
  "dyad-add-dependency",
  "dyad-execute-sql",
  "dyad-read-logs",
  "dyad-add-integration",
  "dyad-output",
  "dyad-problem-report",
  "dyad-chat-summary",
  "dyad-edit",
  "dyad-grep",
  "dyad-search-replace",
  "dyad-codebase-context",

  "dyad-web-crawl",
  "dyad-code-search-result",
  "dyad-code-search",
  "dyad-read",
  "think",
  "thought",
  "dyad-command",
  "dyad-mcp-tool-call",
  "dyad-mcp-tool-result",
  "dyad-list-files",
  "dyad-database-schema",
  "dyad-supabase-table-schema",
  "dyad-supabase-project-info",
  "dyad-status",
  "dyad-think",
  "dyad-git",
  "dyad-ask-user",
  "dyad-patch",
  "dyad-run-command",
  "dyad-start-process",
  "dyad-stop-process",
  "dyad-list-processes",
  "dyad-wait-http",
  "dyad-typecheck-summary",
  "dyad-token-usage",
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

const MARKDOWN_COMPONENTS = {
  a: customLink,
  code: CodeHighlight,
};

export const VanillaMarkdownParser = React.memo(function VanillaMarkdownParser({ content }: { content: string }) {
  return (
    <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={MARKDOWN_COMPONENTS}>
      {content}
    </ReactMarkdown>
  );
});

interface DyadMarkdownParserProps {
  content: string;
  isStreaming?: boolean;
  chatId?: number;
}

/**
 * Custom component to parse markdown content with Dyad-specific tags
 */
export const DyadMarkdownParser = React.memo(function DyadMarkdownParser({
  content,
  isStreaming: forceStreaming,
  chatId: forceChatId,
}: DyadMarkdownParserProps) {
  const selectedChatId = useAtomValue(selectedChatIdAtom);
  const chatId = forceChatId ?? selectedChatId;
  const isStreamingMap = useAtomValue(isStreamingByIdAtom);
  const isStreaming = forceStreaming ?? (isStreamingMap.get(chatId!) ?? false);

  // Defer content updates during streaming
  const deferredContent = useDeferredValue(content);

  // Initialize with synchronous parse to avoid flash of content
  const [contentPieces, setContentPieces] = useState<ContentPiece[]>(() => {
    return parseCustomTags(content);
  });

  // Use worker for updates to avoid blocking main thread during streaming
  useEffect(() => {
    let isCancelled = false;

    markdownParser
      .parse(deferredContent)
      .then((pieces) => {
        if (!isCancelled) {
          setContentPieces(pieces);
        }
      })
      .catch((err) => {
        console.error("Worker extraction failed, falling back to sync:", err);
        if (!isCancelled) {
          setContentPieces(parseCustomTags(deferredContent));
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [deferredContent]);

  // Extract error messages and track positions
  const { errorMessages, lastErrorIndex, errorCount } = useMemo(() => {

    const errors: string[] = [];
    let lastIndex = -1;
    let count = 0;

    contentPieces.forEach((piece, index) => {
      if (
        piece.type === "custom-tag" &&
        piece.tagInfo.tag === "dyad-output" &&
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

    const flushBadgeGroup = () => {
      if (badgeGroup.length > 0) {
        const capturedBadges = [...badgeGroup];
        const currentGroupIndex = groupIndex;
        groupIndex++;
        elements.push(
          <div key={`badge-group-${elements.length}`} className="mt-1.5 mb-4">
            <GroupedToolBadges
              badges={capturedBadges}
              isStreaming={isStreaming}
              isFirstGroup={currentGroupIndex === 0}
            />
          </div>
        );
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

    contentPieces.forEach((piece, index) => {
      if (piece.type === "markdown") {
        const isWhitespaceOnly = !piece.content || !piece.content.trim();
        // Only flush if this is real markdown content AND we're not between compactable tags
        if (isWhitespaceOnly && badgeGroup.length > 0 && isNextPieceCompactable(index)) {
          // Skip whitespace between compactable tags — don't break the row
          return;
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

        if (shouldCompact(tag)) {
          const detail = getToolDetail(tag, attributes);
          const originalContent = renderModalContent(piece.tagInfo, { isStreaming });
          const badgeState: ToolBadgeState = state;

          if (badgeState === "pending") {
            // Pending state: skip — the streaming loader handles in-progress indication
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

    flushBadgeGroup();
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
  for (const tagName of DYAD_CUSTOM_TAGS) {
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
    `<(${DYAD_CUSTOM_TAGS.join("|")})\\s*([^>]*)>(.*?)<\\/\\1>`,
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
    case "dyad-read":
      return (
        <DyadRead
          node={{
            properties: {
              path: attributes.path || "",
            },
          }}
        >
          {content}
        </DyadRead>
      );

    case "dyad-web-crawl":
      return (
        <DyadWebCrawl
          node={{
            properties: {},
          }}
        >
          {content}
        </DyadWebCrawl>
      );
    case "dyad-code-search":
      return (
        <DyadCodeSearch
          node={{
            properties: {
              query: attributes.query || "",
              state: getState({ isStreaming, inProgress }),
            },
          }}
        >
          {content}
        </DyadCodeSearch>
      );
    case "dyad-code-search-result":
      return (
        <DyadCodeSearchResult
          node={{
            properties: {},
          }}
        >
          {content}
        </DyadCodeSearchResult>
      );

    case "think":
    case "thought":
    case "dyad-think":
      return (
        <DyadThink
          node={{
            properties: {
              state: getState({ isStreaming, inProgress }),
            },
          }}
        >
          {content}
        </DyadThink>
      );
    case "dyad-write":
      return (
        <DyadWrite
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
        </DyadWrite>
      );

    case "dyad-rename":
      return (
        <DyadRename
          node={{
            properties: {
              from: attributes.from || "",
              to: attributes.to || "",
            },
          }}
        >
          {content}
        </DyadRename>
      );

    case "dyad-delete":
      return (
        <DyadDelete
          node={{
            properties: {
              path: attributes.path || "",
            },
          }}
        >
          {content}
        </DyadDelete>
      );

    case "dyad-add-dependency":
      return (
        <DyadAddDependency
          node={{
            properties: {
              packages: attributes.packages || "",
            },
          }}
        >
          {content}
        </DyadAddDependency>
      );

    case "dyad-execute-sql":
      return (
        <DyadExecuteSql
          node={{
            properties: {
              state: getState({ isStreaming, inProgress }),
              description: attributes.description || "",
            },
          }}
        >
          {content}
        </DyadExecuteSql>
      );

    case "dyad-read-logs":
      return (
        <DyadLogs
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
        </DyadLogs>
      );

    case "dyad-grep":
      return (
        <DyadGrep
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
        </DyadGrep>
      );

    case "dyad-add-integration":
      return (
        <DyadAddIntegration
          node={{
            properties: {
              provider: attributes.provider || "",
            },
          }}
        >
          {content}
        </DyadAddIntegration>
      );

    case "dyad-edit":
      return (
        <DyadEdit
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
        </DyadEdit>
      );

    case "dyad-search-replace":
      return (
        <DyadSearchReplace
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
        </DyadSearchReplace>
      );

    case "dyad-patch":
      return (
        <DyadPatch
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
        </DyadPatch>
      );

    case "dyad-codebase-context":
      return (
        <DyadCodebaseContext
          node={{
            properties: {
              files: attributes.files || "",
              state: getState({ isStreaming, inProgress }),
            },
          }}
        >
          {content}
        </DyadCodebaseContext>
      );

    case "dyad-mcp-tool-call":
      return (
        <DyadMcpToolCall
          node={{
            properties: {
              serverName: attributes.server || "",
              toolName: attributes.tool || "",
            },
          }}
        >
          {content}
        </DyadMcpToolCall>
      );

    case "dyad-mcp-tool-result":
      return (
        <DyadMcpToolResult
          node={{
            properties: {
              serverName: attributes.server || "",
              toolName: attributes.tool || "",
            },
          }}
        >
          {content}
        </DyadMcpToolResult>
      );

    case "dyad-output":
      return (
        <DyadOutput
          type={attributes.type as "warning" | "error" | "success" | "info"}
          message={attributes.message}
        >
          {content}
        </DyadOutput>
      );

    case "dyad-problem-report":
      return (
        <DyadProblemSummary summary={attributes.summary}>
          {content}
        </DyadProblemSummary>
      );

    case "dyad-chat-summary":
      // Don't render anything for dyad-chat-summary
      return null;

    case "dyad-command":
      // Botones de "Actualizar vista" y "Reiniciar app" eliminados a petición del usuario
      return null;

    case "dyad-list-files":
      return (
        <DyadListFiles
          node={{
            properties: {
              directory: attributes.directory || "",
              recursive: attributes.recursive || "",
              state: getState({ isStreaming, inProgress }),
            },
          }}
        >
          {content}
        </DyadListFiles>
      );

    case "dyad-database-schema":
      return (
        <DyadDatabaseSchema
          node={{
            properties: {
              state: getState({ isStreaming, inProgress }),
            },
          }}
        >
          {content}
        </DyadDatabaseSchema>
      );

    case "dyad-supabase-table-schema":
      return (
        <DyadSupabaseTableSchema
          node={{
            properties: {
              table: attributes.table || "",
              state: getState({ isStreaming, inProgress }),
            },
          }}
        >
          {content}
        </DyadSupabaseTableSchema>
      );

    case "dyad-supabase-project-info":
      return (
        <DyadSupabaseProjectInfo
          node={{
            properties: {
              state: getState({ isStreaming, inProgress }),
            },
          }}
        >
          {content}
        </DyadSupabaseProjectInfo>
      );

    case "dyad-status":
      return (
        <DyadStatus
          node={{
            properties: {
              title: attributes.title || "Processing...",
              state: getState({ isStreaming, inProgress }),
            },
          }}
        >
          {content}
        </DyadStatus>
      );

    case "dyad-git":
      return (
        <DyadGit
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
        </DyadGit>
      );

    case "dyad-ask-user":
      return (
        <DyadAskUser
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
        </DyadAskUser>
      );

    // === Process/command tools (Phase 1) ===
    case "dyad-run-command":
    case "dyad-start-process":
    case "dyad-stop-process":
    case "dyad-list-processes":
    case "dyad-wait-http": {
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

    case "dyad-typecheck-summary":
      return (
        <DyadTypecheckSummary
          node={{
            properties: {
              "has-errors": attributes["has-errors"] || "false",
            },
          }}
        >
          {content}
        </DyadTypecheckSummary>
      );

    case "dyad-token-usage":
      // Rendered only as compact badge + modal
      return null;

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
    case "dyad-think":
      return renderCustomTag(tagInfo, { isStreaming });

    // === File operations: path + description + code ===
    case "dyad-write":
    case "dyad-edit":
    case "dyad-search-replace":
    case "dyad-patch": {
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
            <div className="text-sm text-muted-foreground">
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
    case "dyad-read": {
      const path = attributes.path || "";
      const startLine = attributes.start_line;
      const endLine = attributes.end_line;
      let lineRangeText = "";
      if (startLine && endLine) lineRangeText = `líneas ${startLine}-${endLine}`;
      else if (startLine) lineRangeText = `desde línea ${startLine}`;
      else if (endLine) lineRangeText = `hasta línea ${endLine}`;

      return (
        <div className="space-y-2">
          {path && (
            <div className="text-xs text-muted-foreground font-mono bg-muted/30 px-3 py-1.5 rounded">
              {path}
              {lineRangeText && <span className="ml-2 text-muted-foreground">({lineRangeText})</span>}
            </div>
          )}
          {content && (
            <div className="text-sm text-muted-foreground">{content}</div>
          )}
        </div>
      );
    }

    // === Delete file ===
    case "dyad-delete": {
      const path = attributes.path || "";
      return (
        <div className="space-y-2">
          {path && (
            <div className="text-xs text-muted-foreground font-mono bg-muted/30 px-3 py-1.5 rounded">
              {path}
            </div>
          )}
          {content && <div className="text-sm text-muted-foreground">{content}</div>}
        </div>
      );
    }

    // === Rename file ===
    case "dyad-rename": {
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
          {content && <div className="text-sm text-muted-foreground">{content}</div>}
        </div>
      );
    }

    // === Grep ===
    case "dyad-grep": {
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
          <div className="text-sm text-muted-foreground">
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
    case "dyad-code-search": {
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

    // === Code search result ===
    case "dyad-code-search-result": {
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
    case "dyad-list-files": {
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
            <div className="text-sm text-muted-foreground">{content}</div>
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
    case "dyad-web-crawl":
      return (
        <div className="text-sm text-muted-foreground">
          {content || ""}
        </div>
      );

    // === Add dependency ===
    case "dyad-add-dependency": {
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
    case "dyad-add-integration":
      return renderCustomTag(tagInfo, { isStreaming });

    // === Execute SQL ===
    case "dyad-execute-sql": {
      const queryDescription = attributes.description || "";
      return (
        <div className="space-y-2">
          {queryDescription && (
            <div className="text-sm text-muted-foreground">{queryDescription}</div>
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
    case "dyad-read-logs": {
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
            <div className="text-sm text-muted-foreground">
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
    case "dyad-codebase-context": {
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
    case "dyad-mcp-tool-call": {
      const serverName = attributes.server || "";
      const toolName = attributes.tool || "";
      let prettyJson = content;
      try {
        prettyJson = JSON.stringify(JSON.parse(content), null, 2);
      } catch { /* use raw */ }

      return (
        <div className="space-y-2">
          <div className="flex gap-2">
            {serverName && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 dark:bg-zinc-800 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-zinc-700">
                {serverName}
              </span>
            )}
            {toolName && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-foreground border border-border">
                {toolName}
              </span>
            )}
          </div>
          {content && (
            <div className="text-xs overflow-hidden">
              <CodeHighlight className="language-json">{prettyJson}</CodeHighlight>
            </div>
          )}
        </div>
      );
    }

    // === MCP tool result ===
    case "dyad-mcp-tool-result": {
      const serverName = attributes.server || "";
      const toolName = attributes.tool || "";
      let prettyJson = content;
      try {
        prettyJson = JSON.stringify(JSON.parse(content), null, 2);
      } catch { /* use raw */ }

      return (
        <div className="space-y-2">
          <div className="flex gap-2">
            {serverName && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-zinc-800 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-zinc-700">
                {serverName}
              </span>
            )}
            {toolName && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-foreground border border-border">
                {toolName}
              </span>
            )}
          </div>
          {content && (
            <div className="text-xs overflow-hidden">
              <CodeHighlight className="language-json">{prettyJson}</CodeHighlight>
            </div>
          )}
        </div>
      );
    }

    // === Database schema ===
    case "dyad-database-schema":
      return (
        <div className="text-xs font-mono whitespace-pre-wrap max-h-80 overflow-y-auto bg-muted/20 p-3 rounded">
          {content || ""}
        </div>
      );

    // === Supabase table schema ===
    case "dyad-supabase-table-schema": {
      const table = attributes.table || "";
      return (
        <div className="space-y-2">
          {table && (
            <div className="text-sm text-muted-foreground font-medium">{table}</div>
          )}
          {content && (
            <div className="text-xs font-mono whitespace-pre-wrap max-h-80 overflow-y-auto bg-muted/20 p-3 rounded">
              {content}
            </div>
          )}
        </div>
      );
    }

    // === Supabase project info ===
    case "dyad-supabase-project-info":
      return (
        <div className="text-xs font-mono whitespace-pre-wrap max-h-80 overflow-y-auto bg-muted/20 p-3 rounded">
          {content || ""}
        </div>
      );

    // === Status ===
    case "dyad-status": {
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

    // === Git operations ===
    case "dyad-git": {
      const operation = attributes.operation || "";
      return (
        <div className="space-y-2">
          {operation && (
            <div className="text-sm text-muted-foreground">
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
    case "dyad-run-command": {
      const cmd = attributes.cmd || "";
      const status = attributes.status || "";
      const exitCode = attributes["exit-code"] || "";
      const duration = attributes.duration || "";
      const statusEmoji = status === "success" ? "✅" : status === "timeout" ? "⏱" : status === "error" ? "❌" : "";

      return (
        <div className="space-y-2">
          {cmd && (
            <div className="text-xs text-muted-foreground font-mono bg-muted/30 px-3 py-1.5 rounded flex items-center gap-2">
              <span>$</span>
              <span className="font-medium">{cmd}</span>
              {statusEmoji && <span className="ml-auto">{statusEmoji}</span>}
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

    case "dyad-start-process":
    case "dyad-stop-process": {
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
          {content && <div className="text-sm text-muted-foreground whitespace-pre-wrap">{content}</div>}
        </div>
      );
    }

    case "dyad-list-processes": {
      const count = attributes.count || "";
      return (
        <div className="space-y-2">
          {count && <div className="text-sm text-muted-foreground">{count} proceso(s)</div>}
          {content && (
            <div className="text-xs font-mono whitespace-pre-wrap max-h-60 overflow-y-auto bg-muted/20 p-3 rounded">
              {content}
            </div>
          )}
        </div>
      );
    }

    case "dyad-wait-http": {
      const url = attributes.url || "";
      const status = attributes.status || "";
      const httpStatus = attributes["http-status"] || "";
      const attempts = attributes.attempts || "";
      const responseTime = attributes["response-time"] || "";
      const statusEmoji = status === "ok" ? "✅" : "⏱";

      return (
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground font-mono bg-muted/30 px-3 py-1.5 rounded flex items-center gap-2">
            <span>{statusEmoji}</span>
            <span className="font-medium">{url}</span>
            {httpStatus && <span className="text-green-500">HTTP {httpStatus}</span>}
            {attempts && <span>{attempts} intentos</span>}
            {responseTime && <span>{responseTime}</span>}
          </div>
          {content && <div className="text-sm text-muted-foreground whitespace-pre-wrap">{content}</div>}
        </div>
      );
    }

    case "dyad-typecheck-summary": {
      return (
        <DyadTypecheckSummary
          node={{
            properties: {
              "has-errors": attributes["has-errors"] || "false",
              "force-open": "true",
            },
          }}
        >
          {content}
        </DyadTypecheckSummary>
      );
    }

    case "dyad-token-usage": {
      const inp = parseInt(attributes.input || "0", 10);
      const out = parseInt(attributes.output || "0", 10);
      const cached = parseInt(attributes.cached || "0", 10);
      const total = inp + out;
      const priceIn = parseFloat(attributes["price-input"] || "0");
      const priceOut = parseFloat(attributes["price-output"] || "0");
      const hasPricing = priceIn > 0 || priceOut > 0;

      // OpenRouter prices are $/token — cached input is typically 50% of input price
      const costInput = (inp - cached) * priceIn;
      const costCached = cached * priceIn * 0.5;
      const costOutput = out * priceOut;
      const costTotal = costInput + costCached + costOutput;

      const fmtCost = (c: number) => {
        if (c < 0.001) return `$${c.toFixed(6)}`;
        if (c < 0.01) return `$${c.toFixed(4)}`;
        return `$${c.toFixed(3)}`;
      };

      return (
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-blue-500/10 rounded-lg p-3">
              <div className="text-xs text-blue-400 mb-1">Input</div>
              <div className="text-lg font-bold text-blue-300">{inp.toLocaleString()}</div>
              {hasPricing && <div className="text-xs text-blue-400/70 mt-1">{fmtCost(costInput)}</div>}
            </div>
            <div className="bg-amber-500/10 rounded-lg p-3">
              <div className="text-xs text-amber-400 mb-1">Output</div>
              <div className="text-lg font-bold text-amber-300">{out.toLocaleString()}</div>
              {hasPricing && <div className="text-xs text-amber-400/70 mt-1">{fmtCost(costOutput)}</div>}
            </div>
          </div>
          {cached > 0 && (
            <div className="bg-emerald-500/10 rounded-lg p-3">
              <div className="text-xs text-emerald-400 mb-1">Cached Input</div>
              <div className="flex items-baseline gap-2">
                <span className="text-lg font-bold text-emerald-300">{cached.toLocaleString()}</span>
                <span className="text-xs text-emerald-400/70">({Math.round(cached / inp * 100)}% del input)</span>
              </div>
              {hasPricing && <div className="text-xs text-emerald-400/70 mt-1">{fmtCost(costCached)} (50% descuento)</div>}
            </div>
          )}
          <div className="flex items-center justify-between text-xs text-muted-foreground border-t border-border pt-2">
            <span>Total: <strong className="text-foreground">{total.toLocaleString()} tokens</strong></span>
            {hasPricing && <span>Coste: <strong className="text-yellow-400">{fmtCost(costTotal)}</strong></span>}
          </div>
          <div className="text-sm text-foreground/80 font-medium text-center mt-3 bg-muted/50 p-2 rounded-md">
            ⚠️ Los tokens y el coste mostrados se basan en el uso acumulado reportado por OpenRouter. El coste real puede variar ligeramente.
          </div>
        </div>
      );
    }

    default:
      // Fallback: render the full component
      return renderCustomTag(tagInfo, { isStreaming });
  }
}
