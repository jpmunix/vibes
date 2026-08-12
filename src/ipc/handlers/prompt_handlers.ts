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

    // Modelo: prompt_defaults (global) es la fuente del contenido base.
    // La tabla `prompts` del usuario SOLO guarda overrides (filas con
    // systemId y content/enabled/scope distintos del default). Si el usuario
    // no ha tocado un prompt del sistema, NO existe fila — el handler
    // sintetiza la entrada con id:null para que la UI la muestre sin escribirla.
    const [defaultRows, userRows, categoryRows] = await Promise.all([
      db.select().from(remoteSchema.promptDefaults),
      db
        .select()
        .from(remoteSchema.prompts)
        .where(eq(remoteSchema.prompts.userId, context.userId)),
      db
        .select()
        .from(remoteSchema.promptsCategories)
        .where(eq(remoteSchema.promptsCategories.userId, context.userId)),
    ]);

    const defaultsBySystemId = new Map(
      defaultRows.map((d) => [d.systemId, d]),
    );
    const overridesBySystemId = new Map<string, (typeof userRows)[number]>();
    const customRows: (typeof userRows)[number][] = [];
    for (const r of userRows) {
      if (r.systemId && defaultsBySystemId.has(r.systemId)) {
        overridesBySystemId.set(r.systemId, r);
      } else if (!r.systemId) {
        customRows.push(r);
      }
      // Filas con systemId huérfano (no existe en prompt_defaults) se ignoran
      // en la vista de sistema; si hay que recuperarlas, el diagnóstico las lista.
    }

    // Categoría "Prompts del sistema" del usuario (cat 19 en seed).
    // Si no existe (caso raro de usuario sin seed), se cae a null y la UI
    // mostrará el prompt sin categoría — pero nunca debería pasar.
    const systemCategoryId =
      categoryRows.find((c) => c.name === "Prompts del sistema")?.id ?? null;
    // Categoría "revisar" — prompts que NO llegan a vibes-core (se usan en
    // otros handlers o son huérfanos históricos). Se crean al vuelo desde
    // prompt_defaults sintetizados; los overrides del usuario se mueven aquí
    // vía migrate-prompt-revisar.ts.
    const revisarCategoryId =
      categoryRows.find((c) => c.name === "revisar")?.id ?? null;

    // Regla de clasificación (P1: solo ctx_* + runtime_agent_base llegan a
    // vibes-core como agent.systemPrompt; el resto se quedó en prompt_defaults
    // pero lo leen otros handlers vía getSystemPrompt o es histórico muerto).
    const isRuntimeSystemId = (systemId: string): boolean =>
      systemId.startsWith("ctx_") || systemId === "runtime_agent_base";

    const result: Array<{
      id: number | null;
      categoryId: number | null | undefined;
      systemId: string | null;
      title: string;
      description: string | null;
      content: string;
      enabled: boolean;
      scope: string;
      hasDefault: boolean;
      isModified: boolean;
      createdAt: Date | null;
      updatedAt: Date | null;
    }> = [];

    // 1) Para cada prompt_default, sintetizar una entrada (con o sin override).
    for (const def of defaultRows) {
      const override = overridesBySystemId.get(def.systemId);
      if (override) {
        // Override del usuario: content/enabled/scope pueden diferir del default.
        result.push({
          id: Number(override.id),
          categoryId:
            override.categoryId !== null ? Number(override.categoryId) : null,
          systemId: def.systemId,
          title: def.title, // título viene siempre del default (inmutable por versión)
          description: def.description,
          content: override.content,
          enabled: override.enabled === 1,
          scope: override.scope ?? "all",
          hasDefault: true,
          isModified: true,
          createdAt: override.createdAt,
          updatedAt: override.updatedAt,
        });
      } else {
        // Sin override: leer del default directamente. id:null porque NO hay fila.
        // La categoría depende de si el prompt llega a vibes-core o no.
        const targetCategoryId = isRuntimeSystemId(def.systemId)
          ? systemCategoryId
          : revisarCategoryId;
        result.push({
          id: null,
          categoryId: targetCategoryId
            ? Number(targetCategoryId)
            : null,
          systemId: def.systemId,
          title: def.title,
          description: def.description,
          content: def.content,
          enabled: true,
          scope: "all",
          hasDefault: true,
          isModified: false,
          createdAt: def.updatedAt,
          updatedAt: def.updatedAt,
        });
      }
    }

    // 2) Prompts custom del usuario (sin systemId). No tienen default.
    for (const r of customRows) {
      result.push({
        id: Number(r.id),
        categoryId: r.categoryId !== null ? Number(r.categoryId) : null,
        systemId: null,
        title: r.title ?? "",
        description: r.description ?? null,
        content: r.content,
        enabled: r.enabled === 1,
        scope: r.scope ?? "all",
        hasDefault: false,
        isModified: false,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      });
    }

    return result;
  });

  createTypedHandler(promptContracts.create, async (_, params, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    const {
      title,
      content,
      description,
      categoryId,
      systemId,
      enabled,
      scope,
    } = params;
    if (!title || !content) {
      throw new Error("Title and content are required");
    }

    // Upsert por (userId, systemId) cuando viene systemId: evita filas
    // duplicadas cuando la UI hace doble toggle rápido y aún no ha refrescado.
    // Sin systemId (prompt custom) sigue siendo un INSERT normal.
    let row:
      | (typeof remoteSchema.prompts.$inferSelect)
      | undefined;

    if (systemId) {
      const existing = await db
        .select()
        .from(remoteSchema.prompts)
        .where(
          and(
            eq(remoteSchema.prompts.userId, context.userId),
            eq(remoteSchema.prompts.systemId, systemId),
          ),
        );
      if (existing.length > 0) {
        const updated = await db
          .update(remoteSchema.prompts)
          .set({
            categoryId: categoryId ?? null,
            title,
            description,
            content,
            enabled: enabled === false ? 0 : 1,
            scope: scope ?? "all",
            updatedAt: new Date(),
          })
          .where(eq(remoteSchema.prompts.id, existing[0].id))
          .returning();
        row = updated[0];
      }
    }

    if (!row) {
      const inserted = await db
        .insert(remoteSchema.prompts)
        .values({
          userId: context.userId,
          categoryId: categoryId ?? null,
          systemId: systemId ?? null,
          title,
          description,
          content,
          enabled: enabled === false ? 0 : 1,
          scope: scope ?? "all",
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();
      row = inserted[0];
    }

    if (!row) throw new Error("Failed to create prompt");

    // Sync to user settings if it's a system prompt (fire & forget to avoid UI lag)
    if (systemId) {
      const capturedUserId = context.userId;
      const capturedSystemId = systemId;
      const capturedContent = content;
      setImmediate(async () => {
        try {
          const asyncDb = getRemoteDb();
          const [userSettingRow] = await asyncDb
            .select()
            .from(remoteSchema.userSettings)
            .where(eq(remoteSchema.userSettings.userId, capturedUserId));
          if (userSettingRow) {
            const currentSettings = JSON.parse(userSettingRow.settingsJson);
            currentSettings.customPrompts = currentSettings.customPrompts || {};
            currentSettings.customPrompts[capturedSystemId] = capturedContent;
            await asyncDb
              .update(remoteSchema.userSettings)
              .set({
                settingsJson: JSON.stringify(currentSettings),
                updatedAt: new Date(),
              })
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
      title: row.title ?? "",
      description: row.description ?? null,
      content: row.content,
      enabled: row.enabled === 1,
      scope: row.scope ?? "all",
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  });

  createTypedHandler(promptContracts.update, async (_, params, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    const { id, title, content, description, categoryId, enabled, scope } =
      params;
    if (!id) throw new Error("Prompt id is required");
    const now = new Date();
    const updateData: Record<string, any> = { updatedAt: now };
    if (title !== undefined) updateData.title = title;
    if (content !== undefined) updateData.content = content;
    if (description !== undefined) updateData.description = description;
    if (categoryId !== undefined) updateData.categoryId = categoryId;
    if (enabled !== undefined) updateData.enabled = enabled ? 1 : 0;
    if (scope !== undefined) updateData.scope = scope;
    await db
      .update(remoteSchema.prompts)
      .set(updateData)
      .where(
        and(
          eq(remoteSchema.prompts.id, id),
          eq(remoteSchema.prompts.userId, context.userId),
        ),
      );

    // Sync to settings (fire & forget to avoid UI lag)
    if (content !== undefined || enabled !== undefined) {
      const capturedUserId = context.userId;
      const capturedId = id;
      setImmediate(async () => {
        try {
          const asyncDb = getRemoteDb();
          const [promptRow] = await asyncDb
            .select()
            .from(remoteSchema.prompts)
            .where(eq(remoteSchema.prompts.id, capturedId));
          if (promptRow && promptRow.systemId) {
            const [userSettingRow] = await asyncDb
              .select()
              .from(remoteSchema.userSettings)
              .where(eq(remoteSchema.userSettings.userId, capturedUserId));
            if (userSettingRow) {
              const currentSettings = JSON.parse(userSettingRow.settingsJson);
              currentSettings.customPrompts =
                currentSettings.customPrompts || {};

              if (promptRow.enabled === 0) {
                currentSettings.customPrompts[promptRow.systemId] = "";
              } else {
                currentSettings.customPrompts[promptRow.systemId] =
                  promptRow.content;
              }

              await asyncDb
                .update(remoteSchema.userSettings)
                .set({
                  settingsJson: JSON.stringify(currentSettings),
                  updatedAt: new Date(),
                })
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
    if (!id) throw new Error("Prompt id is required");
    const db = getRemoteDb();

    // System prompts (with systemId) are not user-deletable. They belong to
    // the product; users can edit or restore them but not remove them.
    const [target] = await db
      .select()
      .from(remoteSchema.prompts)
      .where(
        and(
          eq(remoteSchema.prompts.id, id),
          eq(remoteSchema.prompts.userId, context.userId),
        ),
      );
    if (!target) throw new Error("Prompt not found");
    if (target.systemId) {
      throw new Error(
        "No puedes eliminar un prompt del sistema. Edita su contenido o restáuralo al valor de fábrica.",
      );
    }

    await db
      .delete(remoteSchema.prompts)
      .where(
        and(
          eq(remoteSchema.prompts.id, id),
          eq(remoteSchema.prompts.userId, context.userId),
        ),
      );
  });

  // Restore default de fábrica de un prompt del sistema.
  // BORRA la fila override: el handler `list` sintetiza la entrada desde
  // prompt_defaults y la DB es la única fuente de verdad (sin fallback a código).
  createTypedHandler(
    promptContracts.restoreDefault,
    async (_, params, context) => {
      if (!context.userId) throw new Error("Unauthorized");
      const db = getRemoteDb();
      const { id, systemId } = params;
      if (!id || !systemId) throw new Error("id and systemId are required");

      const [defaultRow] = await db
        .select()
        .from(remoteSchema.promptDefaults)
        .where(eq(remoteSchema.promptDefaults.systemId, systemId));
      if (!defaultRow) throw new Error(`No default for systemId: ${systemId}`);

      await db
        .delete(remoteSchema.prompts)
        .where(
          and(
            eq(remoteSchema.prompts.id, id),
            eq(remoteSchema.prompts.userId, context.userId),
            eq(remoteSchema.prompts.systemId, systemId),
          ),
        );

      // Limpiar el override en userSettings.customPrompts (fire & forget).
      const capturedUserId = context.userId;
      const capturedSystemId = systemId;
      setImmediate(async () => {
        try {
          const asyncDb = getRemoteDb();
          const [userSettingRow] = await asyncDb
            .select()
            .from(remoteSchema.userSettings)
            .where(eq(remoteSchema.userSettings.userId, capturedUserId));
          if (userSettingRow) {
            const currentSettings = JSON.parse(userSettingRow.settingsJson);
            if (
              currentSettings.customPrompts &&
              currentSettings.customPrompts[capturedSystemId] !== undefined
            ) {
              delete currentSettings.customPrompts[capturedSystemId];
              await asyncDb
                .update(remoteSchema.userSettings)
                .set({
                  settingsJson: JSON.stringify(currentSettings),
                  updatedAt: new Date(),
                })
                .where(
                  eq(remoteSchema.userSettings.userId, capturedUserId),
                );
            }
          }
        } catch (err) {
          _logger.error("Error syncing restored prompt to user settings:", err);
        }
      });
    },
  );

  // Categories
  createTypedHandler(promptContracts.listCategories, async (_, __, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    const rows = await db
      .select()
      .from(remoteSchema.promptsCategories)
      .where(eq(remoteSchema.promptsCategories.userId, context.userId));
    return rows.map((r) => ({
      id: Number(r.id),
      name: r.name,
      description: r.description ?? null,
      isSystem: r.isSystem === 1,
    }));
  });

  createTypedHandler(
    promptContracts.createCategory,
    async (_, params, context) => {
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
        isSystem: row.isSystem === 1,
      };
    },
  );

  createTypedHandler(
    promptContracts.updateCategory,
    async (_, params, context) => {
      if (!context.userId) throw new Error("Unauthorized");
      const db = getRemoteDb();
      const { id, name, description } = params;
      if (!id) throw new Error("Category id is required");

      const updateData: Record<string, any> = {};
      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;

      await db
        .update(remoteSchema.promptsCategories)
        .set(updateData)
        .where(
          and(
            eq(remoteSchema.promptsCategories.id, id),
            eq(remoteSchema.promptsCategories.userId, context.userId),
          ),
        );
    },
  );

  createTypedHandler(promptContracts.deleteCategory, async (_, id, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    if (!id) throw new Error("Category id is required");

    // Protect system categories from deletion
    const [cat] = await db
      .select()
      .from(remoteSchema.promptsCategories)
      .where(
        and(
          eq(remoteSchema.promptsCategories.id, id),
          eq(remoteSchema.promptsCategories.userId, context.userId),
        ),
      );
    if (cat && cat.isSystem === 1) {
      throw new Error("Cannot delete a system category");
    }

    // Unlink prompts from this category
    await db
      .update(remoteSchema.prompts)
      .set({ categoryId: null })
      .where(
        and(
          eq(remoteSchema.prompts.categoryId, id),
          eq(remoteSchema.prompts.userId, context.userId),
        ),
      );

    await db
      .delete(remoteSchema.promptsCategories)
      .where(
        and(
          eq(remoteSchema.promptsCategories.id, id),
          eq(remoteSchema.promptsCategories.userId, context.userId),
        ),
      );
  });
}

/**
 * Pure helper: compute whether a prompt has a factory default and whether its
 * content differs from it. Extracted for unit testing (no Electron/DB deps).
 */
export function computePromptDefaultStatus(
  content: string,
  systemId: string | null | undefined,
  defaultsBySystemId: Map<string, { content: string }>,
): { hasDefault: boolean; isModified: boolean } {
  if (!systemId) return { hasDefault: false, isModified: false };
  const def = defaultsBySystemId.get(systemId);
  if (!def) return { hasDefault: false, isModified: false };
  return {
    hasDefault: true,
    isModified: content !== def.content,
  };
}
