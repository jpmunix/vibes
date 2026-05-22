import log from "electron-log";
import { getRemoteDb } from "@/db/remote";
import * as remoteSchema from "@/db/remote-schema";
import { eq, and } from "drizzle-orm";
import { createTypedHandler } from "./base";
import { customAgentsContracts } from "../types/custom_agents";

const _logger = log.scope("custom_agent_handlers");

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
      baseAgent: r.baseAgent as "build" | "plan" | "explore",
      promptMode: r.promptMode as "additive" | "replace",
      slashCommand: r.slashCommand,
      modelSource: r.modelSource as "chat" | "static",
      model: r.model ?? null,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  });

  createTypedHandler(customAgentsContracts.create, async (_, params, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    const { name, description, systemPrompt, baseAgent, promptMode, slashCommand, modelSource, model } = params;

    if (!name || !systemPrompt || !baseAgent || !promptMode || !slashCommand) {
      throw new Error("Missing required fields for custom agent");
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
        slashCommand: slashCommand.replace(/^\//, ""), // Asegurar que no lleva '/' al guardarse
        modelSource: modelSource ?? "chat",
        model: model ?? null,
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
      baseAgent: row.baseAgent as "build" | "plan" | "explore",
      promptMode: row.promptMode as "additive" | "replace",
      slashCommand: row.slashCommand,
      modelSource: row.modelSource as "chat" | "static",
      model: row.model ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  });

  createTypedHandler(customAgentsContracts.update, async (_, params, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    const { id, name, description, systemPrompt, baseAgent, promptMode, slashCommand, modelSource, model } = params;

    if (!id) throw new Error("Custom agent id is required");

    const now = new Date();
    const updateData: Record<string, any> = { updatedAt: now };

    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (systemPrompt !== undefined) updateData.systemPrompt = systemPrompt;
    if (baseAgent !== undefined) updateData.baseAgent = baseAgent;
    if (promptMode !== undefined) updateData.promptMode = promptMode;
    if (slashCommand !== undefined) {
      updateData.slashCommand = slashCommand.replace(/^\//, "");
    }
    if (modelSource !== undefined) updateData.modelSource = modelSource;
    if (model !== undefined) updateData.model = model;

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
