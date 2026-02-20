
import { unescapeXmlAttr, unescapeXmlContent } from "../../shared/xmlEscape";
import { WorkerInput, WorkerOutput, ContentPiece, CustomTagInfo } from "./markdown_parser_types";

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
    "dyad-web-search-result",
    "dyad-web-search",
    "dyad-web-crawl",
    "dyad-code-search-result",
    "dyad-code-search",
    "dyad-read",
    "think",
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

const ctx: Worker = self as any;

ctx.onmessage = (event: MessageEvent<WorkerInput>) => {
    const { content, requestId } = event.data;

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
