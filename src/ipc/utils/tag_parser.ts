import { normalizePath } from "../../../shared/normalizePath";
import { unescapeXmlAttr, unescapeXmlContent } from "../../../shared/xmlEscape";
import log from "electron-log";
import { SqlQuery } from "../../lib/schemas";

const logger = log.scope("tag_parser");

export function getWriteTags(fullResponse: string): {
  path: string;
  content: string;
  description?: string;
}[] {
  const writeTagRegex = /<vibes-write([^>]*)>([\s\S]*?)<\/vibes-write>/gi;
  const pathRegex = /path="([^"]+)"/;
  const descriptionRegex = /description="([^"]+)"/;

  let match;
  const tags: { path: string; content: string; description?: string }[] = [];

  while ((match = writeTagRegex.exec(fullResponse)) !== null) {
    const attributesString = match[1];
    let content = unescapeXmlContent(match[2].trim());

    const pathMatch = pathRegex.exec(attributesString);
    const descriptionMatch = descriptionRegex.exec(attributesString);

    if (pathMatch && pathMatch[1]) {
      const path = unescapeXmlAttr(pathMatch[1]);
      const description = descriptionMatch?.[1]
        ? unescapeXmlAttr(descriptionMatch[1])
        : undefined;

      const contentLines = content.split("\n");
      if (contentLines[0]?.startsWith("```")) {
        contentLines.shift();
      }
      if (contentLines[contentLines.length - 1]?.startsWith("```")) {
        contentLines.pop();
      }
      content = contentLines.join("\n");

      tags.push({ path: normalizePath(path), content, description });
    } else {
      logger.warn(
        "Found <vibes-write> tag without a valid 'path' attribute:",
        match[0],
      );
    }
  }
  return tags;
}

export function getRenameTags(fullResponse: string): {
  from: string;
  to: string;
}[] {
  const renameTagRegex =
    /<vibes-rename from="([^"]+)" to="([^"]+)"[^>]*>([\s\S]*?)<\/vibes-rename>/g;
  let match;
  const tags: { from: string; to: string }[] = [];
  while ((match = renameTagRegex.exec(fullResponse)) !== null) {
    tags.push({
      from: normalizePath(unescapeXmlAttr(match[1])),
      to: normalizePath(unescapeXmlAttr(match[2])),
    });
  }
  return tags;
}

export function getDeleteTags(fullResponse: string): string[] {
  const deleteTagRegex =
    /<vibes-delete path="([^"]+)"[^>]*>([\s\S]*?)<\/vibes-delete>/g;
  let match;
  const paths: string[] = [];
  while ((match = deleteTagRegex.exec(fullResponse)) !== null) {
    paths.push(normalizePath(unescapeXmlAttr(match[1])));
  }
  return paths;
}

export function getAddDependencyTags(fullResponse: string): string[] {
  const addDependencyTagRegex =
    /<vibes-add-dependency packages="([^"]+)">[^<]*<\/vibes-add-dependency>/g;
  let match;
  const packages: string[] = [];
  while ((match = addDependencyTagRegex.exec(fullResponse)) !== null) {
    packages.push(...unescapeXmlAttr(match[1]).split(" "));
  }
  return packages;
}

export function getChatSummaryTag(fullResponse: string): string | null {
  // Try <vibes-chat-summary>content</vibes-chat-summary>
  const chatSummaryTagRegex =
    /<vibes-chat-summary>([\s\S]*?)<\/vibes-chat-summary>/g;
  let match = chatSummaryTagRegex.exec(fullResponse);
  if (match && match[1]) {
    return unescapeXmlContent(match[1].trim());
  }

  // Try <set_chat_summary summary="...">...</set_chat_summary>
  const setChatSummaryRegex = /<set_chat_summary\s+summary="([^"]+)"[^>]*>[\s\S]*?<\/set_chat_summary>/g;
  match = setChatSummaryRegex.exec(fullResponse);
  if (match && match[1]) {
    return unescapeXmlAttr(match[1]);
  }

  return null;
}

export function getExecuteSqlTags(fullResponse: string): SqlQuery[] {
  const executeSqlTagRegex =
    /<vibes-execute-sql([^>]*)>([\s\S]*?)<\/vibes-execute-sql>/g;
  const descriptionRegex = /description="([^"]+)"/;
  let match;
  const queries: { content: string; description?: string }[] = [];

  while ((match = executeSqlTagRegex.exec(fullResponse)) !== null) {
    const attributesString = match[1] || "";
    let content = unescapeXmlContent(match[2].trim());
    const descriptionMatch = descriptionRegex.exec(attributesString);
    const description = descriptionMatch?.[1]
      ? unescapeXmlAttr(descriptionMatch[1])
      : undefined;

    // Handle markdown code blocks if present
    const contentLines = content.split("\n");
    if (contentLines[0]?.startsWith("```")) {
      contentLines.shift();
    }
    if (contentLines[contentLines.length - 1]?.startsWith("```")) {
      contentLines.pop();
    }
    content = contentLines.join("\n");

    queries.push({ content, description });
  }

  return queries;
}

export function getCommandTags(fullResponse: string): string[] {
  const commandTagRegex =
    /<vibes-command type="([^"]+)"[^>]*><\/vibes-command>/g;
  let match;
  const commands: string[] = [];

  while ((match = commandTagRegex.exec(fullResponse)) !== null) {
    commands.push(unescapeXmlAttr(match[1]));
  }

  return commands;
}

export function getSearchReplaceTags(fullResponse: string): {
  path: string;
  content: string;
  description?: string;
}[] {
  const searchReplaceTagRegex =
    /<vibes-search-replace([^>]*)>([\s\S]*?)<\/vibes-search-replace>/gi;
  const pathRegex = /path="([^"]+)"/;
  const descriptionRegex = /description="([^"]+)"/;

  let match;
  const tags: { path: string; content: string; description?: string }[] = [];

  while ((match = searchReplaceTagRegex.exec(fullResponse)) !== null) {
    const attributesString = match[1] || "";
    let content = unescapeXmlContent(match[2].trim());

    const pathMatch = pathRegex.exec(attributesString);
    const descriptionMatch = descriptionRegex.exec(attributesString);

    if (pathMatch && pathMatch[1]) {
      const path = unescapeXmlAttr(pathMatch[1]);
      const description = descriptionMatch?.[1]
        ? unescapeXmlAttr(descriptionMatch[1])
        : undefined;

      // Handle markdown code fences if present
      const contentLines = content.split("\n");
      if (contentLines[0]?.startsWith("```")) {
        contentLines.shift();
      }
      if (contentLines[contentLines.length - 1]?.startsWith("```")) {
        contentLines.pop();
      }
      content = contentLines.join("\n");

      tags.push({ path: normalizePath(path), content, description });
    } else {
      logger.warn(
        "Found <vibes-search-replace> tag without a valid 'path' attribute:",
        match[0],
      );
    }
  }
  return tags;
}
