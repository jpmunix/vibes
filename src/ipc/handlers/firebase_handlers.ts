import log from "electron-log";
import { db } from "../../db";
import { eq } from "drizzle-orm";
import { apps } from "../../db/schema";
import { createTypedHandler } from "./base";
import { firebaseContracts } from "../types/firebase";
import {
    listFirebaseProjects,
    getFirebaseProjectWebConfig,
    createFirebaseProject,
    getFirebaseAccessToken,
    listFirebaseWebApps,
    createFirebaseWebApp
} from "../../firebase_admin/firebase_management_client";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs/promises";
import { getDyadAppPath } from "../../paths/paths";
import { addLog } from "../../lib/log_store";
import util from "util";

const logger = log.scope("firebase_handlers");

export function registerFirebaseHandlers() {
    // List all Firebase projects
    createTypedHandler(firebaseContracts.listProjects, async () => {
        try {
            const { readSettings } = await import("../../main/settings");
            const settings = readSettings();
            if (!settings.firebase?.accessToken) {
                return [];
            }

            const projects = await listFirebaseProjects();
            return projects.map((p: any) => ({
                projectId: p.projectId,
                displayName: p.displayName,
                projectNumber: p.projectNumber,
                resources: p.resources,
            }));
        } catch (error) {
            logger.error("Failed to list Firebase projects:", error);
            throw error;
        }
    });

    // List web apps for a project
    createTypedHandler(firebaseContracts.listWebApps, async (_, params) => {
        try {
            const apps = await listFirebaseWebApps(params.projectId);
            return apps.map((a: any) => ({
                appId: a.appId,
                displayName: a.displayName,
                appType: a.appType,
                projectId: a.projectId,
            }));
        } catch (error) {
            logger.error(`Failed to list web apps for Firebase project ${params.projectId}:`, error);
            throw error;
        }
    });

    // Create a new web app in a project
    createTypedHandler(firebaseContracts.createWebApp, async (_, params) => {
        try {
            const result = await createFirebaseWebApp(params.projectId, params.displayName);
            return {
                appId: result.appId, // Only return if it's a direct result, not an Operation
                displayName: params.displayName,
                projectId: params.projectId,
            };
        } catch (error) {
            logger.error(`Failed to create web app for Firebase project ${params.projectId}:`, error);
            throw error;
        }
    });

    // Get web config for a project
    createTypedHandler(firebaseContracts.getProjectWebConfig, async (_, params) => {
        try {
            logger.info(`Getting web config for project: ${params.projectId}, appId: ${params.appId}`);
            return await getFirebaseProjectWebConfig(params.projectId, params.appId, params.displayName);
        } catch (error) {
            logger.error(`Failed to get config for Firebase project ${params.projectId}:`, error);
            throw error;
        }
    });

    // Set project for an app
    createTypedHandler(firebaseContracts.setAppProject, async (_, params) => {
        const { appId, projectId, config } = params;
        await db
            .update(apps)
            .set({
                firebaseProjectId: projectId,
                firebaseConfig: config,
            })
            .where(eq(apps.id, appId));

        logger.info(`Associated app ${appId} with Firebase project ${projectId}`);
    });

    // Unset project for an app
    createTypedHandler(firebaseContracts.unsetAppProject, async (_, params) => {
        const { appId } = params;
        await db
            .update(apps)
            .set({
                firebaseProjectId: null,
                firebaseConfig: null,
            })
            .where(eq(apps.id, appId));

        logger.info(`Removed Firebase project association for app ${appId}`);
    });

    // Disconnect Firebase account
    createTypedHandler(firebaseContracts.disconnect, async () => {
        const { writeSettings } = await import("../../main/settings");

        writeSettings({
            firebase: undefined
        });

        logger.info("Disconnected Firebase account and cleared tokens");
    });

    // Create a new Firebase project
    createTypedHandler(firebaseContracts.createProject, async (_, params) => {
        try {
            return await createFirebaseProject(params.projectId, params.displayName);
        } catch (error) {
            logger.error("Failed to create Firebase project:", error);
            throw error;
        }
    });

    // Deploy to Firebase
    createTypedHandler(firebaseContracts.deploy, async (_, params) => {
        const { appId } = params;

        try {
            // 1. Get app details
            const [app] = await db.select().from(apps).where(eq(apps.id, appId));
            if (!app || !app.firebaseProjectId || !app.path) {
                throw new Error("La aplicación no tiene un proyecto de Firebase configurado o no se encuentra el path.");
            }

            const appPath = getDyadAppPath(app.path);
            const projectId = app.firebaseProjectId;

            logger.info(`Starting deploy for app ${appId} at path: ${appPath}`);

            // 1b. Verify directory exists
            try {
                const stats = await fs.stat(appPath);
                if (!stats.isDirectory()) {
                    throw new Error(`La ruta ${appPath} no es un directorio.`);
                }
            } catch (e: any) {
                throw new Error(`No se puede acceder al directorio de la aplicación: ${appPath}. Asegúrate de que existe.`);
            }
            const firebaseJsonPath = path.join(appPath, "firebase.json");
            try {
                await fs.access(firebaseJsonPath);
            } catch {
                logger.info(`Creating default firebase.json for app ${appId}`);
                const defaultConfig = {
                    hosting: {
                        public: "dist",
                        ignore: ["firebase.json", "**/.*", "**/node_modules/**"],
                        rewrites: [
                            {
                                source: "**",
                                destination: "/index.html"
                            }
                        ]
                    }
                };
                await fs.writeFile(firebaseJsonPath, JSON.stringify(defaultConfig, null, 2));
            }

            // 3. Ensure .firebaserc exists
            const firebasercPath = path.join(appPath, ".firebaserc");
            try {
                await fs.access(firebasercPath);
            } catch {
                logger.info(`Creating default .firebaserc for app ${appId}`);
                const defaultRc = {
                    projects: {
                        default: projectId
                    }
                };
                await fs.writeFile(firebasercPath, JSON.stringify(defaultRc, null, 2));
            }

            // 4. Get token
            const token = await getFirebaseAccessToken();

            addLog({
                appId,
                level: "info",
                type: "server",
                message: "Iniciando construcción de la aplicación (npm run build)...",
                timestamp: Date.now()
            });

            const buildProcess = spawn("npm", ["run", "build"], {
                cwd: appPath,
                shell: true,
                env: { ...process.env, CI: "true" }
            });

            await new Promise((resolve, reject) => {
                buildProcess.stdout.on("data", (data) => {
                    const message = util.stripVTControlCharacters(data.toString());
                    addLog({ appId, level: "info", type: "server", message, timestamp: Date.now() });
                });
                buildProcess.stderr.on("data", (data) => {
                    const message = util.stripVTControlCharacters(data.toString());
                    addLog({ appId, level: "warn", type: "server", message, timestamp: Date.now() });
                });
                buildProcess.on("close", (code) => {
                    if (code === 0) resolve(true);
                    else reject(new Error(`La construcción falló con código ${code}`));
                });
            });

            // 6. Run deploy
            const maskedCommand = `npx firebase-tools deploy --only hosting --project ${projectId} --token ******** --non-interactive`;
            logger.info(`Running deploy command: ${maskedCommand}`);
            addLog({
                appId,
                level: "info",
                type: "server",
                message: `Iniciando despliegue en Firebase Hosting...`,
                timestamp: Date.now()
            });

            let deployOutput = "";
            let deployErrorOutput = "";

            // Note: we use npx firebase-tools to ensure it's available
            const deployProcess = spawn("npx", ["firebase-tools", "deploy", "--only", "hosting", "--project", projectId, "--token", token, "--non-interactive"], {
                cwd: appPath,
                shell: true,
                env: { ...process.env }
            });

            await new Promise((resolve, reject) => {
                deployProcess.stdout.on("data", (data) => {
                    const message = util.stripVTControlCharacters(data.toString());
                    deployOutput += message;
                    addLog({ appId, level: "info", type: "server", message, timestamp: Date.now() });
                });
                deployProcess.stderr.on("data", (data) => {
                    const message = util.stripVTControlCharacters(data.toString());
                    deployErrorOutput += message;
                    addLog({ appId, level: "warn", type: "server", message, timestamp: Date.now() });
                });
                deployProcess.on("close", (code) => {
                    if (code === 0) {
                        resolve(true);
                    } else {
                        logger.error(`Firebase deploy failed with code ${code}.\nSTDOUT: ${deployOutput}\nSTDERR: ${deployErrorOutput}`);

                        // Detect SERVICE_DISABLED or Hosting API not used error
                        if (deployOutput.includes("firebasehosting.googleapis.com") && deployOutput.includes("is disabled")) {
                            const urlMatch = deployOutput.match(/https?:\/\/console\.developers\.google\.com\/apis\/api\/firebasehosting\.googleapis\.com\/overview\?project=\d+/);
                            const activationUrl = urlMatch ? urlMatch[0] : `https://console.firebase.google.com/project/${projectId}/hosting`;

                            reject(new Error(`HOSTING_API_DISABLED|${activationUrl}`));
                        } else {
                            reject(new Error(`El despliegue falló con código ${code}. Mira los logs internos para ver el error de Firebase.`));
                        }
                    }
                });
            });

            addLog({
                appId,
                level: "info",
                type: "server",
                message: "¡Despliegue en Firebase completado con éxito!",
                timestamp: Date.now()
            });
            return { success: true, message: "Despliegue completado con éxito" };

        } catch (error: any) {
            const errorMsg = error.message || "Error desconocido durante el despliegue";
            logger.error(`Firebase deploy failed for app ${appId}:`, error);
            addLog({
                appId,
                level: "error",
                type: "server",
                message: `ERROR: ${errorMsg}`,
                timestamp: Date.now()
            });
            return { success: false, message: errorMsg };
        }
    });
}
