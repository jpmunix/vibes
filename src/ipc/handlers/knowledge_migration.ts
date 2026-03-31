/**
 * Knowledge Migration — Ensures every app has stack-rules in the KB.
 *
 * Flow:
 * 1. Check if KB already has a "stack-rules" entry for this app
 * 2. If not, check for AI_RULES.md in the app folder
 * 3. If found, migrate its content to KB (silent, no UI)
 * 4. If not found, generate stack-rules via AI (using standard model)
 * 5. Persist primaryLanguage + projectType in the apps table
 */
import { getRemoteDb } from "../../db/remote";
import * as remoteSchema from "../../db/remote-schema";
import { eq, and } from "drizzle-orm";
import log from "electron-log";
import path from "path";
import fsPromises from "fs/promises";
import { DEFAULT_STANDARD_MODEL } from "../../lib/schemas";
import { openRouterCompletion, hasOpenRouterApiKey } from "../utils/openrouter";

const logger = log.scope("knowledge_migration");

/**
 * In-memory lock to prevent concurrent processing of the same app.
 * This avoids the race condition where multiple listApps calls
 * fire ensureKnowledgeBaseRules for the same app simultaneously.
 */
const processingApps = new Set<number>();

/**
 * One-time flag: clean up any duplicate stack-rules on first invocation.
 */
let hasRunDedup = false;

/**
 * Remove duplicate stack-rules entries, keeping only the oldest per app.
 * Runs once on first call to clean up any leftovers from the race condition bug.
 */
async function deduplicateStackRules(db: ReturnType<typeof getRemoteDb>): Promise<void> {
    if (hasRunDedup) return;
    hasRunDedup = true;

    try {
        const allStackRules = await db.query.knowledgeEntries.findMany({
            where: eq(remoteSchema.knowledgeEntries.category, "stack-rules"),
            columns: { id: true, appId: true, createdAt: true },
            orderBy: (entries, { asc }) => [asc(entries.createdAt)],
        });

        // Group by appId
        const byApp = new Map<number, number[]>();
        for (const entry of allStackRules) {
            if (entry.appId == null) continue;
            const ids = byApp.get(entry.appId) || [];
            ids.push(entry.id);
            byApp.set(entry.appId, ids);
        }

        // Delete all but the first (oldest) for each app
        let deletedCount = 0;
        for (const [appId, ids] of byApp) {
            if (ids.length <= 1) continue;
            const toDelete = ids.slice(1); // keep the first (oldest)
            for (const id of toDelete) {
                await db.delete(remoteSchema.knowledgeEntries)
                    .where(eq(remoteSchema.knowledgeEntries.id, id));
                deletedCount++;
            }
            logger.info(`[DEDUP] Removed ${toDelete.length} duplicate stack-rules for app ${appId}`);
        }

        if (deletedCount > 0) {
            logger.info(`[DEDUP] Total duplicates removed: ${deletedCount}`);
        }
    } catch (error) {
        logger.warn(`[DEDUP] Error during deduplication: ${error}`);
    }
}

/**
 * Ensures an app has:
 * 1. A "stack-rules" entry in the KB
 * 2. primaryLanguage + projectType set in the apps table
 *
 * This is called transparently from listApps for apps that haven't been processed yet.
 * It's a fire-and-forget operation — errors are logged but never surface to the user.
 */
