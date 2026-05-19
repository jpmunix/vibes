import { createTypedHandler } from "./base";
import { mcpContracts, mcpEvents } from "../types/mcp";
import { getRemoteDb } from "../../db/remote";
import * as remoteSchema from "../../db/remote-schema";
import { eq, and } from "drizzle-orm";
import log from "electron-log";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { updateOpenCodeMcpConfig } from "./opencode_adapter";

const logger = log.scope("mcp_handlers");

/**
 * Recursively unwrap double/triple-encoded JSON fields from Turso DB.
 * Handles: null → null, array → array, string-of-array → array, etc.
 */
function safeParseJsonField<T = any>(raw: any): T | null {
  if (raw == null) return null;
  if (typeof raw !== "string") return raw;
  
  let parsed: any = raw;
  let rounds = 0;
  while (typeof parsed === "string" && rounds < 3) {
    try { 
      parsed = JSON.parse(parsed); 
      rounds++;
    } catch { 
      break; 
    }
  }
  
  if (rounds > 1) {
    logger.info(`[MCP] Fixed multi-encoded JSON field (${rounds} parse rounds)`);
  }
  
  return parsed;
}

// Temporary map to keep ad-hoc clients just long enough to get tools
const tempClients = new Map<number, Client>();

export function registerMcpHandlers() {
  createTypedHandler(mcpContracts.listServers, async (_event, _params, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    
    await ensureDefaultServers(context.userId, db);
    
    // Using simple query API (assuming we can also use select().from())
    // Let's use standard query API since it seems available
    const servers = await db.query.mcpServers.findMany({
      where: eq(remoteSchema.mcpServers.userId, context.userId),
    });
    
    return servers.map(s => ({
      id: s.id,
      name: s.name,
      transport: s.transport as any,
      command: s.command,
      args: safeParseJsonField(s.args),
      envJson: safeParseJsonField(s.envJson),
      headersJson: safeParseJsonField(s.headersJson),
      url: s.url,
      instructions: s.instructions,
      enabled: s.enabled === 1,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));
  });

  createTypedHandler(mcpContracts.createServer, async (_event, params, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();

    const insertData = {
      userId: context.userId,
      name: params.name,
      transport: params.transport,
      command: params.command || null,
      args: params.args ? (typeof params.args === 'string' ? params.args : JSON.stringify(params.args)) : null,
      envJson: params.envJson ? (typeof params.envJson === 'string' ? params.envJson : JSON.stringify(params.envJson)) : null,
      headersJson: params.headersJson ? (typeof params.headersJson === 'string' ? params.headersJson : JSON.stringify(params.headersJson)) : null,
      url: params.url || null,
      instructions: params.instructions || null,
      enabled: params.enabled !== false ? 1 : 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.insert(remoteSchema.mcpServers).values(insertData).returning();
    const s = result[0];
    
    // Trigger OpenCode configuration re-sync
    await triggerOpenCodeMcpSync(context.userId);
    
    return {
      id: s.id,
      name: s.name,
      transport: s.transport as any,
      command: s.command,
      args: safeParseJsonField(s.args),
      envJson: safeParseJsonField(s.envJson),
      headersJson: safeParseJsonField(s.headersJson),
      url: s.url,
      instructions: s.instructions,
      enabled: s.enabled === 1,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    };
  });

  createTypedHandler(mcpContracts.updateServer, async (_event, params, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();

    const updateData: Record<string, any> = { updatedAt: new Date() };
    if (params.name !== undefined) updateData.name = params.name;
    if (params.transport !== undefined) updateData.transport = params.transport;
    if (params.command !== undefined) updateData.command = params.command;
    if (params.args !== undefined) updateData.args = params.args ? (typeof params.args === 'string' ? params.args : JSON.stringify(params.args)) : null;
    if (params.envJson !== undefined) updateData.envJson = params.envJson ? (typeof params.envJson === 'string' ? params.envJson : JSON.stringify(params.envJson)) : null;
    if (params.headersJson !== undefined) updateData.headersJson = params.headersJson ? (typeof params.headersJson === 'string' ? params.headersJson : JSON.stringify(params.headersJson)) : null;
    if (params.url !== undefined) updateData.url = params.url;
    if (params.instructions !== undefined) updateData.instructions = params.instructions;
    if (params.enabled !== undefined) updateData.enabled = params.enabled ? 1 : 0;

    const result = await db.update(remoteSchema.mcpServers)
      .set(updateData)
      .where(and(
         eq(remoteSchema.mcpServers.id, params.id),
         eq(remoteSchema.mcpServers.userId, context.userId)
      ))
      .returning();
      
    if (result.length === 0) throw new Error("Server not found");
    const s = result[0];
    
    // Trigger OpenCode configuration re-sync
    await triggerOpenCodeMcpSync(context.userId);

    return {
      id: s.id,
      name: s.name,
      transport: s.transport as any,
      command: s.command,
      args: safeParseJsonField(s.args),
      envJson: safeParseJsonField(s.envJson),
      headersJson: safeParseJsonField(s.headersJson),
      headersJson: safeParseJsonField(s.headersJson),
      url: s.url,
      instructions: s.instructions,
      enabled: s.enabled === 1,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    };
  });

  createTypedHandler(mcpContracts.deleteServer, async (_event, serverId, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    
    const result = await db.delete(remoteSchema.mcpServers)
      .where(and(
        eq(remoteSchema.mcpServers.id, serverId),
        eq(remoteSchema.mcpServers.userId, context.userId)
      ))
      .returning({ deletedId: remoteSchema.mcpServers.id });
      
    // Trigger OpenCode configuration re-sync
    await triggerOpenCodeMcpSync(context.userId);
      
    return { success: result.length > 0 };
  });

  createTypedHandler(mcpContracts.listTools, async (_event, serverId, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    
    const server = await db.query.mcpServers.findFirst({
      where: and(
        eq(remoteSchema.mcpServers.id, serverId),
        eq(remoteSchema.mcpServers.userId, context.userId)
      ),
    });
    
    if (!server) throw new Error("Server not found");
    
    try {
      // Connect ad-hoc to get tools
      let transport;
      if (server.transport === "stdio") {
        if (!server.command) throw new Error("Command is required for stdio transport");
        const parsedArgs: string[] = safeParseJsonField(server.args) ?? [];
        
        let envVars: Record<string, string> = process.env as Record<string, string>;
        const customEnv = safeParseJsonField<Record<string, string>>(server.envJson);
        if (customEnv) {
          envVars = { ...process.env, ...customEnv };
        }
        
        transport = new StdioClientTransport({
          command: server.command,
          args: parsedArgs,
          env: envVars,
        });
      } else if (server.transport === "http" || server.transport === "sse") {
        if (!server.url) throw new Error("URL is required for remote transport");
        
        // Parse user-configured headers
        let customHeaders: Record<string, string> = {};
        const parsedHeaders = safeParseJsonField<Record<string, string>>(server.headersJson);
        if (parsedHeaders) customHeaders = parsedHeaders;
        // Also merge env vars as potential headers (for API keys etc.)
        const parsedEnvForHeaders = safeParseJsonField<Record<string, string>>(server.envJson);
        if (parsedEnvForHeaders) customHeaders = { ...customHeaders, ...parsedEnvForHeaders };
        
        const serverUrl = new URL(server.url);
        const requestInit: RequestInit = Object.keys(customHeaders).length > 0 
            ? { headers: customHeaders } 
            : {};
        
        // Try modern Streamable HTTP first, then fallback to legacy SSE
        transport = new StreamableHTTPClientTransport(serverUrl, { requestInit });
      } else {
        throw new Error(`Unsupported transport: ${server.transport}`);
      }
      
      const client = new Client(
        { name: "minube-vibes-mcp-inspector", version: "1.0.0" },
        { capabilities: {} }
      );
      
      try {
        await client.connect(transport);
      } catch (streamableErr: any) {
        // If StreamableHTTP fails for remote, try SSE fallback
        if (server.transport === "http" || server.transport === "sse") {
          logger.info(`StreamableHTTP failed for ${server.name}, falling back to SSE: ${streamableErr.message}`);
          
          let customHeaders: Record<string, string> = {};
          const fbHeaders = safeParseJsonField<Record<string, string>>(server.headersJson);
          if (fbHeaders) customHeaders = fbHeaders;
          const fbEnv = safeParseJsonField<Record<string, string>>(server.envJson);
          if (fbEnv) customHeaders = { ...customHeaders, ...fbEnv };
          
          const sseUrl = new URL(server.url!);
          const requestInit: RequestInit = Object.keys(customHeaders).length > 0 
              ? { headers: customHeaders }
              : {};
          transport = new SSEClientTransport(sseUrl, { requestInit });
          await client.connect(transport);
        } else {
          throw streamableErr;
        }
      }
      
      const response = await client.listTools();
      const tools = response.tools.map((t: any) => ({
        name: t.name,
        description: t.description || null,
      }));
      
      // Clean up after fetching
      client.close().catch(e => logger.warn("Error closing temporary MCP client", e));
      
      return tools;
    } catch (e: any) {
      logger.error(`Failed to list tools for server ${server.name}`, e);
      return [];
    }
  });

  // Stubs for consents (we simplify this in Vibes since OpenCode manages it natively,
  // but we keep the endpoints to satisfy the frontend if it uses them)
  createTypedHandler(mcpContracts.getToolConsents, async (_event, _params, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    
    const consents = await db.query.mcpToolConsents.findMany({
      where: eq(remoteSchema.mcpToolConsents.userId, context.userId),
    });
    
    return consents.map(c => ({
      id: c.id,
      serverId: c.serverId,
      toolName: c.toolName,
      consent: c.consent as any,
      updatedAt: c.updatedAt,
    }));
  });

  createTypedHandler(mcpContracts.setToolConsent, async (_event, params, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    
    const existing = await db.query.mcpToolConsents.findFirst({
      where: and(
        eq(remoteSchema.mcpToolConsents.serverId, params.serverId),
        eq(remoteSchema.mcpToolConsents.toolName, params.toolName),
        eq(remoteSchema.mcpToolConsents.userId, context.userId)
      ),
    });
    
    if (existing) {
       const result = await db.update(remoteSchema.mcpToolConsents)
         .set({ consent: params.consent, updatedAt: new Date() })
         .where(eq(remoteSchema.mcpToolConsents.id, existing.id))
         .returning();
       return result[0] as any;
    }
    
    const result = await db.insert(remoteSchema.mcpToolConsents).values({
      userId: context.userId,
      serverId: params.serverId,
      toolName: params.toolName,
      consent: params.consent,
      updatedAt: new Date(),
    }).returning();
    
    return result[0] as any;
  });

  createTypedHandler(mcpContracts.respondToConsent, async () => {
     // No-op. Consent is handled natively by OpenCode adapter in handleVisualQuickEdit/handleOpenCodeStream
  });
}

// Helper to hot-reload OpenCode MCP config
async function triggerOpenCodeMcpSync(userId: string) {
  try {
    const db = getRemoteDb();
    await ensureDefaultServers(userId, db);
    
    const servers = await db.query.mcpServers.findMany({
      where: and(
        eq(remoteSchema.mcpServers.userId, userId),
        eq(remoteSchema.mcpServers.enabled, 1)
      ),
    });
    
    // Make sure returning map matches McpServer type defined in mcp.ts
    const mappedServers = servers.map(s => ({
      id: s.id,
      name: s.name,
      transport: s.transport as "stdio" | "sse" | "http",
      command: s.command,
      args: safeParseJsonField(s.args),
      envJson: safeParseJsonField(s.envJson),
      headersJson: safeParseJsonField(s.headersJson),
      url: s.url,
      enabled: s.enabled === 1,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));
    
    await updateOpenCodeMcpConfig(mappedServers);
  } catch (e: any) {
    logger.warn(`Failed to trigger OpenCode MCP sync: ${e.message}`);
  }
}

async function ensureDefaultServers(userId: string, db: any) {
  try {
    const existing = await db.query.mcpServers.findFirst({
      where: and(
        eq(remoteSchema.mcpServers.userId, userId),
        eq(remoteSchema.mcpServers.name, "context7")
      )
    });
    
    const OLD_CONTEXT7_PROMPT = `CONTEXT7-DOCS-RULE: Before integrating, configuring, or upgrading any library, framework, or external dependency, ALWAYS use the Context7 MCP tools (resolve-library-id → query-docs) to fetch up-to-date documentation. Verify API compatibility with the project's existing versions. Never rely on memorized knowledge for library APIs — docs change frequently and your training data may be outdated.`;

    const DEFAULT_CONTEXT7_PROMPT = `## Context7 Integration (Server: \`{{SERVER_PREFIX}}\`)

Context7 retrieves real-time, version-specific API references and code examples directly from official documentation sources to prevent hallucinations of deprecated or incorrect APIs.

### Rules & Workflow:
1. **Always Verify**: Before writing, configuring, or upgrading code involving any external libraries or frameworks (such as React, Next.js, Drizzle, TailwindCSS, Vite, Vue, Astro, Express, etc.), ALWAYS query their official up-to-date documentation using Context7. Do not rely on memorized training data.
2. **Retrieve Library ID**:
   - Call \`{{SERVER_PREFIX}}_resolve-library-id\` with \`libraryName\` (e.g., "tailwindcss") to find the exact \`libraryId\` (e.g., "tailwindlabs/tailwindcss").
   - If you already know the library's exact ID, you may skip the resolution step and use it directly.
3. **Query Documentation**:
   - Call \`{{SERVER_PREFIX}}_query-docs\` with the resolved \`libraryId\` and your specific question or task \`query\` (e.g., "how to define a grid layout with responsive columns").
4. **Authoritativeness**: Ground all library-specific implementations in the documentation retrieved. Live documentation from Context7 is authoritative and must take precedence over your internal training data.`;

    const isOldPrompt = !existing?.instructions ||
      existing.instructions === OLD_CONTEXT7_PROMPT ||
      existing.instructions.includes("Context7 retrieves real-time, version-specific API references and examples to avoid hallucinating");

    if (!existing) {
      logger.info(`Seeding default Context7 server for user ${userId}`);
      await db.insert(remoteSchema.mcpServers).values({
        userId,
        name: "context7",
        transport: "http",
        url: "https://mcp.context7.com/mcp",
        headersJson: JSON.stringify({ "CONTEXT7_API_KEY": "ctx7sk-8b4a1d13-1748-4c4e-8861-2ec17c76b42e" }),
        enabled: 1,
        instructions: DEFAULT_CONTEXT7_PROMPT,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning();
    } else if (isOldPrompt) {
      logger.info(`Updating default instructions for existing Context7 server of user ${userId}`);
      await db.update(remoteSchema.mcpServers)
        .set({
          instructions: DEFAULT_CONTEXT7_PROMPT,
          updatedAt: new Date(),
        })
        .where(eq(remoteSchema.mcpServers.id, existing.id));
    }
  } catch (e: any) {
    logger.warn(`Failed to seed default servers: ${e.message}`);
  }
}
