
import { unescapeXmlAttr, unescapeXmlContent } from "../../shared/xmlEscape";
import { WorkerInput, WorkerOutput, ContentPiece, CustomTagInfo } from "./markdown_parser_types";

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
];

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

import { normalizeLegacyTags } from "../../shared/normalizeLegacyTags";

const ctx: Worker = self as any;

ctx.onmessage = (event: MessageEvent<WorkerInput>) => {
    const { content: rawContent, requestId } = event.data;
    // Normalize legacy dyad-* tags to vibes-* in one pass before parsing
    const content = normalizeLegacyTags(rawContent);

    try {
        const contentPieces = parseCustomTags(content);

        const output: WorkerOutput = {
            requestId,
            contentPieces,
            timestamp: Date.now(),
        };

        ctx.postMessage(output);
    } catch (error) {
        console.error("Error parsing markdown in worker:", error);
        // In case of error, just return empty or handle gracefully
        // For now, let's not crash the worker loop
    }
};
