import { createTypedHandler } from "../../../../ipc/handlers/base";
import { templateContracts } from "../../../../ipc/types/templates";
import log from "electron-log";
import { themesData } from "../../../../shared/themes";
import { getRemoteDb } from "../../../../db/remote";
import { apps, customThemes } from "../../../../db/remote-schema";
import { eq, sql } from "drizzle-orm";
import { readSettings } from "../../../../main/settings";

const logger = log.scope("themes_handlers");

export function registerThemesHandlers() {
  // Get built-in themes
  createTypedHandler(templateContracts.getThemes, async () => {
    return themesData;
  });

  // Set app theme (built-in or custom theme ID)
  createTypedHandler(templateContracts.setAppTheme, async (_, params) => {
      const { appId, themeId } = params;
      if (!themeId) {
        await getRemoteDb()
          .update(apps)
          .set({ themeId: sql`NULL` })
          .where(eq(apps.id, appId));
      } else {
        await getRemoteDb().update(apps).set({ themeId }).where(eq(apps.id, appId));
      }
  });

  // Get app theme
  createTypedHandler(templateContracts.getAppTheme, async (_, params) => {
      const app = await getRemoteDb().query.apps.findFirst({
        where: eq(apps.id, params.appId),
        columns: { themeId: true },
      });
      return app?.themeId ?? null;
  });

  // Get all custom themes
  createTypedHandler(templateContracts.getCustomThemes, async () => {
    const themes = await getRemoteDb().query.customThemes.findMany({
      orderBy: (themes, { desc }) => [desc(themes.createdAt)],
    });

    return themes.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      prompt: t.prompt,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }));
  });

  // Create custom theme
  createTypedHandler(templateContracts.createCustomTheme, async (_, params) => {
      const trimmedName = params.name.trim();
      const trimmedDescription = params.description?.trim();
      const trimmedPrompt = params.prompt.trim();

      if (!trimmedName) {
        throw new Error("Theme name is required");
      }
      if (trimmedName.length > 100) {
        throw new Error("Theme name must be less than 100 characters");
      }
      if (trimmedDescription && trimmedDescription.length > 500) {
        throw new Error("Theme description must be less than 500 characters");
      }
      if (!trimmedPrompt) {
        throw new Error("Theme prompt is required");
      }
      if (trimmedPrompt.length > 50000) {
        throw new Error("Theme prompt must be less than 50,000 characters");
      }

      const existingTheme = await getRemoteDb().query.customThemes.findFirst({
        where: sql`LOWER(${customThemes.name}) = LOWER(${trimmedName})`,
      });

      if (existingTheme) {
        throw new Error(
          `A theme named "${trimmedName}" already exists. Please choose a different name.`,
        );
      }

      const settings = readSettings();
      const result = await getRemoteDb()
        .insert(customThemes)
        .values({
          userId: settings.userId || "",
          name: trimmedName,
          description: trimmedDescription || null,
          prompt: trimmedPrompt,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      const theme = result[0];
      return {
        id: theme.id,
        name: theme.name,
        description: theme.description,
        prompt: theme.prompt,
        createdAt: theme.createdAt,
        updatedAt: theme.updatedAt,
      };
  });

  // Update custom theme
  createTypedHandler(templateContracts.updateCustomTheme, async (_, params) => {
      const updateData: Partial<{
        name: string;
        description: string | null;
        prompt: string;
        updatedAt: Date;
      }> = {
        updatedAt: new Date(),
      };

      const currentTheme = await getRemoteDb().query.customThemes.findFirst({
        where: eq(customThemes.id, params.id),
      });

      if (!currentTheme) {
        throw new Error("Theme not found");
      }

      if (params.name !== undefined) {
        const trimmedName = params.name.trim();
        if (!trimmedName) {
          throw new Error("Theme name is required");
        }
        if (trimmedName.length > 100) {
          throw new Error("Theme name must be less than 100 characters");
        }

        const existingTheme = await getRemoteDb().query.customThemes.findFirst({
          where: sql`LOWER(${customThemes.name}) = LOWER(${trimmedName}) AND ${customThemes.id} != ${params.id}`,
        });

        if (existingTheme) {
          throw new Error(
            `A theme named "${trimmedName}" already exists. Please choose a different name.`,
          );
        }

        updateData.name = trimmedName;
      }

      if (params.description !== undefined) {
        const trimmedDescription = params.description.trim();
        if (trimmedDescription.length > 500) {
          throw new Error("Theme description must be less than 500 characters");
        }
        updateData.description = trimmedDescription || null;
      }

      if (params.prompt !== undefined) {
        const trimmedPrompt = params.prompt.trim();
        if (!trimmedPrompt) {
          throw new Error("Theme prompt is required");
        }
        if (trimmedPrompt.length > 50000) {
          throw new Error("Theme prompt must be less than 50,000 characters");
        }
        updateData.prompt = trimmedPrompt;
      }

      const result = await getRemoteDb()
        .update(customThemes)
        .set(updateData)
        .where(eq(customThemes.id, params.id))
        .returning();

      const theme = result[0];
      if (!theme) {
        throw new Error("Theme not found");
      }

      return {
        id: theme.id,
        name: theme.name,
        description: theme.description,
        prompt: theme.prompt,
        createdAt: theme.createdAt,
        updatedAt: theme.updatedAt,
      };
  });

  // Delete custom theme
  createTypedHandler(templateContracts.deleteCustomTheme, async (_, params) => {
      await getRemoteDb().delete(customThemes).where(eq(customThemes.id, params.id));
  });
}
