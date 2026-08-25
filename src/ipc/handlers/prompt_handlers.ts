import log from "electron-log";
import { getRemoteDb } from "@/db/remote";
import * as remoteSchema from "@/db/remote-schema";
import { eq, and } from "drizzle-orm";
import { createTypedHandler } from "./base";
import { promptContracts } from "../types/prompts";
import { DEFAULT_PROMPTS } from "@/prompts/defaults";
import {
  PROMPT_LABELS,
  PROMPT_DESCRIPTIONS,
  SYSTEM_PROMPT_GROUP_BY_ID,
  type PromptId,
} from "@/prompts/index";

const _logger = log.scope("prompt_handlers");

export function registerPromptHandlers() {
  createTypedHandler(promptContracts.list, async (_, __, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();

    // Modelo: los defaults de fábrica viven en el código (DEFAULT_PROMPTS).
    // La tabla `prompts` del usuario SOLO guarda overrides (filas con
    // systemId y content/enabled/scope distintos del default). Si el usuario
    // no ha tocado un prompt del sistema, NO existe fila — el handler
    // sintetiza la entrada con id:null para que la UI la muestre sin escribirla.
    const [userRows, categoryRows] = await Promise.all([
      db
        .select()
        .from(remoteSchema.prompts)
        .where(eq(remoteSchema.prompts.userId, context.userId)),
      db
        .select()
        .from(remoteSchema.promptsCategories)
        .where(eq(remoteSchema.promptsCategories.userId, context.userId)),
    ]);

    const overridesBySystemId = new Map<string, (typeof userRows)[number]>();
    const customRows: (typeof userRows)[number][] = [];
    for (const r of userRows) {
      if (r.systemId && r.systemId in DEFAULT_PROMPTS) {
        overridesBySystemId.set(r.systemId, r);
      } else if (!r.systemId) {
        customRows.push(r);
      }
      // Filas con systemId huérfano (no existe en DEFAULT_PROMPTS) se ignoran
      // en la vista de sistema.
    }

    // Auto-heal idempotente: las dos categorías del sistema siempre deben
    // existir para el usuario. Si no están (instalación nueva, o un DROP de
    // la tabla prompts_categories), se crean aquí al vuelo. Esto evita tener
    // que re-ejecutar scripts de seed manualmente.
    // i18n: la búsqueda es por name_key (clave estable, inmune al idioma),
    // no por nombre visible (que depende del locale del usuario).
    const findOrCreateCategory = async (
      nameKey: string,
      fallbackName: string,
      fallbackDescription: string,
      isSystem: boolean,
    ) => {
      const existing = categoryRows.find((c) => c.nameKey === nameKey);
      if (existing) return existing.id;
      // Fallback: installs previos a name_key pueden tener la fila sin key.
      const byName = categoryRows.find(
        (c) => c.name === fallbackName && c.nameKey == null,
      );
      if (byName) {
        await db
          .update(remoteSchema.promptsCategories)
          .set({ nameKey })
          .where(eq(remoteSchema.promptsCategories.id, byName.id));
        return byName.id;
      }
      const [created] = await db
        .insert(remoteSchema.promptsCategories)
        .values({
          userId: context.userId as string,
          name: fallbackName,
          nameKey,
          description: fallbackDescription,
          isSystem: isSystem ? 1 : 0,
        })
        .returning();
      return created?.id ?? null;
    };

    const systemCategoryId = await findOrCreateCategory(
      "systemPrompts",
      "Prompts del sistema",
      "Prompts de fábrica del sistema. Editables bajo tu criterio.",
      true,
    );
    // Card #195: la antigua categoría "revisar" (prompts que no llegan a
    // vibes-core) deja de existir: TODOS los prompts de sistema —incluidos
    // títulos, commits y memoria— caen en "Prompts del sistema" y se
    // agrupan por grupo (groupKey, metadato de código). La fila de la
    // categoría se elimina de la DB con el DML al cerrar la tarea.

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
      // Card #195: grupo de la jerarquía a 2 niveles (System prompts →
      // Core/Títulos y nombres/Git/Sistema de memoria/Procesamiento de
      // imágenes). Metadato de código (SYSTEM_PROMPT_GROUP_BY_ID); null para
      // prompts custom y para systemIds sin grupo (no debería ocurrir).
      groupKey: string | null;
      createdAt: Date | null;
      updatedAt: Date | null;
    }> = [];

    // 1) Para cada default del código, sintetizar una entrada (con o sin override).
    // Card #195: TODOS los prompts de sistema caen en el bucket "Prompts del
    // sistema" (systemCategoryId). La antigua distinción runtime vs. "review"
    // deja de existir como clasificación de UI: la estructura se rinde por
    // grupo (groupKey) y el grupo es metadato de código. El "revisar" de la
    // categoría se elimina de la base de datos al cerrar la tarea (DML).
    const groupKeyOf = (systemId: string | null): string | null =>
      systemId ? (SYSTEM_PROMPT_GROUP_BY_ID.get(systemId as PromptId) ?? null) : null;

    for (const [systemId, defaultContent] of Object.entries(DEFAULT_PROMPTS)) {
      const override = overridesBySystemId.get(systemId);
      if (override) {
        // Override del usuario: el contenido puede diferir; enabled siempre
        // true para los de sistema (los switches se quitaron — retroactivo via
        // harden en el map, no escribimos DB para evitar spam de writes).
        result.push({
          id: Number(override.id),
          categoryId:
            override.categoryId !== null ? Number(override.categoryId) : null,
          systemId,
          title: PROMPT_LABELS[systemId as keyof typeof PROMPT_LABELS] ?? systemId,
          description:
            PROMPT_DESCRIPTIONS[systemId as keyof typeof PROMPT_DESCRIPTIONS] ?? null,
          content: override.content,
          enabled: true,
          scope: override.scope ?? "all",
          hasDefault: true,
          isModified: override.content !== defaultContent,
          groupKey: groupKeyOf(systemId),
          createdAt: override.createdAt,
          updatedAt: override.updatedAt,
        });
      } else {
        // Sin override: leer del default del código directamente. id:null porque NO hay fila.
        // Card #195: todos al bucket "systemPrompts" (antes se dividía runtime vs. "review").
        result.push({
          id: null,
          categoryId: systemCategoryId ? Number(systemCategoryId) : null,
          systemId,
          title: PROMPT_LABELS[systemId as keyof typeof PROMPT_LABELS] ?? systemId,
          description:
            PROMPT_DESCRIPTIONS[systemId as keyof typeof PROMPT_DESCRIPTIONS] ?? null,
          content: defaultContent,
          enabled: true,
          scope: "all",
          hasDefault: true,
          isModified: false,
          groupKey: groupKeyOf(systemId),
          createdAt: null,
          updatedAt: null,
        });
      }
    }

    // 2) Prompts custom del usuario (sin systemId). No tienen default ni grupo.
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
        groupKey: null,
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
  // El default vive en el código (DEFAULT_PROMPTS). BORRA la fila override
  // del usuario: tras borrarla, el handler `list` sintetiza la entrada desde
  // DEFAULT_PROMPTS y el prompt vuelve a su valor de fábrica.
  createTypedHandler(
    promptContracts.restoreDefault,
    async (_, params, context) => {
      if (!context.userId) throw new Error("Unauthorized");
      const db = getRemoteDb();
      const { id, systemId } = params;
      if (!id || !systemId) throw new Error("id and systemId are required");

      if (!(systemId in DEFAULT_PROMPTS)) {
        throw new Error(`No default for systemId: ${systemId}`);
      }

      await db
        .delete(remoteSchema.prompts)
        .where(
          and(
            eq(remoteSchema.prompts.id, id),
            eq(remoteSchema.prompts.userId, context.userId),
            eq(remoteSchema.prompts.systemId, systemId),
          ),
        );
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
      nameKey: r.nameKey ?? null,
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
        nameKey: row.nameKey ?? null,
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
 * Los defaults viven en DEFAULT_PROMPTS (código); el map es el override del usuario.
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
