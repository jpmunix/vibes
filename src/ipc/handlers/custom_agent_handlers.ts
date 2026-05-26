import log from "electron-log";
import { getRemoteDb } from "@/db/remote";
import * as remoteSchema from "@/db/remote-schema";
import { eq, and } from "drizzle-orm";
import { createTypedHandler } from "./base";
import { customAgentsContracts } from "../types/custom_agents";

const _logger = log.scope("custom_agent_handlers");

function getUltimateBaseAgent(baseAgent: string, allAgents: any[]): "build" | "plan" | "explore" {
  let currentBase = baseAgent;
  const visited = new Set<number>();
  while (currentBase.startsWith("custom-agent::")) {
    const parentId = parseInt(currentBase.split("::")[1]);
    if (visited.has(parentId)) break;
    visited.add(parentId);
    const parent = allAgents.find(a => a.id === parentId);
    if (!parent) break;
    currentBase = parent.baseAgent;
  }
  return currentBase as "build" | "plan" | "explore";
}

async function clearOtherDefaults(db: any, userId: string, targetUltimateBase: string, currentAgentId?: number) {
  const allAgents = await db
    .select()
    .from(remoteSchema.customAgents)
    .where(eq(remoteSchema.customAgents.userId, userId));
  
  for (const agent of allAgents) {
    if (agent.id === currentAgentId) continue;
    if (agent.isDefaultBase === 1) {
      const ultBase = getUltimateBaseAgent(agent.baseAgent, allAgents);
      if (ultBase === targetUltimateBase) {
        await db
          .update(remoteSchema.customAgents)
          .set({ isDefaultBase: 0, updatedAt: new Date() })
          .where(eq(remoteSchema.customAgents.id, agent.id));
      }
    }
  }
}

export function registerCustomAgentHandlers() {
  createTypedHandler(customAgentsContracts.list, async (_, __, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    const rows = await db
      .select()
      .from(remoteSchema.customAgents)
      .where(eq(remoteSchema.customAgents.userId, context.userId));

    return rows.map((r) => ({
      id: r.id!,
      name: r.name,
      description: r.description ?? null,
      systemPrompt: r.systemPrompt,
      baseAgent: r.baseAgent,
      promptMode: r.promptMode as "additive" | "replace",
      isDefaultBase: r.isDefaultBase,
      slashCommand: r.slashCommand,
      modelSource: r.modelSource as "chat" | "static",
      model: r.model ?? null,
      prompt: r.prompt ?? null,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  });

  createTypedHandler(customAgentsContracts.create, async (_, params, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    const { name, description, systemPrompt, baseAgent, promptMode, slashCommand, modelSource, model, prompt, isDefaultBase } = params;

    if (!name || !systemPrompt || !baseAgent || !promptMode || !slashCommand) {
      throw new Error("Missing required fields for custom agent");
    }

    if (isDefaultBase === 1) {
      const allAgents = await db
        .select()
        .from(remoteSchema.customAgents)
        .where(eq(remoteSchema.customAgents.userId, context.userId));
      const targetUltimateBase = getUltimateBaseAgent(baseAgent, allAgents);
      await clearOtherDefaults(db, context.userId, targetUltimateBase);
    }

    const [row] = await db
      .insert(remoteSchema.customAgents)
      .values({
        userId: context.userId,
        name,
        description,
        systemPrompt,
        baseAgent,
        promptMode,
        isDefaultBase: isDefaultBase ?? 0,
        slashCommand: slashCommand.replace(/^\//, ""), // Asegurar que no lleva '/' al guardarse
        modelSource: modelSource ?? "chat",
        model: model ?? null,
        prompt: prompt ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    if (!row) throw new Error("Failed to create custom agent");

    return {
      id: row.id!,
      name: row.name,
      description: row.description ?? null,
      systemPrompt: row.systemPrompt,
      baseAgent: row.baseAgent,
      promptMode: row.promptMode as "additive" | "replace",
      isDefaultBase: row.isDefaultBase,
      slashCommand: row.slashCommand,
      modelSource: row.modelSource as "chat" | "static",
      model: row.model ?? null,
      prompt: row.prompt ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  });

  createTypedHandler(customAgentsContracts.update, async (_, params, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    const { id, name, description, systemPrompt, baseAgent, promptMode, slashCommand, modelSource, model, prompt, isDefaultBase } = params;

    if (!id) throw new Error("Custom agent id is required");

    if (isDefaultBase === 1) {
      const existing = await db.query.customAgents.findFirst({
        where: and(
          eq(remoteSchema.customAgents.id, id),
          eq(remoteSchema.customAgents.userId, context.userId)
        )
      });
      if (!existing) throw new Error("Custom agent not found");
      const resolvedBaseAgent = baseAgent !== undefined ? baseAgent : existing.baseAgent;
      
      const allAgents = await db
        .select()
        .from(remoteSchema.customAgents)
        .where(eq(remoteSchema.customAgents.userId, context.userId));
      const targetUltimateBase = getUltimateBaseAgent(resolvedBaseAgent, allAgents);
      await clearOtherDefaults(db, context.userId, targetUltimateBase, id);
    }

    const now = new Date();
    const updateData: Record<string, any> = { updatedAt: now };

    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (systemPrompt !== undefined) updateData.systemPrompt = systemPrompt;
    if (baseAgent !== undefined) updateData.baseAgent = baseAgent;
    if (promptMode !== undefined) updateData.promptMode = promptMode;
    if (isDefaultBase !== undefined) updateData.isDefaultBase = isDefaultBase;
    if (slashCommand !== undefined) {
      updateData.slashCommand = slashCommand.replace(/^\//, "");
    }
    if (modelSource !== undefined) updateData.modelSource = modelSource;
    if (model !== undefined) updateData.model = model;
    if (prompt !== undefined) updateData.prompt = prompt;

    await db
      .update(remoteSchema.customAgents)
      .set(updateData)
      .where(
        and(
          eq(remoteSchema.customAgents.id, id),
          eq(remoteSchema.customAgents.userId, context.userId)
        )
      );
  });

  createTypedHandler(customAgentsContracts.delete, async (_, id, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();

    if (!id) throw new Error("Custom agent id is required");

    await db
      .delete(remoteSchema.customAgents)
      .where(
        and(
          eq(remoteSchema.customAgents.id, id),
          eq(remoteSchema.customAgents.userId, context.userId)
        )
      );
  });
}
