import { getRemoteDb } from "../../db/remote";
import * as remoteSchema from "../../db/remote-schema";
import { eq, and } from "drizzle-orm";
import { generateProblemReport } from "../processors/tsc";
import { getDyadAppPath } from "@/paths/paths";
import log from "electron-log";
import { createTypedHandler, HandlerContext } from "./base";
import { miscContracts } from "../types/misc";

const logger = log.scope("problems_handlers");

export function registerProblemsHandlers() {
  createTypedHandler(miscContracts.checkProblems, async (_, params, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    try {
      // Get the app to find its path
      const app = await db.query.apps.findFirst({
        where: and(eq(remoteSchema.apps.id, params.appId), eq(remoteSchema.apps.userId, context.userId)),
      });

      if (!app) {
        throw new Error(`App not found: ${params.appId}`);
      }

      const appPath = getDyadAppPath(app.path);

      // Call autofix with empty full response to just run TypeScript checking
      const problemReport = await generateProblemReport({
        fullResponse: "",
        appPath,
      });

      return problemReport;
    } catch (error) {
      logger.error("Error checking problems:", error);
      throw error;
    }
  });
}
