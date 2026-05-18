import { getRemoteDb } from "../src/db/remote";
import * as remoteSchema from "../src/db/remote-schema";
import { PROMPT_LABELS, PROMPT_DESCRIPTIONS, PromptId } from "../src/prompts/index";
import { DEFAULT_PROMPTS } from "../src/prompts/defaults";

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

async function migratePrompts() {
  const db = getRemoteDb();
  
  // We need to fetch all users to run the migration per user
  // (Alternatively, the migration can be triggered on user login)
  const allUsers = await db.select().from(remoteSchema.users);
  
  for (const user of allUsers) {
    console.log(`Migrating prompts for user ${user.id} (${user.email})...`);
    
    for (const group of PROMPT_GROUPS) {
      // Create category
      const [category] = await db
        .insert(remoteSchema.promptsCategories)
        .values({
          userId: user.id,
          name: group.title,
          description: group.description,
        })
        .returning();
      
      console.log(`  Created category ${category.name}`);
      
      for (const promptId of group.ids) {
        // Insert prompt
        await db.insert(remoteSchema.prompts).values({
          userId: user.id,
          categoryId: category.id,
          systemId: promptId,
          title: PROMPT_LABELS[promptId as PromptId] || promptId,
          description: PROMPT_DESCRIPTIONS[promptId as PromptId] || "",
          content: DEFAULT_PROMPTS[promptId as PromptId],
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        console.log(`    Created prompt ${promptId}`);
      }
    }
  }
  
  console.log("Migration completed.");
}

migratePrompts().catch(console.error);
