import { z } from "zod";
import { ToolDefinition, AgentContext } from "./types";
import { getRemoteDb } from "@/db/remote";
import * as remoteSchema from "@/db/remote-schema";
import { and, eq, isNull } from "drizzle-orm";

const setChatSummarySchema = z.object({
  summary: z.string().describe("A short summary/title for the chat"),
});

export const setChatSummaryTool: ToolDefinition<
  z.infer<typeof setChatSummarySchema>
> = {
  name: "set_chat_summary",
  description:
    "Set the title/summary for this chat message. You should always call this message at the end of the turn when you have finished calling all the other tools.",
  inputSchema: setChatSummarySchema,
  defaultConsent: "always",

  getConsentPreview: (args) => args.summary,

  buildXml: (args, isComplete) => {
    if (args.summary == undefined) return undefined;
    let xml = `<set_chat_summary summary="${args.summary}">`;
    if (isComplete) xml += `</set_chat_summary>`;
    return xml;
  },

  execute: async (args, ctx: AgentContext) => {
    if (args.summary) {
      await getRemoteDb()
        .update(remoteSchema.chats)
        .set({ title: args.summary })
        .where(and(eq(remoteSchema.chats.id, ctx.chatId), isNull(remoteSchema.chats.title)));
      ctx.chatSummary = args.summary;
    }

    return `Chat summary set to: ${args.summary}`;
  },
};
