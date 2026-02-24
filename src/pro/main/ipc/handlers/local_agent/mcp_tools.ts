/**
 * MCP (Model Context Protocol) tools integration for the Local Agent.
 * Discovers enabled MCP servers and wraps their tools for the AI SDK.
 */

import { IpcMainInvokeEvent } from "electron";
import { ToolSet, type ToolExecutionOptions } from "ai";
import log from "electron-log";
import { eq } from "drizzle-orm";
import { getRemoteDb } from "@/db/remote";
import * as remoteSchema from "@/db/remote-schema";
import { mcpManager } from "@/ipc/utils/mcp_manager";
import { requireMcpToolConsent } from "@/ipc/utils/mcp_consent";
import { parseMcpToolKey, sanitizeMcpName } from "@/ipc/utils/mcp_tool_utils";
import {
    escapeXmlAttr,
    escapeXmlContent,
    type AgentContext,
} from "./tools/types";

const logger = log.scope("mcp_tools");

/**
 * Build MCP toolset by discovering all enabled MCP servers
 * and wrapping their tools with consent, XML emission, and error handling.
 */
export async function getMcpTools(
    event: IpcMainInvokeEvent,
    ctx: AgentContext,
): Promise<ToolSet> {
    const mcpToolSet: ToolSet = {};

    try {
        const servers = await getRemoteDb()
            .select()
            .from(remoteSchema.mcpServers)
            .where(eq(remoteSchema.mcpServers.enabled, true as any));

        for (const s of servers) {
            const client = await mcpManager.getClient(s.id);
            const toolSet = await client.tools();

            for (const [name, mcpTool] of Object.entries(toolSet)) {
                const key = `${sanitizeMcpName(s.name || "")}__${sanitizeMcpName(name)}`;

                mcpToolSet[key] = {
                    description: mcpTool.description,
                    inputSchema: mcpTool.inputSchema,
                    execute: async (args: unknown, execCtx: ToolExecutionOptions) => {
                        try {
                            const inputPreview =
                                typeof args === "string"
                                    ? args
                                    : Array.isArray(args)
                                        ? args.join(" ")
                                        : JSON.stringify(args).slice(0, 500);

                            const ok = await requireMcpToolConsent(event, {
                                serverId: s.id,
                                serverName: s.name,
                                toolName: name,
                                toolDescription: mcpTool.description,
                                inputPreview,
                            });

                            if (!ok) throw new Error(`User declined running tool ${key}`);

                            // Emit XML for UI (MCP tools don't stream, so use onXmlComplete directly)
                            const { serverName, toolName } = parseMcpToolKey(key);
                            const content = JSON.stringify(args, null, 2);
                            ctx.onXmlComplete(
                                `<dyad-mcp-tool-call server="${serverName}" tool="${toolName}">\n${content}\n</dyad-mcp-tool-call>`,
                            );

                            const res = await mcpTool.execute(args, execCtx);
                            const resultStr =
                                typeof res === "string" ? res : JSON.stringify(res);

                            ctx.onXmlComplete(
                                `<dyad-mcp-tool-result server="${serverName}" tool="${toolName}">\n${resultStr}\n</dyad-mcp-tool-result>`,
                            );

                            return resultStr;
                        } catch (error) {
                            const errorMessage =
                                error instanceof Error ? error.message : String(error);
                            const errorStack =
                                error instanceof Error && error.stack ? error.stack : "";
                            ctx.onXmlComplete(
                                `<dyad-output type="error" message="MCP tool '${key}' failed: ${escapeXmlAttr(errorMessage)}">${escapeXmlContent(errorStack || errorMessage)}</dyad-output>`,
                            );
                            throw error;
                        }
                    },
                };
            }
        }
    } catch (e) {
        logger.warn("Failed building MCP toolset for local-agent", e);
    }

    return mcpToolSet;
}
