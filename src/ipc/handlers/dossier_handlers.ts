import { streamText } from "ai";
import { marked } from "marked";
import HTMLToDOCX from "html-to-docx";
import AdmZip from "adm-zip";
import log from "electron-log";
import path from "node:path";
import fs from "node:fs";

import { createTypedHandler } from "./base";
import { dossierContracts, dossierStreamContract } from "../types/dossier";
import { safeSend } from "../utils/safe_sender";
import { readSettings } from "../../main/settings";
import { getModelClient } from "../utils/get_model_client";
import { db } from "../../db";
import { getDyadAppPath } from "../../paths/paths";
import { extractCodebase } from "../../utils/codebase";
import { validateChatContext } from "../utils/context_paths_utils";
import { getEffectivePrompt } from "../../prompts";
import { getLanguageModels } from "../shared/language_model_helpers";

const logger = log.scope("dossier_handlers");

// Track active dossier generation streams
const activeStreams = new Map<string, AbortController>();

// Cache dossier ZIP paths per appId
const dossierCache = new Map<number, string>();

/**
 * Get the dossier storage directory for an app
 */
function getDossierDir(appPath: string): string {
    return path.join(appPath, ".dossier");
}

/**
 * Send a progress chunk to the renderer
 */
function sendChunk(
    sender: Electron.WebContents,
    sessionId: string,
    message: string,
    phase: "analyzing" | "tutorial" | "memoria" | "docx" | "zip" | "done",
) {
    safeSend(sender, dossierStreamContract.events.chunk.channel, {
        sessionId,
        message,
        phase,
    });
}

/**
 * Send an error to the renderer
 */
function sendError(
    sender: Electron.WebContents,
    sessionId: string,
    error: string,
) {
    safeSend(sender, dossierStreamContract.events.error.channel, {
        sessionId,
        error,
    });
}

/**
 * Send the end event with the ZIP data
 */
function sendEnd(
    sender: Electron.WebContents,
    sessionId: string,
    zipBase64: string,
    fileName: string,
) {
    safeSend(sender, dossierStreamContract.events.end.channel, {
        sessionId,
        zipBase64,
        fileName,
    });
}

/**
 * Convert markdown content to a DOCX buffer
 */
