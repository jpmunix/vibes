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
      id: Number(r.id),
      categoryId: r.categoryId !== null ? Number(r.categoryId) : null,
      systemId: r.systemId,
      title: r.title,
      description: r.description ?? null,
      content: r.content,
      enabled: r.enabled === 1,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  });

  createTypedHandler(promptContracts.create, async (_, params, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    const { title, content, description, categoryId, systemId, enabled } = params;
    if (!title || !content) {
      throw new Error("Title and content are required");
    }
    const [row] = await db
      .insert(remoteSchema.prompts)
      .values({
        userId: context.userId,
        categoryId: categoryId ?? null,
        systemId: systemId ?? null,
        title,
        description,
        content,
        enabled: enabled === false ? 0 : 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    if (!row) throw new Error("Failed to create prompt");
    
    // Sync to user settings if it's a system prompt (fire & forget to avoid UI lag)
    if (systemId) {
        const capturedUserId = context.userId;
        const capturedSystemId = systemId;
        const capturedContent = content;
        setImmediate(async () => {
            try {
                const asyncDb = getRemoteDb();
                const [userSettingRow] = await asyncDb.select().from(remoteSchema.userSettings).where(eq(remoteSchema.userSettings.userId, capturedUserId));
                if (userSettingRow) {
                    const currentSettings = JSON.parse(userSettingRow.settingsJson);
                    currentSettings.customPrompts = currentSettings.customPrompts || {};
                    currentSettings.customPrompts[capturedSystemId] = capturedContent;
                    await asyncDb.update(remoteSchema.userSettings)
                      .set({ settingsJson: JSON.stringify(currentSettings), updatedAt: new Date() })
                      .where(eq(remoteSchema.userSettings.userId, capturedUserId));
                }
            } catch (err) {
                _logger.error("Error syncing new prompt to user settings:", err);
            }
        });
    }

    return {
      id: Number(row.id),
      categoryId: row.categoryId !== null ? Number(row.categoryId) : null,
      systemId: row.systemId,
      title: row.title,
      description: row.description ?? null,
      content: row.content,
      enabled: row.enabled === 1,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  });

  createTypedHandler(promptContracts.update, async (_, params, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    const { id, title, content, description, categoryId, enabled } = params;
    if (!id) throw new Error("Prompt id is required");
    const now = new Date();
    const updateData: Record<string, any> = { updatedAt: now };
    if (title !== undefined) updateData.title = title;
    if (content !== undefined) updateData.content = content;
    if (description !== undefined) updateData.description = description;
    if (categoryId !== undefined) updateData.categoryId = categoryId;
    if (enabled !== undefined) updateData.enabled = enabled ? 1 : 0;
    await db.update(remoteSchema.prompts).set(updateData).where(and(eq(remoteSchema.prompts.id, id), eq(remoteSchema.prompts.userId, context.userId)));
    
    // Sync to settings (fire & forget to avoid UI lag)
    if (content !== undefined || enabled !== undefined) {
        const capturedUserId = context.userId;
        const capturedId = id;
        setImmediate(async () => {
            try {
                const asyncDb = getRemoteDb();
                const [promptRow] = await asyncDb.select().from(remoteSchema.prompts).where(eq(remoteSchema.prompts.id, capturedId));
                if (promptRow && promptRow.systemId) {
                    const [userSettingRow] = await asyncDb.select().from(remoteSchema.userSettings).where(eq(remoteSchema.userSettings.userId, capturedUserId));
                    if (userSettingRow) {
                        const currentSettings = JSON.parse(userSettingRow.settingsJson);
                        currentSettings.customPrompts = currentSettings.customPrompts || {};
                        
                        if (promptRow.enabled === 0) {
                            currentSettings.customPrompts[promptRow.systemId] = ""; 
                        } else {
                            currentSettings.customPrompts[promptRow.systemId] = promptRow.content;
                        }
                        
                        await asyncDb.update(remoteSchema.userSettings)
                          .set({ settingsJson: JSON.stringify(currentSettings), updatedAt: new Date() })
                          .where(eq(remoteSchema.userSettings.userId, capturedUserId));
                    }
                }
            } catch (err) {
                _logger.error("Error syncing updated prompt to user settings:", err);
            }
        });
    }
  });

  createTypedHandler(promptContracts.delete, async (_, id, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    if (!id) throw new Error("Prompt id is required");
    await db.delete(remoteSchema.prompts).where(and(eq(remoteSchema.prompts.id, id), eq(remoteSchema.prompts.userId, context.userId)));
  });

  // Categories
  createTypedHandler(promptContracts.listCategories, async (_, __, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    const rows = await db.select().from(remoteSchema.promptsCategories).where(eq(remoteSchema.promptsCategories.userId, context.userId));
    return rows.map((r) => ({
      id: Number(r.id),
      name: r.name,
      description: r.description ?? null,
    }));
  });

  createTypedHandler(promptContracts.createCategory, async (_, params, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    const { name, description } = params;
    if (!name) throw new Error("Name is required");

    const [row] = await db
      .insert(remoteSchema.promptsCategories)
      .values({
        userId: context.userId,
        name,
        description,
      })
      .returning();

    if (!row) throw new Error("Failed to create category");
    return {
      id: Number(row.id),
      name: row.name,
      description: row.description ?? null,
    };
  });

  createTypedHandler(promptContracts.updateCategory, async (_, params, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    const { id, name, description } = params;
    if (!id) throw new Error("Category id is required");

    const updateData: Record<string, any> = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    
    await db.update(remoteSchema.promptsCategories).set(updateData).where(and(eq(remoteSchema.promptsCategories.id, id), eq(remoteSchema.promptsCategories.userId, context.userId)));
  });

  createTypedHandler(promptContracts.deleteCategory, async (_, id, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    if (!id) throw new Error("Category id is required");
    
    // Unlink prompts from this category
    await db.update(remoteSchema.prompts).set({ categoryId: null }).where(and(eq(remoteSchema.prompts.categoryId, id), eq(remoteSchema.prompts.userId, context.userId)));

    await db.delete(remoteSchema.promptsCategories).where(and(eq(remoteSchema.promptsCategories.id, id), eq(remoteSchema.promptsCategories.userId, context.userId)));
  });
}
