import log from "electron-log";
import { getRemoteDb } from "@/db/remote";
import * as remoteSchema from "@/db/remote-schema";
import { eq, and } from "drizzle-orm";
import { createTypedHandler } from "./base";
import { promptContracts } from "../types/prompts";

const _logger = log.scope("prompt_handlers");

export function registerPromptHandlers() {
  createTypedHandler(promptContracts.list, async (_, __, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    const rows = await db.select().from(remoteSchema.prompts).where(eq(remoteSchema.prompts.userId, context.userId));
    return rows.map((r) => ({
      id: r.id!,
      title: r.title,
      description: r.description ?? undefined,
      content: r.content,
      createdAt: r.createdAt as unknown as string,
      updatedAt: r.updatedAt as unknown as string,
    }));
  });

  createTypedHandler(promptContracts.create, async (_, params, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    const { title, content, description } = params;
    if (!title || !content) {
      throw new Error("Title and content are required");
    }
    const [row] = await db
      .insert(remoteSchema.prompts)
      .values({
        userId: context.userId,
        title,
        description,
        content,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    if (!row) throw new Error("Failed to create prompt");
    return {
      id: row.id!,
      title: row.title,
      description: row.description ?? undefined,
      content: row.content,
      createdAt: row.createdAt as unknown as string,
      updatedAt: row.updatedAt as unknown as string,
    };
  });

  createTypedHandler(promptContracts.update, async (_, params, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    const { id, title, content, description } = params;
    if (!id) throw new Error("Prompt id is required");
    const now = new Date();
    const updateData: Record<string, any> = { updatedAt: now };
    if (title !== undefined) updateData.title = title;
    if (content !== undefined) updateData.content = content;
    if (description !== undefined) updateData.description = description;
    await db.update(remoteSchema.prompts).set(updateData).where(and(eq(remoteSchema.prompts.id, id), eq(remoteSchema.prompts.userId, context.userId)));
  });

  createTypedHandler(promptContracts.delete, async (_, id, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    if (!id) throw new Error("Prompt id is required");
    await db.delete(remoteSchema.prompts).where(and(eq(remoteSchema.prompts.id, id), eq(remoteSchema.prompts.userId, context.userId)));
  });
}
