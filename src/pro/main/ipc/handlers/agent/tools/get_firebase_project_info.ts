import { z } from "zod";
import { ToolDefinition, AgentContext, escapeXmlContent } from "./types";
import { getFirebaseProjectInfo } from "../../../../../../firebase_admin/firebase_context";

const getFirebaseProjectInfoSchema = z.object({});

export const getFirebaseProjectInfoTool: ToolDefinition<
    z.infer<typeof getFirebaseProjectInfoSchema>
> = {
    name: "get_firebase_project_info",
    description:
        "Get Firebase project overview: project ID and Firestore root collection IDs. Use this to discover what collections exist in the project.",
    inputSchema: getFirebaseProjectInfoSchema,
    defaultConsent: "always",
    isEnabled: (ctx) => !!ctx.firebaseProjectId,

    getConsentPreview: () => "Get Firebase project info",

    execute: async (args, ctx: AgentContext) => {
        if (!ctx.firebaseProjectId) {
            throw new Error("Firebase is not connected to this app");
        }

        ctx.onXmlStream(
            "<vibes-firebase-project-info></vibes-firebase-project-info>",
        );

        const info = await getFirebaseProjectInfo({
            projectId: ctx.firebaseProjectId,
        });

        ctx.onXmlComplete(
            `<vibes-firebase-project-info>\n${escapeXmlContent(info)}\n</vibes-firebase-project-info>`,
        );

        return info;
    },
};
