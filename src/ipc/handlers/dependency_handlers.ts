import { getRemoteDb } from "../../db/remote";
import * as remoteSchema from "../../db/remote-schema";
import { eq, and } from "drizzle-orm";
import { getVibesAppPath } from "../../paths/paths";
import { executeAddDependency } from "../processors/executeAddDependency";
import { createTypedHandler } from "./base";
import { miscContracts } from "../types/misc";
import log from "electron-log";

const logger = log.scope("dependency_handlers");

export function registerDependencyHandlers() {
  createTypedHandler(miscContracts.addDependency, async (_event, { chatId, packages }, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    // Find the message from the database
    const foundMessages = await db.query.messages.findMany({
      where: and(eq(remoteSchema.messages.chatId, chatId), eq(remoteSchema.messages.userId, context.userId)),
    });

    // Find the chat first
    const chat = await db.query.chats.findFirst({
      where: and(eq(remoteSchema.chats.id, chatId), eq(remoteSchema.chats.userId, context.userId)),
    });

    if (!chat) {
      throw new Error(`Chat ${chatId} not found`);
    }

    // Get the app using the appId from the chat
    const app = await db.query.apps.findFirst({
      where: and(eq(remoteSchema.apps.id, chat.appId), eq(remoteSchema.apps.userId, context.userId)),
    });

    if (!app) {
      throw new Error(`App for chat ${chatId} not found`);
    }

    const message = [...foundMessages]
      .reverse()
      .find((m) =>
        m.content.includes(
          `<vibes-add-dependency packages="${packages.join(" ")}">`,
        ),
      );

    if (!message) {
      throw new Error(
        `Message with packages ${packages.join(", ")} not found`,
      );
    }

    executeAddDependency({
      packages,
      message,
      appPath: getVibesAppPath(app.path),
    });
  });
}
