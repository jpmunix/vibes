import { getRemoteDb } from "../../db/remote";
import * as remoteSchema from "../../db/remote-schema";
import { eq, and, like, desc } from "drizzle-orm";
import { createTypedHandler, HandlerContext } from "./base";
import { securityContracts } from "../types/security";
import type { SecurityFinding } from "../types/security";

export function registerSecurityHandlers() {
  createTypedHandler(
    securityContracts.getLatestSecurityReview,
    async (_, appId, context) => {
      if (!context.userId) throw new Error("Unauthorized");
      const db = getRemoteDb();
      if (!appId) {
        throw new Error("App ID is required");
      }

      // Query for the most recent message with security findings
      // Use database filtering instead of loading all data into memory
      const result = await db
        .select({
          content: remoteSchema.messages.content,
          createdAt: remoteSchema.messages.createdAt,
          chatId: remoteSchema.messages.chatId,
        })
        .from(remoteSchema.messages)
        .innerJoin(remoteSchema.chats, eq(remoteSchema.messages.chatId, remoteSchema.chats.id))
        .where(
          and(
            eq(remoteSchema.chats.appId, appId),
            eq(remoteSchema.chats.userId, context.userId),
            eq(remoteSchema.messages.userId, context.userId),
            eq(remoteSchema.messages.role, "assistant"),
            like(remoteSchema.messages.content, "%<vibes-security-finding%"),
          ),
        )
        .orderBy(desc(remoteSchema.messages.createdAt))
        .limit(1);

      if (result.length === 0) {
        throw new Error("No security review found for this app");
      }

      const message = result[0];
      const findings = parseSecurityFindings(message.content);

      if (findings.length === 0) {
        throw new Error("No security review found for this app");
      }

      return {
        findings,
        timestamp: message.createdAt.toISOString(),
        chatId: message.chatId,
      };
    },
  );
}

function parseSecurityFindings(content: string): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  // Regex to match vibes-security-finding tags
  // Using lazy quantifier with proper boundaries to prevent catastrophic backtracking
  const regex =
    /<vibes-security-finding\s+title="([^"]+)"\s+level="(critical|high|medium|low)">([\s\S]*?)<\/vibes-security-finding>/g;

  let match;
  while ((match = regex.exec(content)) !== null) {
    const [, title, level, description] = match;
    findings.push({
      title: title.trim(),
      level: level as "critical" | "high" | "medium" | "low",
      description: description.trim(),
    });
  }

  return findings;
}
