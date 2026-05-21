import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { getRemoteDb } from "../../db/remote";
import * as remoteSchema from "../../db/remote-schema";
import { eq } from "drizzle-orm";
import log from "electron-log";

const logger = log.scope("mcp_manager");

function safeParseJsonField<T = any>(raw: any): T | null {
  if (raw == null) return null;
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

class McpClientWrapper {
  private serverId: number;
  private client: Client | null = null;
  private transport: any = null;

  constructor(serverId: number) {
    this.serverId = serverId;
  }

  private async connect(): Promise<Client> {
    if (this.client) return this.client;

    const db = getRemoteDb();
    const server = await db.query.mcpServers.findFirst({
      where: eq(remoteSchema.mcpServers.id, this.serverId),
    });

    if (!server) throw new Error(`MCP Server with ID ${this.serverId} not found`);

    let transport;
    if (server.transport === "stdio") {
      if (!server.command) throw new Error("Command is required for stdio transport");
      const parsedArgs: string[] = safeParseJsonField(server.args) ?? [];
      
      const envVars: Record<string, string> = {};
      for (const [k, v] of Object.entries(process.env)) {
        if (v !== undefined) envVars[k] = v;
      }
      const customEnv = safeParseJsonField<Record<string, string>>(server.envJson);
      if (customEnv) {
        for (const [k, v] of Object.entries(customEnv)) {
          if (v !== undefined) envVars[k] = v;
        }
      }
      
      transport = new StdioClientTransport({
        command: server.command,
        args: parsedArgs,
        env: envVars,
      });
    } else if (server.transport === "http" || server.transport === "sse") {
      if (!server.url) throw new Error("URL is required for remote transport");
      
      let customHeaders: Record<string, string> = {};
      const parsedHeaders = safeParseJsonField<Record<string, string>>(server.headersJson);
      if (parsedHeaders) customHeaders = parsedHeaders;
      const parsedEnvForHeaders = safeParseJsonField<Record<string, string>>(server.envJson);
      if (parsedEnvForHeaders) customHeaders = { ...customHeaders, ...parsedEnvForHeaders };
      
      const serverUrl = new URL(server.url);
      const requestInit: RequestInit = Object.keys(customHeaders).length > 0 
          ? { headers: customHeaders } 
          : {};
      
      transport = new StreamableHTTPClientTransport(serverUrl, { requestInit });
    } else {
      throw new Error(`Unsupported transport: ${server.transport}`);
    }

    const client = new Client(
      { name: "minube-vibes-mcp-agent-client", version: "1.0.0" },
      { capabilities: {} }
    );

    try {
      await client.connect(transport);
    } catch (err: any) {
      if (server.transport === "http" || server.transport === "sse") {
        logger.info(`StreamableHTTP connection failed, trying SSE fallback: ${err.message}`);
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
        throw err;
      }
    }

    this.client = client;
    this.transport = transport;
    return client;
  }

  async tools(): Promise<Record<string, { description?: string; inputSchema: any; execute: (args: any, execCtx: any) => Promise<any> }>> {
    const client = await this.connect();
    const response = await client.listTools();
    
    const toolSet: Record<string, any> = {};
    for (const t of response.tools) {
      toolSet[t.name] = {
        description: t.description,
        inputSchema: t.inputSchema,
        execute: async (args: any) => {
          const runClient = await this.connect();
          const result = await runClient.callTool({
            name: t.name,
            arguments: args,
          });
          return result;
        }
      };
    }
    return toolSet;
  }

  async close() {
    if (this.client) {
      try {
        await this.client.close();
      } catch (e) {
        logger.warn("Error closing MCP client", e);
      }
      this.client = null;
      this.transport = null;
    }
  }
}

class McpManager {
  private clients = new Map<number, McpClientWrapper>();

  async getClient(serverId: number): Promise<McpClientWrapper> {
    let wrapper = this.clients.get(serverId);
    if (!wrapper) {
      wrapper = new McpClientWrapper(serverId);
      this.clients.set(serverId, wrapper);
    }
    return wrapper;
  }

  async closeAll() {
    for (const wrapper of this.clients.values()) {
      await wrapper.close();
    }
    this.clients.clear();
  }
}

export const mcpManager = new McpManager();
