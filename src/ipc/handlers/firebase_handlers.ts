import log from "electron-log";
import { db } from "../../db";
import { eq } from "drizzle-orm";
import { apps } from "../../db/schema";
import { createTypedHandler } from "./base";
import { firebaseContracts } from "../types/firebase";
import {
    listFirebaseProjects,
    getFirebaseProjectWebConfig
} from "../../firebase_admin/firebase_management_client";

const logger = log.scope("firebase_handlers");

export function registerFirebaseHandlers() {
    // List all Firebase projects
    createTypedHandler(firebaseContracts.listProjects, async () => {
        try {
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

    // Get web config for a project
    createTypedHandler(firebaseContracts.getProjectWebConfig, async (_, params) => {
        try {
            return await getFirebaseProjectWebConfig(params.projectId);
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
}
