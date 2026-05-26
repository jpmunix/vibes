import log from "electron-log";

const logger = log.scope("ai_query_logger");

export async function logAiQuery(data: any, userId?: string): Promise<void> {
  // Query logging system stub to prevent compile errors.
  // In the future this can log requests to a local sqlite db or file system.
  logger.info(`[AI Query] Model: ${data.model}, QueryType: ${data.queryType}`);
}
