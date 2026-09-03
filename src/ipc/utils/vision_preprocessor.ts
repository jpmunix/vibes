import { ModelMessage, generateText } from "ai";
import { UserSettings } from "../../lib/schemas";
import { parseModelReference } from "./model_reference";
import { getModelClient } from "./get_model_client";
import { getAiHeaders } from "./provider_options";
import * as crypto from "crypto";
import { getRemoteDb } from "../../db/remote";
import * as remoteSchema from "../../db/remote-schema";
import { eq, and } from "drizzle-orm";
import log from "electron-log";
import { getSystemPrompt } from "./prompt_utils";

const logger = log.scope("vision-preprocessor");

/**
 * Determine if a target model natively supports vision.
 */
export function modelSupportsVision(modelId: string): boolean {
  const lower = modelId.toLowerCase();
  // Known vision models
  if (
    lower.includes("vision") ||
    lower.includes("gpt-4o") ||
    lower.includes("gpt-4-turbo") ||
    lower.includes("gemini") ||
    lower.includes("claude-3-5-sonnet") ||
    lower.includes("claude-3-opus") ||
    lower.includes("pixtral")
  ) {
    return true;
  }
  return false;
}

/**
 * Check if any message in the array contains an image.
 */
export function messagesHaveImages(messages: ModelMessage[]): boolean {
  for (const msg of messages) {
    if (typeof msg.content === "string") continue;
    if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part.type === "image") return true;
      }
    }
  }
  return false;
}

/**
 * Extract all user text content as a single string (for the vision model's context).
 */
export function extractUserPrompt(messages: ModelMessage[]): string {
  const userMessages = messages.filter((m) => m.role === "user");
  const parts: string[] = [];
  for (const msg of userMessages) {
    if (typeof msg.content === "string") {
      parts.push(msg.content);
    } else if (Array.isArray(msg.content)) {
      for (const p of msg.content) {
        if (p.type === "text" && p.text) {
          parts.push(p.text);
        }
      }
    }
  }
  return parts.join("\n").trim();
}

/**
 * Send images to a vision model, get a textual description, then
 * return new messages where images are replaced by the description.
 */
