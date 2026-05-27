/**
 * AI-powered commit message generator for auto-commits.
 * Uses the "standard mode" model (lightweight) to create
 * descriptive commit messages from file diffs.
 */
import log from "electron-log";
import { readSettings } from "@/main/settings";
import {
  openRouterCompletion,
  hasOpenRouterApiKey,
} from "@/ipc/utils/openrouter";
import { gitDiffFile } from "@/ipc/utils/git_utils";
import { getSystemPrompt } from "@/ipc/utils/prompt_utils";
import { DEFAULT_STANDARD_MODEL } from "@/lib/schemas";

const logger = log.scope("auto_commit_message");

/**
 * Generate a descriptive commit message using AI (standard mode model).
 *
 * @param appPath - absolute path to the app's git repo
 * @param writtenFiles - files that were written/modified
 * @param deletedFiles - files that were deleted
 * @param renamedFiles - files that were renamed (destination paths)
 * @param fallbackMessage - message to use if AI generation fails
 * @returns a short, descriptive commit message in Spanish
 */
export async function generateAutoCommitMessage({
  appPath,
  writtenFiles = [],
  deletedFiles = [],
  renamedFiles = [],
  fallbackMessage,
}: {
  appPath: string;
  writtenFiles?: string[];
  deletedFiles?: string[];
  renamedFiles?: string[];
  fallbackMessage: string;
}): Promise<string> {
  try {
    if (!hasOpenRouterApiKey()) {
      return fallbackMessage;
    }

    const settings = readSettings();
    const model = settings.executorModel || DEFAULT_STANDARD_MODEL;

    // Build a summary of changes with limited diffs
    const allFiles = [
      ...writtenFiles.map((f) => ({ path: f, status: "modified" as const })),
      ...deletedFiles.map((f) => ({ path: f, status: "deleted" as const })),
      ...renamedFiles.map((f) => ({ path: f, status: "renamed" as const })),
    ];

    if (allFiles.length === 0) {
      return fallbackMessage;
    }

    // Get diffs for up to 30 files (aligned with streaming handler)
    const filesToAnalyze = allFiles.slice(0, 30);
    const diffsPromises = filesToAnalyze.map(async (file) => {
      if (file.status === "deleted") {
        return `File: ${file.path} (eliminado)`;
      }
      try {
        // Try unstaged diff first
        let { diff } = await gitDiffFile({
          path: appPath,
          filepath: file.path,
        });
        // If empty (already staged), try cached/staged diff
        if (!diff || diff.trim().length === 0) {
          const cachedResult = await gitDiffFile({
            path: appPath,
            filepath: file.path,
            cached: true,
          });
          diff = cachedResult.diff;
        }
        if (!diff || diff.trim().length === 0) {
          return `File: ${file.path} (${file.status})`;
        }
        // Enough context for the AI to understand what changed
        return `File: ${file.path} (${file.status})\n${diff.slice(0, 3000)}`;
      } catch {
        return `File: ${file.path} (${file.status})`;
      }
    });

    const diffs = await Promise.all(diffsPromises);
    const diffsContext = diffs.join("\n\n");

    // Use the editable prompt from settings
    const systemPrompt = await getSystemPrompt("auto_commit_message", settings.userId);

    // Separate system/user messages for better model comprehension
    // (aligned with the streaming handler in github_handlers.ts)
    const data = await openRouterCompletion({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Cambios:\n${diffsContext}` },
      ],
      temperature: 0.7,
      max_tokens: 10000, // reasoning models consume tokens for their thinking chain first; give plenty of room
      title: "Vibes - Auto Commit Message",
    });

    let generated =
      data.choices?.[0]?.message?.content?.trim() || fallbackMessage;

    // Strip surrounding quotes if the model wrapped the message
    generated = generated.replace(/^["'`]+|["'`]+$/g, "");

    // Sanity check: if the generated message is too long or empty, use fallback
    if (!generated || generated.length > 1500) {
      return fallbackMessage;
    }

    return generated;
  } catch (error) {
    logger.warn("Failed to generate AI commit message, using fallback:", error);
    return fallbackMessage;
  }
}
