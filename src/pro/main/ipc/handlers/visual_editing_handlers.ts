import { ipcMain } from "electron";
import fs from "node:fs";
import { promises as fsPromises } from "node:fs";
import path from "path";
import { getRemoteDb } from "../../../../db/remote";
import * as remoteSchema from "../../../../db/remote-schema";
import { and, eq } from "drizzle-orm";
import { createTypedHandler } from "../../../../ipc/handlers/base";
import { visualEditingContracts } from "../../../../ipc/types/visual-editing";
import { getVibesAppPath } from "../../../../paths/paths";
import {
  stylesToTailwind,
  extractClassPrefixes,
} from "../../../../utils/style-utils";
import { gitAdd, gitCommit } from "../../../../ipc/utils/git_utils";
import { generateAutoCommitMessage } from "../../../../ipc/utils/auto_commit_message";
import { safeJoin } from "@/ipc/utils/path_utils";
import {
  AnalyseComponentParams,
  ApplyVisualEditingChangesParams,
} from "@/ipc/types";
import { ReplaceIconParams } from "@/ipc/types/visual-editing";
import {
  transformContent,
  analyzeComponent,
  replaceIconComponent,
} from "../../utils/visual_editing_utils";
import { normalizePath } from "../../../../../shared/normalizePath";
import { generateText } from "ai";
import { getModelClient } from "../../../../ipc/utils/get_model_client";
import { readSettings } from "../../../../main/settings";
import { logAiQuery } from "../../../../ipc/utils/ai_query_logger";
import { getEffectivePrompt } from "../../../../prompts";
import log from "electron-log";

const logger = log.scope("visual_editing_handlers");

