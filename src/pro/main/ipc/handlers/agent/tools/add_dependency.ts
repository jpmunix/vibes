import { z } from "zod";
import { eq } from "drizzle-orm";
import { ToolDefinition, AgentContext, escapeXmlAttr } from "./types";
import { getRemoteDb } from "../../../../../../db/remote";
import { messages } from "../../../../../../db/remote-schema";
import { executeAddDependency } from "@/ipc/processors/executeAddDependency";

const addDependencySchema = z.object({
  packages: z.array(z.string()).describe("Array of package names to install"),
});

export const addDependencyTool: ToolDefinition<
  z.infer<typeof addDependencySchema>
> = {
  name: "add_dependency",
  description: "Instalar paquetes npm",
  inputSchema: addDependencySchema,
  defaultConsent: "always",
  modifiesState: true,

  getConsentPreview: (args) => `Install ${args.packages.join(", ")}`,

  buildXml: (args, _isComplete) => {
    if (!args.packages || args.packages.length === 0) return undefined;
    return `<vibes-add-dependency packages="${escapeXmlAttr(args.packages.join(" "))}"></vibes-add-dependency>`;
  },

  execute: async (args, ctx: AgentContext) => {
    const message = ctx.messageId
      ? await getRemoteDb().query.messages.findFirst({
          where: eq(messages.id, ctx.messageId),
        })
      : undefined;

    if (!message) {
      throw new Error("Message not found for adding dependencies");
    }

    await executeAddDependency({
      packages: args.packages,
      message: {
        ...message,
        role: message.role as "assistant" | "user",
        approvalState: message.approvalState as "approved" | "rejected" | null,
      },
      appPath: ctx.appPath,
    });

    return `Successfully installed ${args.packages.join(", ")}`;
  },
};
