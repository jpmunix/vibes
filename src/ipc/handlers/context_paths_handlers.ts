import { getRemoteDb } from "@/db/remote";
import * as remoteSchema from "@/db/remote-schema";
import { eq } from "drizzle-orm";
import { createTypedHandler } from "./base";
import { contextContracts } from "../types/context";
import type { ContextPathResults } from "@/ipc/types/context";
import { estimateTokens } from "../utils/token_utils";
import log from "electron-log";
import { getVibesAppPath } from "@/paths/paths";
import { extractCodebase } from "@/utils/codebase";
import { validateChatContext } from "../utils/context_paths_utils";

const logger = log.scope("context_paths_handlers");

export function registerContextPathsHandlers() {
  createTypedHandler(contextContracts.getContextPaths, async (_, { appId }) => {
    const app = await getRemoteDb().query.apps.findFirst({
      where: eq(remoteSchema.apps.id, appId),
    });

    if (!app) {
      throw new Error("App not found");
    }

    if (!app.path) {
      throw new Error("App path not set");
    }
    const appPath = getVibesAppPath(app.path);

    const results: ContextPathResults = {
      contextPaths: [],
      smartContextAutoIncludes: [],
      excludePaths: [],
    };
    const { contextPaths, smartContextAutoIncludes, excludePaths } =
      validateChatContext(app.chatContext);
    for (const contextPath of contextPaths) {
      const { formattedOutput, files } = await extractCodebase({
        appPath,
        chatContext: {
          contextPaths: [contextPath],
          smartContextAutoIncludes: [],
        },
      });
      const totalTokens = estimateTokens(formattedOutput);

      results.contextPaths.push({
        ...contextPath,
        files: files.length,
        tokens: totalTokens,
      });
    }

    for (const contextPath of smartContextAutoIncludes) {
      const { formattedOutput, files } = await extractCodebase({
        appPath,
        chatContext: {
          contextPaths: [contextPath],
          smartContextAutoIncludes: [],
        },
      });
      const totalTokens = estimateTokens(formattedOutput);

      results.smartContextAutoIncludes.push({
        ...contextPath,
        files: files.length,
        tokens: totalTokens,
      });
    }

    for (const excludePath of excludePaths || []) {
      const { formattedOutput, files } = await extractCodebase({
        appPath,
        chatContext: {
          contextPaths: [excludePath],
          smartContextAutoIncludes: [],
        },
      });
      const totalTokens = estimateTokens(formattedOutput);

      results.excludePaths.push({
        ...excludePath,
        files: files.length,
        tokens: totalTokens,
      });
    }
    return results;
  });

  createTypedHandler(contextContracts.setContextPaths, async (_, { appId, chatContext }) => {
    await getRemoteDb().update(remoteSchema.apps).set({ chatContext }).where(eq(remoteSchema.apps.id, appId));
  });
}