export async function preprocessImages(
  messages: ModelMessage[],
  userId: string,
  settings: UserSettings,
): Promise<{
  messages: ModelMessage[];
  visionDescription?: string;
  visionModelUsed?: string;
}> {
  if (settings.visionPreprocessorEnabled === false) {
    return { messages }; // preprocessor explicitly disabled
  }

  const visionModelStr = settings.visionPreprocessorModel || "openrouter::google/gemini-2.5-pro";
  // Card #195: el prompt de visión es un prompt de sistema.
  // Prioridad: override en DB > override legado en settings > default del
  // código. El override legado (editado en la vieja UI VisionPromptGroup) se
  // migra de forma perezosa e idempotente a una fila de DB la primera vez que
  // hay un chat con imágenes: desde entonces la nueva UI lo gestiona (edit +
  // restaurar) y el value legado deja de importar. El contenido resultante
  // es idéntico al de antes, así el hash del cache de imágenes no cambia.
  const legacyVisionOverride = settings.visionPreprocessorPrompt?.trim();
  const db = getRemoteDb();
  let promptTemplate = await getSystemPrompt("vision", userId);
  if (legacyVisionOverride) {
    const existingRows = await db
      .select({ id: remoteSchema.prompts.id })
      .from(remoteSchema.prompts)
      .where(
        and(
          eq(remoteSchema.prompts.userId, userId),
          eq(remoteSchema.prompts.systemId, "vision"),
        ),
      )
      .limit(1);
    if (existingRows.length === 0) {
      promptTemplate = legacyVisionOverride;
      try {
        await db.insert(remoteSchema.prompts).values({
          userId,
          systemId: "vision",
          title: "Prompt de visión",
          content: legacyVisionOverride,
          enabled: 1,
          scope: "all",
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      } catch (e) {
        logger.error("Error migrating legacy vision prompt override to DB", e);
      }
    }
  }

  const shortName = visionModelStr.split("::").pop() || visionModelStr;
  const prefix = `🖼️ [Imagen analizada por ${shortName}]:\n---\n`;
  const suffix = "\n---";

  let finalDescription = "";
  const newMessages: ModelMessage[] = [];

  const userPrompt = extractUserPrompt(messages);
  const fullPrompt = `${promptTemplate}\n\n---\n\nIntención/Prompt original del usuario:\n${userPrompt || "(no se proporcionó texto)"}\n\n---\n\nAnaliza la(s) imagen(es) adjunta(s) según las directrices anteriores.`;

  for (const msg of messages) {
    if (!Array.isArray(msg.content)) {
      newMessages.push(msg);
      continue;
    }

    const imageParts = msg.content.filter((p) => p.type === "image");
    if (imageParts.length === 0) {
      newMessages.push(msg);
      continue;
    }

    const textParts = msg.content
      .filter((p) => p.type === "text")
      .map((p: any) => p.text || "")
      .join("\n");

    // Create a hash of all images in this message + the prompt
    // This ensures that changing the prompt or the question regenerates the description
    const hashPayload =
      fullPrompt +
      "|" +
      imageParts
        .map((p: any) => {
          if (p.image instanceof Uint8Array)
            return Buffer.from(p.image).toString("base64");
          if (typeof p.image === "string") return p.image;
          if (p.image instanceof URL) return p.image.toString();
          return "";
        })
        .join("|");

    const msgHash = crypto.createHash("sha256").update(hashPayload).digest("hex");

    // Check Cache
    let description = "";
    try {
      const cached = await db
        .select({ description: remoteSchema.visionCache.description })
        .from(remoteSchema.visionCache)
        .where(
          and(
            eq(remoteSchema.visionCache.userId, userId),
            eq(remoteSchema.visionCache.hash, msgHash),
          ),
        )
        .limit(1);

      if (cached && cached.length > 0) {
        description = cached[0].description;
        logger.info(`🖼️  Vision preprocessor: Cache hit for image(s) [${msgHash}]`);
      }
    } catch (e) {
      logger.error("Error checking vision cache", e);
    }

    // Call Vision Model
    if (!description) {
      logger.info(`🖼️  Vision preprocessor: sending ${imageParts.length} image(s) to ${visionModelStr}`);
      
      const parsedRef = parseModelReference(visionModelStr);
      if (!parsedRef) {
        throw new Error(`Invalid vision model reference: ${visionModelStr}`);
      }
      const { modelClient } = await getModelClient(
        { provider: parsedRef.provider, name: parsedRef.model },
        settings,
      );

      try {
        const result = await generateText({
          model: modelClient.model,
          headers: getAiHeaders({ builtinProviderId: modelClient.builtinProviderId }),
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: fullPrompt },
                ...imageParts,
              ],
            },
          ],
          maxOutputTokens: 4096,
        });

        description = result.text;
        
        if (!description || description.trim().length === 0) {
          throw new Error("Vision preprocessor returned empty description");
        }

        // Save to cache
        try {
          await db.insert(remoteSchema.visionCache).values({
            userId: userId,
            hash: msgHash,
            description: description,
            createdAt: new Date(),
          });
        } catch (e) {
          logger.error("Error saving vision cache", e);
        }

        finalDescription = description;
        logger.info(`📝 [VISION DESCRIPTION]:\n${description.substring(0, 100)}...`);
      } catch (err: any) {
        logger.error("Vision preprocessor failed", err);
        // If it fails, we fall back to pushing the original image parts
        newMessages.push(msg);
        continue;
      }
    }

    // Replace images with text description
    const newContent = textParts
      ? `${textParts}\n\n${prefix}${description}${suffix}`
      : `${prefix}${description}${suffix}`;

    const newMsg: ModelMessage = {
      ...msg,
      role: "user",
      content: newContent,
    };
    newMessages.push(newMsg);
  }

  return {
    messages: newMessages,
    visionDescription: finalDescription,
    visionModelUsed: visionModelStr,
  };
}