async function markdownToDocx(
    markdownContent: string,
    title: string,
): Promise<Buffer> {
    const htmlContent = await marked(markdownContent);
    const fullHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'Calibri', 'Arial', sans-serif; font-size: 11pt; line-height: 1.6; color: #333; }
        h1 { font-size: 22pt; color: #1a237e; border-bottom: 2px solid #1a237e; padding-bottom: 8px; margin-top: 24px; }
        h2 { font-size: 16pt; color: #283593; margin-top: 20px; }
        h3 { font-size: 13pt; color: #3949ab; margin-top: 16px; }
        h4 { font-size: 11pt; color: #5c6bc0; margin-top: 12px; }
        ul, ol { margin-left: 20px; }
        li { margin-bottom: 4px; }
        code { background-color: #f5f5f5; padding: 2px 4px; border-radius: 3px; font-family: 'Consolas', monospace; font-size: 10pt; }
        pre { background-color: #f5f5f5; padding: 12px; border-radius: 4px; border: 1px solid #e0e0e0; overflow-x: auto; }
        pre code { background: none; padding: 0; }
        table { border-collapse: collapse; width: 100%; margin: 16px 0; }
        th, td { border: 1px solid #ccc; padding: 8px 12px; text-align: left; }
        th { background-color: #e8eaf6; font-weight: bold; }
        blockquote { border-left: 4px solid #1a237e; margin-left: 0; padding-left: 16px; color: #555; }
        strong { color: #1a237e; }
      </style>
    </head>
    <body>
      ${htmlContent}
    </body>
    </html>
  `;

    const fileBuffer = await HTMLToDOCX(fullHtml, null, {
        title,
        subject: title,
        creator: "Dossier Generator",
        description: `Documento generado automáticamente: ${title}`,
        margins: {
            top: 1440, // 1 inch in twips
            right: 1440,
            bottom: 1440,
            left: 1440,
        },
    });

    return Buffer.from(fileBuffer as ArrayBuffer);
}

/**
 * Parse the AI response into two documents
 */
function parseDocuments(fullText: string): {
    tutorial: string;
    memoria: string;
} {
    const tutorialMarker = "===DOCUMENTO_1_TUTORIAL_INTERACTIVO===";
    const memoriaMarker = "===DOCUMENTO_2_MEMORIA_TECNICA===";

    let tutorial = "";
    let memoria = "";

    const tutorialIdx = fullText.indexOf(tutorialMarker);
    const memoriaIdx = fullText.indexOf(memoriaMarker);

    if (tutorialIdx !== -1 && memoriaIdx !== -1) {
        tutorial = fullText
            .substring(tutorialIdx + tutorialMarker.length, memoriaIdx)
            .trim();
        memoria = fullText.substring(memoriaIdx + memoriaMarker.length).trim();
    } else if (tutorialIdx !== -1) {
        // Only tutorial found
        tutorial = fullText.substring(tutorialIdx + tutorialMarker.length).trim();
        memoria = "No se pudo generar la Memoria Técnica.";
    } else if (memoriaIdx !== -1) {
        // Only memoria found
        tutorial = "No se pudo generar el Tutorial Interactivo.";
        memoria = fullText.substring(memoriaIdx + memoriaMarker.length).trim();
    } else {
        // No markers found — split by best guess (half and half)
        const half = Math.floor(fullText.length / 2);
        tutorial = fullText.substring(0, half).trim();
        memoria = fullText.substring(half).trim();
    }

    return { tutorial, memoria };
}

export function registerDossierHandlers() {
    // =========================================================================
    // Generate Dossier (streaming)
    // =========================================================================
    createTypedHandler(
        dossierContracts.generate,
        async (event, { appId, sessionId, forceRegenerate }) => {
            const sender = event.sender;

            try {
                // Cancel any existing stream for this session
                const existing = activeStreams.get(sessionId);
                if (existing) {
                    existing.abort();
                    activeStreams.delete(sessionId);
                }

                const abortController = new AbortController();
                activeStreams.set(sessionId, abortController);

                // Phase 1: Analyze the app
                sendChunk(sender, sessionId, "Buscando información de la aplicación...", "analyzing");

                const app = await db.query.apps.findFirst({
                    where: (apps, { eq }) => eq(apps.id, appId),
                });

                if (!app) {
                    sendError(sender, sessionId, "No se encontró la aplicación.");
                    return { ok: true as const };
                }

                const appPath = getDyadAppPath(app.path);

                // Check if dossier already exists (skip if forceRegenerate)
                const dossierDir = getDossierDir(appPath);
                const existingZipPath = path.join(
                    dossierDir,
                    `dossier_${app.name.replace(/[^a-zA-Z0-9]/g, "_")}.zip`,
                );

                if (forceRegenerate && fs.existsSync(existingZipPath)) {
                    fs.unlinkSync(existingZipPath);
                    dossierCache.delete(appId);
                    logger.info(`Deleted existing dossier for regeneration: ${existingZipPath}`);
                }

                if (!forceRegenerate && fs.existsSync(existingZipPath)) {
                    sendChunk(
                        sender,
                        sessionId,
                        "Dossier existente encontrado. Enviando...",
                        "done",
                    );

                    const zipBuffer = fs.readFileSync(existingZipPath);
                    sendEnd(
                        sender,
                        sessionId,
                        zipBuffer.toString("base64"),
                        path.basename(existingZipPath),
                    );

                    activeStreams.delete(sessionId);
                    return { ok: true as const };
                }

                if (abortController.signal.aborted) {
                    return { ok: true as const };
                }

                sendChunk(
                    sender,
                    sessionId,
                    "Analizando estructura del proyecto...",
                    "analyzing",
                );

                // Extract codebase
                const chatContext = validateChatContext(app.chatContext);
                const { formattedOutput } = await extractCodebase({
                    appPath,
                    chatContext,
                });

                if (abortController.signal.aborted) {
                    return { ok: true as const };
                }

                sendChunk(
                    sender,
                    sessionId,
                    `Proyecto analizado. ${formattedOutput.length} caracteres de contexto extraídos.`,
                    "analyzing",
                );

                // Phase 2: Generate documents with AI
                sendChunk(
                    sender,
                    sessionId,
                    "Generando documentación con IA...",
                    "tutorial",
                );

                const settings = readSettings();
                const dossierPrompt = getEffectivePrompt("dossier_prompt", settings);

                // Resolve the AI model through OpenRouter
                const dossierModelName = settings.proModeModel || "google/gemini-3-flash-preview";
                let selectedModel = settings.selectedModel; // fallback to chat model

                // Look up the configured dossier model in OpenRouter
                const allModels = await getLanguageModels({ providerId: "openrouter" });
                const found = allModels.find((m) => m.apiName === dossierModelName);
                if (found) {
                    selectedModel = { name: found.apiName, provider: "openrouter" };
                } else {
                    // Fallback: use the model name directly through OpenRouter
                    selectedModel = { name: dossierModelName, provider: "openrouter" };
                }

                logger.info(`Dossier using model: ${selectedModel.name} via ${selectedModel.provider}`);

                const { modelClient } = await getModelClient(
                    selectedModel,
                    settings,
                );

                if (abortController.signal.aborted) {
                    return { ok: true as const };
                }

                // Build the full prompt with code context
                const userPrompt = [
                    "A continuación te proporciono el código fuente completo del proyecto.",
                    `Nombre de la app: ${app.name}`,
                    "",
                    "=== CÓDIGO FUENTE DEL PROYECTO ===",
                    formattedOutput,
                    "=== FIN DEL CÓDIGO FUENTE ===",
                    "",
                    "Genera los dos documentos siguiendo las instrucciones del sistema.",
                ].join("\n");

                // Stream the AI generation
                let fullText = "";
                let lastProgressUpdate = Date.now();

                const stream = streamText({
                    model: modelClient.model,
                    system: dossierPrompt,
                    prompt: userPrompt,
                    abortSignal: abortController.signal,
                });

                for await (const part of stream.fullStream) {
                    if (abortController.signal.aborted) break;

                    if (part.type === "text-delta") {
                        fullText += part.text;

                        // Send periodic progress updates (every 2 seconds)
                        const now = Date.now();
                        if (now - lastProgressUpdate > 2000) {
                            lastProgressUpdate = now;

                            // Detect current phase based on markers
                            const hasTutorialMarker = fullText.includes(
                                "===DOCUMENTO_1_TUTORIAL_INTERACTIVO===",
                            );
                            const hasMemoriaMarker = fullText.includes(
                                "===DOCUMENTO_2_MEMORIA_TECNICA===",
                            );

                            let phase: "tutorial" | "memoria" = "tutorial";
                            let msg = "Generando Tutorial Interactivo...";

                            if (hasMemoriaMarker) {
                                phase = "memoria";
                                msg = "Generando Memoria Técnica...";
                            } else if (hasTutorialMarker) {
                                phase = "tutorial";
                                msg = "Generando Tutorial Interactivo...";
                            }

                            sendChunk(sender, sessionId, msg, phase);
                        }
                    }
                }

                if (abortController.signal.aborted) {
                    logger.info(`Dossier generation cancelled for session: ${sessionId}`);
                    activeStreams.delete(sessionId);
                    return { ok: true as const };
                }

                sendChunk(
                    sender,
                    sessionId,
                    "Texto generado. Procesando documentos...",
                    "docx",
                );

                // Phase 3: Parse and convert to DOCX
                logger.info(`AI generated ${fullText.length} characters of content`);

                if (fullText.length < 100) {
                    logger.error(`AI returned insufficient content (${fullText.length} chars): ${fullText.substring(0, 200)}`);
                    sendError(
                        sender,
                        sessionId,
                        `La IA generó un contenido insuficiente (${fullText.length} caracteres). Intenta con otro modelo o revisa la configuración.`,
                    );
                    activeStreams.delete(sessionId);
                    return { ok: true as const };
                }

                const { tutorial, memoria } = parseDocuments(fullText);

                sendChunk(
                    sender,
                    sessionId,
                    "Convirtiendo Tutorial Interactivo a DOCX...",
                    "docx",
                );
                const tutorialDocx = await markdownToDocx(
                    tutorial,
                    `Tutorial Interactivo - ${app.name}`,
                );

                if (abortController.signal.aborted) {
                    return { ok: true as const };
                }

                sendChunk(
                    sender,
                    sessionId,
                    "Convirtiendo Memoria Técnica a DOCX...",
                    "docx",
                );
                const memoriaDocx = await markdownToDocx(
                    memoria,
                    `Memoria Técnica - ${app.name}`,
                );

                if (abortController.signal.aborted) {
                    return { ok: true as const };
                }

                // Phase 4: Create ZIP
                sendChunk(
                    sender,
                    sessionId,
                    "Empaquetando documentos en ZIP...",
                    "zip",
                );

                const zip = new AdmZip();
                zip.addFile("tutorial_interactivo.docx", tutorialDocx);
                zip.addFile("memoria_tecnica.docx", memoriaDocx);

                // Save ZIP to disk for future re-download
                fs.mkdirSync(dossierDir, { recursive: true });
                zip.writeZip(existingZipPath);
                dossierCache.set(appId, existingZipPath);

                logger.info(`Dossier ZIP saved: ${existingZipPath}`);

                // Send the ZIP as base64
                const zipBuffer = zip.toBuffer();
                sendChunk(
                    sender,
                    sessionId,
                    "¡Dossier generado exitosamente!",
                    "done",
                );
                sendEnd(
                    sender,
                    sessionId,
                    zipBuffer.toString("base64"),
                    path.basename(existingZipPath),
                );

                activeStreams.delete(sessionId);
            } catch (error: any) {
                if (error?.name === "AbortError") {
                    logger.info(`Dossier generation aborted for session: ${sessionId}`);
                } else {
                    logger.error("Dossier generation failed:", error);
                    sendError(
                        sender,
                        sessionId,
                        error?.message || "Error desconocido al generar el dossier.",
                    );
                }
                activeStreams.delete(sessionId);
            }

            return { ok: true as const };
        },
    );

    // =========================================================================
    // Cancel Dossier Generation
    // =========================================================================
    createTypedHandler(dossierContracts.cancel, async (_, sessionId) => {
        const controller = activeStreams.get(sessionId);
        if (controller) {
            controller.abort();
            activeStreams.delete(sessionId);
            logger.info(`Dossier generation cancelled: ${sessionId}`);
        }
        return { ok: true as const };
    });

    // =========================================================================
    // Check if Dossier Exists
    // =========================================================================
    createTypedHandler(
        dossierContracts.checkExisting,
        async (_, { appId }) => {
            const app = await db.query.apps.findFirst({
                where: (apps, { eq }) => eq(apps.id, appId),
            });

            if (!app) {
                return { exists: false };
            }

            const appPath = getDyadAppPath(app.path);
            const dossierDir = getDossierDir(appPath);
            const zipName = `dossier_${app.name.replace(/[^a-zA-Z0-9]/g, "_")}.zip`;
            const zipPath = path.join(dossierDir, zipName);

            if (fs.existsSync(zipPath)) {
                return { exists: true, zipPath };
            }

            return { exists: false };
        },
    );

    // =========================================================================
    // Download Existing Dossier
    // =========================================================================
    createTypedHandler(
        dossierContracts.download,
        async (_, { appId }) => {
            const app = await db.query.apps.findFirst({
                where: (apps, { eq }) => eq(apps.id, appId),
            });

            if (!app) {
                throw new Error("Aplicación no encontrada.");
            }

            const appPath = getDyadAppPath(app.path);
            const dossierDir = getDossierDir(appPath);
            const zipName = `dossier_${app.name.replace(/[^a-zA-Z0-9]/g, "_")}.zip`;
            const zipPath = path.join(dossierDir, zipName);

            if (!fs.existsSync(zipPath)) {
                throw new Error("No existe un dossier generado para esta aplicación.");
            }

            const zipBuffer = fs.readFileSync(zipPath);
            return {
                zipBase64: zipBuffer.toString("base64"),
                fileName: zipName,
            };
        },
    );
}
