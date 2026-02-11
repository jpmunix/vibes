import { db } from "../../db";
import {
  debates,
  debateMessages,
  debateTags,
  debateToTags,
} from "../../db/schema";
import { desc, eq, and, gt } from "drizzle-orm";
import log from "electron-log";
import { createTypedHandler } from "./base";
import { debateContracts } from "../types/debate";
import { openRouterCompletion } from "../utils/openrouter";
import { readSettings } from "../../main/settings";
import { getEffectivePrompt } from "../../prompts";

const logger = log.scope("debate_handlers");

export function registerDebateHandlers() {
  createTypedHandler(debateContracts.getDebates, async () => {
    const allDebates = await db.query.debates.findMany({
      orderBy: [desc(debates.updatedAt)],
      with: {
        tags: {
          with: {
            tag: true,
          },
        },
      },
    });

    return allDebates.map((d) => ({
      ...d,
      tags: d.tags.map((t) => t.tag),
    }));
  });

  createTypedHandler(debateContracts.getDebate, async (_, debateId) => {
    const debate = await db.query.debates.findFirst({
      where: eq(debates.id, debateId),
      with: {
        messages: {
          orderBy: (messages, { asc }) => [asc(messages.createdAt)],
        },
        tags: {
          with: {
            tag: true,
          },
        },
      },
    });

    if (!debate) {
      throw new Error("Debate not found");
    }

    return {
      ...debate,
      messages: debate.messages.map((m) => ({
        ...m,
        role: m.role as "user" | "assistant" | "system",
        injectedItems: m.injectedItems as any,
        isSummary: m.isSummary ?? undefined,
      })),
      tags: debate.tags.map((t) => t.tag),
    };
  });

  createTypedHandler(
    debateContracts.createDebate,
    async (_, { title, tagIds }) => {
      const [newDebate] = await db
        .insert(debates)
        .values({ title })
        .returning();

      if (tagIds && tagIds.length > 0) {
        for (const tagId of tagIds) {
          await db.insert(debateToTags).values({
            debateId: newDebate.id,
            tagId,
          });
        }
      }

      return newDebate.id;
    },
  );

  createTypedHandler(
    debateContracts.updateDebate,
    async (_, { id, title, summary }) => {
      await db
        .update(debates)
        .set({
          ...(title && { title }),
          ...(summary && { summary }),
          updatedAt: new Date(),
        })
        .where(eq(debates.id, id));
    },
  );

  createTypedHandler(debateContracts.deleteDebate, async (_, debateId) => {
    await db.delete(debates).where(eq(debates.id, debateId));
  });

  createTypedHandler(debateContracts.deleteMessage, async (_, messageId) => {
    await db.delete(debateMessages).where(eq(debateMessages.id, messageId));
  });

  createTypedHandler(debateContracts.deleteMessagesAfter, async (_, { debateId, messageId }) => {
    await db.delete(debateMessages).where(
      and(
        eq(debateMessages.debateId, debateId),
        gt(debateMessages.id, messageId)
      )
    );
  });

  createTypedHandler(
    debateContracts.updateMessage,
    async (_, { id, content, injectedItems }) => {
      await db
        .update(debateMessages)
        .set({
          content,
          ...(injectedItems && { injectedItems }),
        })
        .where(eq(debateMessages.id, id));
    },
  );

  createTypedHandler(debateContracts.getTags, async () => {
    return await db.select().from(debateTags);
  });

  createTypedHandler(debateContracts.createTag, async (_, { name, color }) => {
    const [tag] = await db
      .insert(debateTags)
      .values({ name, color })
      .returning();
    return tag;
  });

  createTypedHandler(
    debateContracts.addTagToDebate,
    async (_, { debateId, tagId }) => {
      await db
        .insert(debateToTags)
        .values({ debateId, tagId })
        .onConflictDoNothing();
    },
  );

  createTypedHandler(
    debateContracts.removeTagFromDebate,
    async (_, { debateId, tagId }) => {
      await db
        .delete(debateToTags)
        .where(
          and(
            eq(debateToTags.debateId, debateId),
            eq(debateToTags.tagId, tagId),
          ),
        );
    },
  );

  createTypedHandler(debateContracts.deleteTag, async (_, { tagId }) => {
    // Delete the tag itself. Associations in debateToTags should be handled by 
    // ON DELETE CASCADE if defined, or we can delete them manually.
    await db.delete(debateToTags).where(eq(debateToTags.tagId, tagId));
    await db.delete(debateTags).where(eq(debateTags.id, tagId));
  });

  createTypedHandler(debateContracts.summarizeDebate, async (_, debateId) => {
    const debate = await db.query.debates.findFirst({
      where: eq(debates.id, debateId),
      with: {
        messages: {
          orderBy: (messages, { asc }) => [asc(messages.createdAt)],
        },
      },
    });

    if (!debate || debate.messages.length === 0) {
      return "No hay contenido suficiente para resumir.";
    }

    const settings = readSettings();
    let model = settings.summaryModel || "openai/gpt-5-mini";
    if (model === "SAME_AS_CHAT") {
      model = settings.selectedModel.name;
    }

    const content = debate.messages
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n\n");

    try {
      const data = await openRouterCompletion({
        model,
        title: "debate-summary",
        messages: [
          {
            role: "system",
            content: getEffectivePrompt("debate_summary_system", settings),
          },
          { role: "user", content },
        ],
      });
      const summary =
        data?.choices?.[0]?.message?.content?.trim() ||
        "No se pudo generar el resumen.";

      // Insert summary as a message
      const [message] = await db
        .insert(debateMessages)
        .values({
          debateId,
          role: "assistant",
          content: summary,
          isSummary: true,
          createdAt: new Date(),
        })
        .returning();

      // We no longer update the debate summary column
      // await db.update(debates).set({ summary }).where(eq(debates.id, debateId));

      return summary;
    } catch (e) {
      logger.error("Error summarizing debate", e);
      throw e; // Let frontend handle error
    }
  });

  logger.debug("Registered debate IPC handlers");
}