export async function ensureKnowledgeBaseRules(
    appId: number,
    appPath: string,
    userId: string,
): Promise<void> {
    // Prevent concurrent processing of the same app
    if (processingApps.has(appId)) {
        return;
    }
    processingApps.add(appId);

    try {
        const db = getRemoteDb();

        // One-time: clean up any existing duplicates
        await deduplicateStackRules(db);

        // 1. Check if this app already has a stack-rules entry
        const existingStackRules = await db.query.knowledgeEntries.findFirst({
            where: and(
                eq(remoteSchema.knowledgeEntries.appId, appId),
                eq(remoteSchema.knowledgeEntries.userId, userId),
                eq(remoteSchema.knowledgeEntries.category, "stack-rules"),
            ),
        });

        if (existingStackRules) {
            // Already processed — check if we still need to set projectType
            const app = await db.query.apps.findFirst({
                where: and(eq(remoteSchema.apps.id, appId), eq(remoteSchema.apps.userId, userId)),
                columns: { projectType: true, primaryLanguage: true },
            });
            if (app && !app.projectType) {
                // Backfill: parse from existing stack-rules content
                await inferAndPersistLanguage(db, appId, userId, existingStackRules.content);
            }
            return;
        }

        // 2. Check for AI_RULES.md in the app folder
        let aiRulesContent: string | null = null;
        try {
            const aiRulesPath = path.join(appPath, "AI_RULES.md");
            aiRulesContent = await fsPromises.readFile(aiRulesPath, "utf-8");
            logger.info(`[MIGRATION] Found AI_RULES.md for app ${appId}, migrating to KB`);
        } catch {
            // No AI_RULES.md — will generate via AI
        }

        if (aiRulesContent) {
            // 3. Migrate AI_RULES.md content to KB
            await db.insert(remoteSchema.knowledgeEntries).values({
                userId,
                appId,
                category: "stack-rules",
                content: aiRulesContent,
                source: "manual",
                confidence: 100,
                enabled: 1,
                createdAt: new Date(),
                updatedAt: new Date(),
            });
            logger.info(`[MIGRATION] Migrated AI_RULES.md to KB for app ${appId}`);

            // Infer language from the migrated content using AI
            await detectAndPersistStackViaAI(db, appId, appPath, userId, aiRulesContent);
        } else {
            // 4. Generate via AI — analyze the codebase
            await generateStackRulesViaAI(db, appId, appPath, userId);
        }
    } catch (error) {
        logger.error(`[MIGRATION] Error for app ${appId}:`, error);
        // Never throw — this is fire-and-forget
    } finally {
        processingApps.delete(appId);
    }
}

/**
 * Use AI to analyze the codebase and generate stack-rules + detect language.
 */
