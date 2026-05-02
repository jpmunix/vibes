import log from "electron-log";
import fetch from "node-fetch";
import { createTypedHandler } from "./base";
import { markdownShareContracts } from "../types/markdown-share";

const logger = log.scope("markdown_share");

const MD_API_BASE = "https://md.mnstatic.com/api/v1";

export function registerMarkdownShareHandlers() {
  createTypedHandler(
    markdownShareContracts.uploadDocument,
    async (_, params, context) => {
      if (!context.userId) throw new Error("Unauthorized");

      const { title, content, format } = params;

      logger.info(
        `Uploading document "${title}" (${format}) to md.mnstatic.com`,
      );

      const response = await fetch(`${MD_API_BASE}/documents`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${context.userId}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title, content, format }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        logger.error(
          `Upload failed: ${response.status} ${response.statusText} — ${errorText}`,
        );
        throw new Error(
          `Markdown share upload failed (${response.status}): ${errorText}`,
        );
      }

      const result = (await response.json()) as {
        data: {
          id: string;
          title: string;
          content: string;
          format: "md" | "txt";
          share_id: string;
          share_url: string;
          created_at: number;
        };
      };

      logger.info(
        `Document uploaded: ${result.data.share_url} (id: ${result.data.id})`,
      );

      return result;
    },
  );

  logger.debug("Registered markdown-share IPC handlers");
}