export function registerVisualEditingHandlers() {
  createTypedHandler(
    visualEditingContracts.applyChanges,
    async (_event, params, context) => {
      if (!context.userId) throw new Error("Unauthorized");
      const db = getRemoteDb();
      const { appId, changes } = params;
      try {
        if (changes.length === 0) return;

        // Get the app to find its path
        const app = await db.query.apps.findFirst({
          where: and(
            eq(remoteSchema.apps.id, appId),
            eq(remoteSchema.apps.userId, context.userId),
          ),
        });

        if (!app) {
          throw new Error(`App not found: ${appId}`);
        }

        const appPath = getVibesAppPath(app.path);
        const fileChanges = new Map<
          string,
          Map<
            number,
            { classes: string[]; prefixes: string[]; textContent?: string }
          >
        >();

        // Group changes by file and line
        for (const change of changes) {
          logger.debug('[visual-editing] Processing change:', {
            componentId: change.componentId,
            file: change.relativePath,
            line: change.lineNumber,
            styles: change.styles,
          });

          if (!fileChanges.has(change.relativePath)) {
            fileChanges.set(change.relativePath, new Map());
          }
          const tailwindClasses = stylesToTailwind(change.styles);
          const changePrefixes = extractClassPrefixes(tailwindClasses);

          logger.debug('[visual-editing] Generated Tailwind classes:', tailwindClasses);
          logger.debug('[visual-editing] Class prefixes:', changePrefixes);

          fileChanges.get(change.relativePath)!.set(change.lineNumber, {
            classes: tailwindClasses,
            prefixes: changePrefixes,
            ...(change.textContent !== undefined && {
              textContent: change.textContent,
            }),
          });
        }

        // Apply changes to each file
        const modifiedFiles: string[] = [];
        for (const [relativePath, lineChanges] of fileChanges) {
          const normalizedRelativePath = normalizePath(relativePath);
          const filePath = safeJoin(appPath, normalizedRelativePath);
          const content = await fsPromises.readFile(filePath, "utf-8");
          const transformedContent = transformContent(content, lineChanges);

          logger.debug('[visual-editing] Content changed:', transformedContent !== content);

          // Only write if content actually changed
          if (transformedContent !== content) {
            await fsPromises.writeFile(filePath, transformedContent, "utf-8");
            modifiedFiles.push(normalizedRelativePath);
          }
        }

        // Commit all changes in a single commit
        if (modifiedFiles.length > 0 && fs.existsSync(path.join(appPath, ".git"))) {
          for (const filepath of modifiedFiles) {
            await gitAdd({
              path: appPath,
              filepath,
            });
          }

          const commitMsg = await generateAutoCommitMessage({
            appPath,
            writtenFiles: modifiedFiles,
            fallbackMessage: `Visual editing: Updated ${modifiedFiles.length} file${modifiedFiles.length > 1 ? "s" : ""}`,
          });

          await gitCommit({
            path: appPath,
            message: commitMsg,
          });
        }
      } catch (error) {
        throw new Error(`Failed to apply visual editing changes: ${error}`);
      }
    },
  );

  createTypedHandler(
    visualEditingContracts.analyzeComponent,
    async (_event, params, context) => {
      if (!context.userId) throw new Error("Unauthorized");
      const db = getRemoteDb();
      const { appId, componentId } = params;
      try {
        const [filePath, lineStr] = componentId.split(":");
        const line = parseInt(lineStr, 10);

        if (!filePath || isNaN(line)) {
          return {
            isDynamic: false,
            hasStaticText: false,
            elementType: "unknown" as const,
          };
        }

        // Get the app to find its path
        const app = await db.query.apps.findFirst({
          where: and(
            eq(remoteSchema.apps.id, appId),
            eq(remoteSchema.apps.userId, context.userId),
          ),
        });

        if (!app) {
          throw new Error(`App not found: ${appId}`);
        }

        const appPath = getVibesAppPath(app.path);
        const fullPath = safeJoin(appPath, filePath);
        const content = await fsPromises.readFile(fullPath, "utf-8");
        return analyzeComponent(content, line);
      } catch (error) {
        logger.error("Failed to analyze component:", error);
        return {
          isDynamic: false,
          hasStaticText: false,
          elementType: "unknown" as const,
        };
      }
    },
  );

  createTypedHandler(
    visualEditingContracts.replaceIcon,
    async (_event, params, context) => {
      if (!context.userId) throw new Error("Unauthorized");
      const db = getRemoteDb();
      const { appId, componentId, newIconName } = params;
      try {
        const [filePath, lineStr] = componentId.split(":");
        const line = parseInt(lineStr, 10);

        if (!filePath || isNaN(line)) {
          throw new Error("Invalid component ID format");
        }

        // Get the app to find its path
        const app = await db.query.apps.findFirst({
          where: and(
            eq(remoteSchema.apps.id, appId),
            eq(remoteSchema.apps.userId, context.userId),
          ),
        });

        if (!app) {
          throw new Error(`App not found: ${appId}`);
        }

        const appPath = getVibesAppPath(app.path);
        const fullPath = safeJoin(appPath, filePath);
        const content = await fsPromises.readFile(fullPath, "utf-8");

        const newContent = replaceIconComponent(content, line, newIconName);

        if (newContent !== content) {
          await fsPromises.writeFile(fullPath, newContent, "utf-8");

          await gitAdd({ path: appPath, filepath: filePath });
          const commitMsg = await generateAutoCommitMessage({
            appPath,
            writtenFiles: [filePath],
            fallbackMessage: `Visual editing: Changed icon to ${newIconName} in ${filePath}`,
          });

          await gitCommit({
            path: appPath,
            message: commitMsg,
          });
        }
      } catch (error) {
        logger.error("Failed to replace icon:", error);
        throw error;
      }
    },
  );

  createTypedHandler(
    visualEditingContracts.quickEdit,
    async (_event, params, context) => {
      const {
        appId,
        componentId,
        componentName,
        relativePath,
        lineNumber,
        prompt,
        currentStyles,
        currentTextContent,
      } = params;

      try {
        // Get settings to access the selected model
        const settings = await readSettings();
        const selectedModel = settings.selectedModel;

        if (!selectedModel) {
          return {
            error: "No hay modelo de IA seleccionado",
          };
        }

        // Get base prompt from settings
        const basePrompt = getEffectivePrompt("quick_edit_system", settings);

        // Build system prompt for style/content modifications
        const systemPrompt = `${basePrompt}

El usuario está editando un componente llamado "${componentName}".

El componente actual tiene estos estilos: ${JSON.stringify(currentStyles || {})}
${currentTextContent ? `
Contenido de texto actual: "${currentTextContent}"` : ""}

El JSON debe tener esta estructura:
{
  "textContent": "nuevo texto" (opcional, solo si el usuario quiere cambiar el texto),
  "styles": {
    "backgroundColor": "color o clase" (opcional),
    "text": {
      "color": "color o clase" (opcional),
      "fontSize": "tamaño o clase" (opcional),
      "fontWeight": "peso" (opcional)
    } (opcional),
    "border": {
      "width": "ancho" (opcional),
      "color": "color o clase" (opcional),
      "radius": "radio o clase" (opcional)
    } (opcional),
    "padding": { "left": "px", "right": "px", "top": "px", "bottom": "px" } (opcional),
    "margin": { "left": "px", "right": "px", "top": "px", "bottom": "px" } (opcional)
  }
}

Ejemplos con Tailwind detectado:
- "cambia esto a negro" → { "styles": { "text": { "color": "text-black" } } }
- "hazlo verde" → { "styles": { "text": { "color": "text-green-600" } } }
- "fondo azul" → { "styles": { "backgroundColor": "bg-blue-500" } }
- "hazlo más grande" → { "styles": { "text": { "fontSize": "text-lg" } } }

Ejemplos sin Tailwind:
- "cambia esto a negro" → { "styles": { "text": { "color": "#000000" } } }
- "hazlo verde" → { "styles": { "text": { "color": "#22c55e" } } }
- "fondo azul" → { "styles": { "backgroundColor": "#3b82f6" } }
- "hazlo más grande" → { "styles": { "text": { "fontSize": "20px" } } }

Si no puedes interpretar la solicitud, responde con un JSON vacío: {}`;

        // Get AI model client
        const { modelClient } = await getModelClient(selectedModel, settings);

        // Generate response
        const result = await generateText({
          model: modelClient.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt },
          ],
          temperature: 0.3, // Lower temperature for more consistent JSON output
        });

        const responseText = result.text.trim();

        // Try to parse the JSON response
        let parsedResponse: any;
        try {
          // Remove markdown code blocks if present
          const cleaned = responseText
            .replace(/^```json\s*/i, "")
            .replace(/^```\s*/i, "")
            .replace(/\s*```$/i, "")
            .trim();

          parsedResponse = JSON.parse(cleaned);
        } catch (parseError) {
          logger.error("Failed to parse AI response:", responseText);
          return {
            error: "No pude entender la respuesta de la IA. Intenta ser más específico.",
          };
        }

        // Log AI query for analytics
        try {
          void logAiQuery({
            queryType: "visual-editing-quick-edit",
            model: selectedModel.name,
            promptSnippet: prompt.slice(0, 100),
            payload: {
              system: systemPrompt,
              prompt,
              componentName,
              currentStyles,
              currentTextContent,
            },
            response: {
              text: responseText,
              parsed: parsedResponse,
            },
            inputTokens: result.usage?.inputTokens,
            outputTokens: result.usage?.outputTokens,
          }, settings.userId as string);
        } catch (logError) {
          logger.error("Failed to log AI query:", logError);
        }

        // Build the change object
        const change: any = {
          componentId,
          componentName,
          relativePath,
          lineNumber,
          styles: parsedResponse.styles || {},
        };

        if (parsedResponse.textContent !== undefined) {
          change.textContent = parsedResponse.textContent;
        }

        return { change };
      } catch (error) {
        logger.error("Failed to process quick edit:", error);
        return {
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  );
}
