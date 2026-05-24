import { getRemoteDb, initializeRemoteSchema } from "../src/db/remote";
import * as remoteSchema from "../src/db/remote-schema";
import { PROMPT_LABELS, PROMPT_DESCRIPTIONS, PromptId } from "../src/prompts/index";
import { DEFAULT_PROMPTS } from "../src/prompts/defaults";
import { eq } from "drizzle-orm";

const PROMPT_GROUPS: { title: string; description: string; ids: PromptId[] }[] = [
  {
    title: "Instrucciones del Chat",
    description: "Instrucciones inyectadas en cada mensaje al agente. Controlan idioma, comportamiento y eficiencia",
    ids: [
      "ctx_language",
      "ctx_no_run_locally",
      "ctx_context7_docs",
      "ctx_efficiency_triage",
      "ctx_task_management",
      "ctx_plan_mode",
      "ctx_build_walkthrough",
    ],
  },
  {
    title: "Generación de Nombres y Títulos",
    description: "Prompts usados para nombrar apps y generar títulos de chats",
    ids: ["chat_title", "app_title_short", "app_name_pro"],
  },
  {
    title: "Git y Automatización",
    description: "Prompts para operaciones automáticas del flujo de trabajo",
    ids: ["auto_commit_message"],
  },
  {
    title: "Sistema de Memoria",
    description: "Prompts del pipeline de memorias: extracción, selección e inicialización",
    ids: ["memory_synthesis", "memory_selection", "memory_onboarding"],
  },
];

function getPromptDefaultScope(promptId: string): string {
  if (promptId === "ctx_plan_mode") return "plan";
  if (promptId === "ctx_build_walkthrough") return "agent";
  return "all";
}

async function migratePrompts() {
  await initializeRemoteSchema();
  const db = getRemoteDb();
  
  // We need to fetch all users to run the migration per user
  // (Alternatively, the migration can be triggered on user login)
  const allUsers = await db.select().from(remoteSchema.users);
  
  for (const user of allUsers) {
    console.log(`Migrating prompts for user ${user.id} (${user.email})...`);
    
    for (const group of PROMPT_GROUPS) {
      // Find or create category
      let categoryId: number;
      const existingCategory = await db.query.promptsCategories.findFirst({
        where: (c, { eq, and }) => and(
          eq(c.userId, user.id),
          eq(c.name, group.title)
        ),
      });

      if (existingCategory) {
        categoryId = existingCategory.id;
        console.log(`  Using existing category "${group.title}" (ID: ${categoryId})`);
      } else {
        const [newCategory] = await db
          .insert(remoteSchema.promptsCategories)
          .values({
            userId: user.id,
            name: group.title,
            description: group.description,
          })
          .returning();
        categoryId = newCategory.id;
        console.log(`  Created category "${group.title}" (ID: ${categoryId})`);
      }
      
      for (const promptId of group.ids) {
        // Check if prompt already exists
        const existingPrompt = await db.query.prompts.findFirst({
          where: (p, { eq, and }) => and(
            eq(p.userId, user.id),
            eq(p.systemId, promptId)
          ),
        });

        if (existingPrompt) {
          console.log(`    Prompt "${promptId}" already exists (ID: ${existingPrompt.id}), checking if updates are needed`);
          
          const targetScope = getPromptDefaultScope(promptId);
          const updateFields: any = {};
          if (existingPrompt.categoryId !== categoryId) {
            updateFields.categoryId = categoryId;
          }
          if ((existingPrompt as any).scope !== targetScope) {
            updateFields.scope = targetScope;
            console.log(`      Updating scope of "${promptId}" to "${targetScope}"`);
          }
          
          if (Object.keys(updateFields).length > 0) {
            await db
              .update(remoteSchema.prompts)
              .set(updateFields)
              .where(eq(remoteSchema.prompts.id, existingPrompt.id));
          }
        } else {
          // Insert prompt
          await db.insert(remoteSchema.prompts).values({
            userId: user.id,
            categoryId,
            systemId: promptId,
            title: PROMPT_LABELS[promptId as PromptId] || promptId,
            description: PROMPT_DESCRIPTIONS[promptId as PromptId] || "",
            content: DEFAULT_PROMPTS[promptId as PromptId],
            scope: getPromptDefaultScope(promptId),
            createdAt: new Date(),
            updatedAt: new Date(),
          });
          console.log(`    Created prompt "${promptId}"`);
        }
      }
    }
  }
  
  console.log("Migration completed.");
}

migratePrompts().catch(console.error);