async function generateStackRulesViaAI(
    db: ReturnType<typeof getRemoteDb>,
    appId: number,
    appPath: string,
    userId: string,
): Promise<void> {
    if (!hasOpenRouterApiKey()) {
        logger.warn(`[MIGRATION] No OpenRouter API key, skipping AI generation for app ${appId}`);
        // Fallback: try file-based detection
        await fallbackFileDetection(db, appId, appPath, userId);
        return;
    }

    try {
        // Read key files to give the AI context about the project
        const contextFiles = await gatherProjectContext(appPath);

        if (!contextFiles) {
            logger.warn(`[MIGRATION] No context files found for app ${appId}, using file-based fallback`);
            await fallbackFileDetection(db, appId, appPath, userId);
            return;
        }

        const { readSettings } = await import("../../main/settings");
        const settings = readSettings();
        const model = settings.standardModeModel || DEFAULT_STANDARD_MODEL;

        const data = await openRouterCompletion({
            model,
            title: "stack-detection",
            temperature: 0.1,
            max_tokens: 600,
            response_format: { type: "json_object" },
            messages: [
                {
                    role: "system",
                    content: `Eres un analizador de proyectos de software. Analiza los archivos del proyecto y devuelve un JSON con:
1. "primaryLanguage": el lenguaje principal (javascript, typescript, php, python, rust, go, java, ruby, dart, csharp, kotlin, swift, unknown)
2. "projectType": "node" si es un proyecto Node.js/Bun/Deno (tiene package.json), "generic" para todo lo demás
3. "stackRules": un texto en español de 5-10 líneas describiendo el stack tecnológico, frameworks usados, y reglas básicas de qué librerías usar para qué. Formato markdown con bullets.

Devuelve SOLO JSON válido.`,
                },
                {
                    role: "user",
                    content: `Analiza este proyecto:\n\n${contextFiles}`,
                },
            ],
        });

        const responseText = data?.choices?.[0]?.message?.content?.trim();
        if (!responseText) {
            logger.warn(`[MIGRATION] Empty AI response for app ${appId}`);
            await fallbackFileDetection(db, appId, appPath, userId);
            return;
        }

        let parsed: { primaryLanguage?: string; projectType?: string; stackRules?: string };
        try {
            parsed = JSON.parse(responseText);
        } catch {
            logger.warn(`[MIGRATION] Failed to parse AI response for app ${appId}: ${responseText.slice(0, 200)}`);
            await fallbackFileDetection(db, appId, appPath, userId);
            return;
        }

        const primaryLanguage = parsed.primaryLanguage || "unknown";
        const projectType = parsed.projectType === "node" ? "node" : "generic";
        const stackRules = parsed.stackRules || `Proyecto ${primaryLanguage}`;

        // Save stack-rules entry
        await db.insert(remoteSchema.knowledgeEntries).values({
            userId,
            appId,
            category: "stack-rules",
            content: stackRules,
            source: "auto-extracted",
            confidence: 90,
            enabled: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        // Persist language + type
        await db
            .update(remoteSchema.apps)
            .set({ primaryLanguage, projectType })
            .where(and(eq(remoteSchema.apps.id, appId), eq(remoteSchema.apps.userId, userId)));

        logger.info(`[MIGRATION] Generated stack-rules for app ${appId}: ${primaryLanguage}/${projectType}`);
    } catch (error) {
        logger.error(`[MIGRATION] AI generation failed for app ${appId}:`, error);
        await fallbackFileDetection(db, appId, appPath, userId);
    }
}

/**
 * Infer language from existing stack-rules content and persist.
 */
async function detectAndPersistStackViaAI(
    db: ReturnType<typeof getRemoteDb>,
    appId: number,
    appPath: string,
    userId: string,
    existingContent: string,
): Promise<void> {
    // Quick heuristic from content
    const content = existingContent.toLowerCase();
    let primaryLanguage = "unknown";
    let projectType: "node" | "generic" = "generic";

    if (content.includes("next.js") || content.includes("react") || content.includes("node") || content.includes("npm") || content.includes("typescript") || content.includes("vite")) {
        primaryLanguage = content.includes("typescript") ? "typescript" : "javascript";
        projectType = "node";
    } else if (content.includes("php") || content.includes("laravel") || content.includes("wordpress") || content.includes("symfony")) {
        primaryLanguage = "php";
    } else if (content.includes("python") || content.includes("django") || content.includes("flask") || content.includes("fastapi")) {
        primaryLanguage = "python";
    } else if (content.includes("rust") || content.includes("cargo")) {
        primaryLanguage = "rust";
    } else if (content.includes("go") || content.includes("golang")) {
        primaryLanguage = "go";
    } else if (content.includes("java") || content.includes("spring") || content.includes("gradle") || content.includes("maven")) {
        primaryLanguage = "java";
    } else if (content.includes("ruby") || content.includes("rails")) {
        primaryLanguage = "ruby";
    } else if (content.includes("dart") || content.includes("flutter")) {
        primaryLanguage = "dart";
    } else if (content.includes("c#") || content.includes("csharp") || content.includes(".net") || content.includes("blazor")) {
        primaryLanguage = "csharp";
    }

    // Also check for package.json
    if (projectType === "generic") {
        try {
            await fsPromises.access(path.join(appPath, "package.json"));
            projectType = "node";
            if (primaryLanguage === "unknown") primaryLanguage = "javascript";
        } catch { /* no package.json */ }
    }

    await db
        .update(remoteSchema.apps)
        .set({ primaryLanguage, projectType })
        .where(and(eq(remoteSchema.apps.id, appId), eq(remoteSchema.apps.userId, userId)));

    logger.info(`[MIGRATION] Inferred stack from content for app ${appId}: ${primaryLanguage}/${projectType}`);
}

/**
 * Infer language from an existing KB entry's content and persist.
 */
async function inferAndPersistLanguage(
    db: ReturnType<typeof getRemoteDb>,
    appId: number,
    userId: string,
    content: string,
): Promise<void> {
    const lc = content.toLowerCase();
    let primaryLanguage = "unknown";
    let projectType: "node" | "generic" = "generic";

    if (lc.includes("next.js") || lc.includes("react") || lc.includes("node") || lc.includes("typescript") || lc.includes("vite") || lc.includes("package.json")) {
        primaryLanguage = lc.includes("typescript") ? "typescript" : "javascript";
        projectType = "node";
    } else if (lc.includes("php") || lc.includes("laravel")) {
        primaryLanguage = "php";
    } else if (lc.includes("python") || lc.includes("django")) {
        primaryLanguage = "python";
    }

    if (primaryLanguage !== "unknown") {
        await db
            .update(remoteSchema.apps)
            .set({ primaryLanguage, projectType })
            .where(and(eq(remoteSchema.apps.id, appId), eq(remoteSchema.apps.userId, userId)));
    }
}

/**
 * Fallback file-based detection when AI is not available.
 */
async function fallbackFileDetection(
    db: ReturnType<typeof getRemoteDb>,
    appId: number,
    appPath: string,
    userId: string,
): Promise<void> {
    const checks: Array<{ file: string; lang: string; type: "node" | "generic" }> = [
        { file: "package.json", lang: "javascript", type: "node" },
        { file: "composer.json", lang: "php", type: "generic" },
        { file: "requirements.txt", lang: "python", type: "generic" },
        { file: "setup.py", lang: "python", type: "generic" },
        { file: "Cargo.toml", lang: "rust", type: "generic" },
        { file: "go.mod", lang: "go", type: "generic" },
        { file: "pom.xml", lang: "java", type: "generic" },
        { file: "build.gradle", lang: "java", type: "generic" },
        { file: "Gemfile", lang: "ruby", type: "generic" },
        { file: "pubspec.yaml", lang: "dart", type: "generic" },
    ];

    for (const check of checks) {
        try {
            await fsPromises.access(path.join(appPath, check.file));
            // If package.json, try to read it for more info
            let stackContent = `Proyecto ${check.lang}`;
            if (check.file === "package.json") {
                try {
                    const pkgRaw = await fsPromises.readFile(path.join(appPath, "package.json"), "utf-8");
                    const pkg = JSON.parse(pkgRaw);
                    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
                    const hasTsconfig = await fsPromises.access(path.join(appPath, "tsconfig.json")).then(() => true).catch(() => false);
                    if (hasTsconfig || deps["typescript"]) check.lang = "typescript";
                    stackContent = `Proyecto ${check.lang} (${pkg.name || "sin nombre"})`;
                } catch { /* ignore parse errors */ }
            }

            await db.insert(remoteSchema.knowledgeEntries).values({
                userId,
                appId,
                category: "stack-rules",
                content: stackContent,
                source: "auto-extracted",
                confidence: 70,
                enabled: 1,
                createdAt: new Date(),
                updatedAt: new Date(),
            });

            await db
                .update(remoteSchema.apps)
                .set({ primaryLanguage: check.lang, projectType: check.type })
                .where(and(eq(remoteSchema.apps.id, appId), eq(remoteSchema.apps.userId, userId)));

            logger.info(`[MIGRATION] File-based detection for app ${appId}: ${check.lang}/${check.type}`);
            return;
        } catch {
            // File doesn't exist, try next
        }
    }

    // Nothing detected
    await db
        .update(remoteSchema.apps)
        .set({ primaryLanguage: "unknown", projectType: "generic" })
        .where(and(eq(remoteSchema.apps.id, appId), eq(remoteSchema.apps.userId, userId)));

    logger.info(`[MIGRATION] No stack detected for app ${appId}, set to unknown/generic`);
}

/**
 * Gather context files from the project to give the AI something to analyze.
 */
async function gatherProjectContext(appPath: string): Promise<string | null> {
    const contextFiles: string[] = [];
    const filesToTry = [
        { name: "package.json", maxSize: 3000 },
        { name: "composer.json", maxSize: 3000 },
        { name: "requirements.txt", maxSize: 2000 },
        { name: "Cargo.toml", maxSize: 2000 },
        { name: "go.mod", maxSize: 2000 },
        { name: "pom.xml", maxSize: 2000 },
        { name: "pubspec.yaml", maxSize: 2000 },
        { name: "Gemfile", maxSize: 2000 },
        { name: "tsconfig.json", maxSize: 1000 },
        { name: "README.md", maxSize: 2000 },
    ];

    for (const { name, maxSize } of filesToTry) {
        try {
            const content = await fsPromises.readFile(path.join(appPath, name), "utf-8");
            contextFiles.push(`--- ${name} ---\n${content.slice(0, maxSize)}`);
        } catch {
            // File doesn't exist
        }
    }

    // Also list top-level directory
    try {
        const entries = await fsPromises.readdir(appPath, { withFileTypes: true });
        const listing = entries
            .slice(0, 40)
            .map((e) => `${e.isDirectory() ? "📁" : "📄"} ${e.name}`)
            .join("\n");
        contextFiles.push(`--- Directorio raíz ---\n${listing}`);
    } catch { /* ignore */ }

    if (contextFiles.length === 0) return null;
    return contextFiles.join("\n\n");
}
