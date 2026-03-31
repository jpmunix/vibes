import { getRemoteDb } from "../../db/remote";
import * as remoteSchema from "../../db/remote-schema";
import { desc, eq, and, gt } from "drizzle-orm";
import log from "electron-log";
import { DEFAULT_STANDARD_MODEL } from "../../lib/schemas";
import { createTypedHandler, HandlerContext } from "./base";
import { debateContracts } from "../types/debate";
import { openRouterCompletion } from "../utils/openrouter";
import { readSettings } from "../../main/settings";
import { getEffectivePrompt } from "../../prompts";

const logger = log.scope("debate_handlers");

export function registerDebateHandlers() {
  createTypedHandler(debateContracts.getDebates, async (_, __, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    const allDebates = await db.query.debates.findMany({
      where: eq(remoteSchema.debates.userId, context.userId),
      orderBy: [desc(remoteSchema.debates.updatedAt)],
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

  createTypedHandler(debateContracts.getDebate, async (_, debateId, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    const debate = await db.query.debates.findFirst({
      where: and(eq(remoteSchema.debates.id, debateId), eq(remoteSchema.debates.userId, context.userId)),
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
      messages: debate.messages.map((m) => {
        let injectedItems = [];
        try {
          injectedItems = m.injectedItems ? JSON.parse(m.injectedItems) : [];
        } catch (e) {
          logger.error("Error parsing injected items", e);
        }
        return {
          ...m,
          role: m.role as "user" | "assistant" | "system",
          injectedItems: Array.isArray(injectedItems) ? injectedItems : [],
          isSummary: !!m.isSummary,
        };
      }),
      tags: debate.tags.map((t) => t.tag),
    };
  });

  createTypedHandler(
    debateContracts.createDebate,
    async (_, { title, tagIds }, context) => {
      if (!context.userId) throw new Error("Unauthorized");
      const db = getRemoteDb();
      const [newDebate] = await db
        .insert(remoteSchema.debates)
        .values({
          userId: context.userId,
          title,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      if (tagIds && tagIds.length > 0) {
        for (const tagId of tagIds) {
          await db.insert(remoteSchema.debateToTags).values({
            userId: context.userId,
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
    async (_, { id, title, summary }, context) => {
      if (!context.userId) throw new Error("Unauthorized");
      const db = getRemoteDb();
      await db
        .update(remoteSchema.debates)
        .set({
          ...(title && { title }),
          ...(summary && { summary }),
          updatedAt: new Date(),
        })
        .where(and(eq(remoteSchema.debates.id, id), eq(remoteSchema.debates.userId, context.userId)));
    },
  );

  createTypedHandler(debateContracts.deleteDebate, async (_, debateId, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    await db.delete(remoteSchema.debates).where(and(eq(remoteSchema.debates.id, debateId), eq(remoteSchema.debates.userId, context.userId)));
  });

  createTypedHandler(debateContracts.deleteMessage, async (_, messageId, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    await db.delete(remoteSchema.debateMessages).where(and(eq(remoteSchema.debateMessages.id, messageId), eq(remoteSchema.debateMessages.userId, context.userId)));
  });

  createTypedHandler(debateContracts.deleteMessagesAfter, async (_, { debateId, messageId }, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    await db.delete(remoteSchema.debateMessages).where(
      and(
        eq(remoteSchema.debateMessages.debateId, debateId),
        eq(remoteSchema.debateMessages.userId, context.userId),
        gt(remoteSchema.debateMessages.id, messageId)
      )
    );
  });

  createTypedHandler(
    debateContracts.updateMessage,
    async (_, { id, content, injectedItems }, context) => {
      if (!context.userId) throw new Error("Unauthorized");
      const db = getRemoteDb();
      await db
        .update(remoteSchema.debateMessages)
        .set({
          content,
          ...(injectedItems && { injectedItems }),
        })
        .where(and(eq(remoteSchema.debateMessages.id, id), eq(remoteSchema.debateMessages.userId, context.userId)));
    },
  );

  createTypedHandler(debateContracts.getTags, async (_, __, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    return await db.select().from(remoteSchema.debateTags).where(eq(remoteSchema.debateTags.userId, context.userId));
  });

  createTypedHandler(debateContracts.createTag, async (_, { name, color }, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    const [tag] = await db
      .insert(remoteSchema.debateTags)
      .values({ userId: context.userId, name, color })
      .returning();
    return tag;
  });

  createTypedHandler(
    debateContracts.addTagToDebate,
    async (_, { debateId, tagId }, context) => {
      if (!context.userId) throw new Error("Unauthorized");
      const db = getRemoteDb();
      await db
        .insert(remoteSchema.debateToTags)
        .values({ userId: context.userId, debateId, tagId })
        .onConflictDoNothing();
    },
  );

  createTypedHandler(
    debateContracts.removeTagFromDebate,
    async (_, { debateId, tagId }, context) => {
      if (!context.userId) throw new Error("Unauthorized");
      const db = getRemoteDb();
      await db
        .delete(remoteSchema.debateToTags)
        .where(
          and(
            eq(remoteSchema.debateToTags.debateId, debateId),
            eq(remoteSchema.debateToTags.tagId, tagId),
            eq(remoteSchema.debateToTags.userId, context.userId),
          ),
        );
    },
  );

  createTypedHandler(debateContracts.deleteTag, async (_, { tagId }, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    // Delete the tag itself. Associations in debateToTags should be handled by 
    // ON DELETE CASCADE if defined, or we can delete them manually.
    await db.delete(remoteSchema.debateToTags).where(and(eq(remoteSchema.debateToTags.tagId, tagId), eq(remoteSchema.debateToTags.userId, context.userId)));
    await db.delete(remoteSchema.debateTags).where(and(eq(remoteSchema.debateTags.id, tagId), eq(remoteSchema.debateTags.userId, context.userId)));
  });

  createTypedHandler(debateContracts.summarizeDebate, async (_, debateId, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    const debate = await db.query.debates.findFirst({
      where: and(eq(remoteSchema.debates.id, debateId), eq(remoteSchema.debates.userId, context.userId)),
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
    let model = settings.standardModeModel || DEFAULT_STANDARD_MODEL;
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
        .insert(remoteSchema.debateMessages)
        .values({
          userId: context.userId,
          debateId,
          role: "assistant",
          content: summary,
          isSummary: 1,
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
