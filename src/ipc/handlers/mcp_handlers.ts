import log from "electron-log";
import { getRemoteDb } from "../../db/remote";
import * as remoteSchema from "../../db/remote-schema";
import { eq, and } from "drizzle-orm";
import { createTypedHandler, HandlerContext } from "./base";

import { resolveConsent } from "../utils/mcp_consent";
import { getStoredConsent } from "../utils/mcp_consent";
import { mcpManager } from "../utils/mcp_manager";
import {
  mcpContracts,
  type McpServer,
  type McpTransport,
  type McpConsentValue,
} from "../types/mcp";

const logger = log.scope("mcp_handlers");

// Helper to cast DB server to typed server
function toMcpServer(dbServer: typeof remoteSchema.mcpServers.$inferSelect): McpServer {
  return {
    ...dbServer,
    transport: dbServer.transport as McpTransport,
    args: dbServer.args as string[] | null,
    envJson: dbServer.envJson as Record<string, string> | null,
    headersJson: dbServer.headersJson as Record<string, string> | null,
    enabled: !!dbServer.enabled,
  };
}

export function registerMcpHandlers() {
  // CRUD for MCP servers
  createTypedHandler(mcpContracts.listServers, async (_, __, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    const servers = await db.select().from(remoteSchema.mcpServers).where(eq(remoteSchema.mcpServers.userId, context.userId));
    return servers.map(toMcpServer);
  });

  createTypedHandler(mcpContracts.createServer, async (_, params, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    const {
      name,
      transport,
      command,
      args,
      envJson,
      headersJson,
      url,
      enabled,
    } = params;
    // Handle args: can be string (JSON), array, or null/undefined
    const parsedArgs = args
      ? typeof args === "string"
        ? (JSON.parse(args) as string[])
        : args
      : null;
    // Handle envJson: can be string (JSON), object, or null/undefined
    const parsedEnvJson = envJson
      ? typeof envJson === "string"
        ? (JSON.parse(envJson) as Record<string, string>)
        : envJson
      : null;
    // Handle headersJson: can be string (JSON), object, or null/undefined
    const parsedHeadersJson = headersJson
      ? typeof headersJson === "string"
        ? (JSON.parse(headersJson) as Record<string, string>)
        : headersJson
      : null;
    const result = await db
      .insert(remoteSchema.mcpServers)
      .values({
        userId: context.userId,
        name,
        transport,
        command: command || null,
        args: parsedArgs,
        envJson: parsedEnvJson,
        headersJson: parsedHeadersJson,
        url: url || null,
        enabled: enabled ? 1 : 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    return toMcpServer(result[0]);
  });

  createTypedHandler(mcpContracts.updateServer, async (_, params, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    const update: any = { updatedAt: new Date() };
    if (params.name !== undefined) update.name = params.name;
    if (params.transport !== undefined) update.transport = params.transport;
    if (params.command !== undefined) update.command = params.command;
    if (params.args !== undefined)
      update.args = params.args
        ? typeof params.args === "string"
          ? JSON.parse(params.args)
          : params.args
        : null;
    if (params.cwd !== undefined) update.cwd = params.cwd;
    if (params.envJson !== undefined)
      update.envJson = params.envJson
        ? typeof params.envJson === "string"
          ? JSON.parse(params.envJson)
          : params.envJson
        : null;
    if (params.headersJson !== undefined)
      update.headersJson = params.headersJson
        ? typeof params.headersJson === "string"
          ? JSON.parse(params.headersJson)
          : params.headersJson
        : null;
    if (params.url !== undefined) update.url = params.url;
    if (params.enabled !== undefined) update.enabled = params.enabled ? 1 : 0;

    const result = await db
      .update(remoteSchema.mcpServers)
      .set(update)
      .where(and(eq(remoteSchema.mcpServers.id, params.id), eq(remoteSchema.mcpServers.userId, context.userId)))
      .returning();
    // If server config changed, dispose cached client to be recreated on next use
    try {
      mcpManager.dispose(params.id);
    } catch { }
    return toMcpServer(result[0]);
  });

  createTypedHandler(mcpContracts.deleteServer, async (_, id, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    try {
      mcpManager.dispose(id);
    } catch { }
    await db.delete(remoteSchema.mcpServers).where(and(eq(remoteSchema.mcpServers.id, id), eq(remoteSchema.mcpServers.userId, context.userId)));
    return { success: true };
  });

  // Tools listing (dynamic)
  createTypedHandler(mcpContracts.listTools, async (_, serverId) => {
    try {
      const client = await mcpManager.getClient(serverId);
      const remoteTools = await client.tools();
      const tools = await Promise.all(
        Object.entries(remoteTools).map(async ([name, mcpTool]) => ({
          name,
          description: mcpTool.description ?? null,
          consent: (await getStoredConsent(serverId, name)) as
            | McpConsentValue
            | undefined,
        })),
      );
      return tools;
    } catch (e) {
      logger.error("Failed to list tools", e);
      return [];
    }
  });

  // Consents
  createTypedHandler(mcpContracts.getToolConsents, async (_, __, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    const consents = await db.select().from(remoteSchema.mcpToolConsents).where(eq(remoteSchema.mcpToolConsents.userId, context.userId));
    return consents.map((c) => ({
      ...c,
      consent: c.consent as McpConsentValue,
    }));
  });

  createTypedHandler(mcpContracts.setToolConsent, async (_, params, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    const existing = await db
      .select()
      .from(remoteSchema.mcpToolConsents)
      .where(
        and(
          eq(remoteSchema.mcpToolConsents.serverId, params.serverId),
          eq(remoteSchema.mcpToolConsents.toolName, params.toolName),
          eq(remoteSchema.mcpToolConsents.userId, context.userId),
        ),
      );
    if (existing.length > 0) {
      const result = await db
        .update(remoteSchema.mcpToolConsents)
        .set({ consent: params.consent, updatedAt: new Date() })
        .where(
          and(
            eq(remoteSchema.mcpToolConsents.serverId, params.serverId),
            eq(remoteSchema.mcpToolConsents.toolName, params.toolName),
            eq(remoteSchema.mcpToolConsents.userId, context.userId),
          ),
        )
        .returning();
      return {
        ...result[0],
        consent: result[0].consent as McpConsentValue,
      };
    } else {
      const result = await db
        .insert(remoteSchema.mcpToolConsents)
        .values({
          userId: context.userId,
          serverId: params.serverId,
          toolName: params.toolName,
          consent: params.consent,
          updatedAt: new Date(),
        })
        .returning();
      return {
        ...result[0],
        consent: result[0].consent as McpConsentValue,
      };
    }
  });

  // Tool consent request/response handshake
  // Receive consent response from renderer
  createTypedHandler(mcpContracts.respondToConsent, async (_, data) => {
    resolveConsent(data.requestId, data.decision);
  });

  logger.debug("Registered MCP IPC handlers");
}
