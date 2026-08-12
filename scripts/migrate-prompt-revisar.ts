/**
 * MIGRACIÓN — Crear categoría "revisar" y mover los prompts que NO llegan
 * a vibes-core (se usan en otros handlers o son huérfanos históricos).
 *
 * Regla de clasificación (2026-08-12):
 *   - "Prompts del sistema" (cat 19): ctx_* + runtime_agent_base.
 *     Son los 8 que Vibes mete en agent.systemPrompt y llegan a vibes-core.
 *   - "Revisar" (cat nueva): el resto de prompt_defaults que NO van a
 *     vibes-core (chat_title, app_title_short, app_name_pro,
 *     auto_commit_message, memory_*, chat_ask_mode, chat_plan_mode,
 *     supabase_*, bunny_*, pocketbase_*).
 *
 * Esta migración:
 *   1. Crea la categoría "revisar" si no existe.
 *   2. Mueve los overrides del usuario cuyo systemId no es de runtime
 *      (los que están en cat 19 pero pertenecen al grupo "revisar") a la
 *      nueva categoría.
 *
 * Idempotente + dry-run.
 *
 * Uso:
 *   npx tsx scripts/migrate-prompt-revisar.ts          # ejecuta
 *   npx tsx scripts/migrate-prompt-revisar.ts --dry-run # solo muestra
 */
import { getRemoteDb } from "../src/db/remote";
import * as remoteSchema from "../src/db/remote-schema";
import { eq, and } from "drizzle-orm";

const REVISAR_CATEGORY_NAME = "revisar";
const REVISAR_CATEGORY_DESC =
  "Prompts que NO llegan a vibes-core. Revisar si se migran los handlers para leerlos de prompt_defaults o si se borran.";

const RUNTIME_SYSTEM_IDS = new Set<string>([
  "ctx_language",
  "ctx_no_run_locally",
  "ctx_context7_docs",
  "ctx_efficiency_triage",
  "ctx_task_management",
  "ctx_plan_mode",
  "ctx_build_walkthrough",
  "runtime_agent_base",
]);

function isRuntime(systemId: string): boolean {
  return systemId.startsWith("ctx_") || systemId === "runtime_agent_base";
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const db = getRemoteDb();

  const [prompts, categories] = await Promise.all([
    db.select().from(remoteSchema.prompts),
    db.select().from(remoteSchema.promptsCategories),
  ]);

  let revisarCat = categories.find((c) => c.name === REVISAR_CATEGORY_NAME);
  if (!revisarCat) {
    console.log(`📝 Categoría "${REVISAR_CATEGORY_NAME}" no existe. Creando...`);
    if (!dryRun) {
      const [created] = await db
        .insert(remoteSchema.promptsCategories)
        .values({
          userId: prompts[0]?.userId ?? "",
          name: REVISAR_CATEGORY_NAME,
          description: REVISAR_CATEGORY_DESC,
        })
        .returning();
      revisarCat = created!;
      console.log(`   Creada con id=${revisarCat.id}`);
    } else {
      // dry-run: simulamos un id hipotético para que el resto del plan se muestre.
      revisarCat = {
        id: -1,
        userId: prompts[0]?.userId ?? "",
        name: REVISAR_CATEGORY_NAME,
        description: REVISAR_CATEGORY_DESC,
        isSystem: 0,
      } as typeof categories[number];
      console.log(`   [dry-run] se crearía con userId=${prompts[0]?.userId ?? "?"}`);
    }
  } else {
    console.log(`✅ Categoría "${REVISAR_CATEGORY_NAME}" ya existe (id=${revisarCat.id})`);
    if (revisarCat.description !== REVISAR_CATEGORY_DESC && !dryRun) {
      await db
        .update(remoteSchema.promptsCategories)
        .set({ description: REVISAR_CATEGORY_DESC })
        .where(eq(remoteSchema.promptsCategories.id, revisarCat.id));
      console.log(`   descripción actualizada`);
    }
  }

  const revisarCategoryId = revisarCat?.id;
  if (!revisarCategoryId) {
    console.log("❌ No se pudo determinar el id de la categoría. Abortando.");
    process.exit(1);
  }

  const systemCat = categories.find((c) => c.name === "Prompts del sistema");
  const systemCategoryId = systemCat?.id;

  // Mover overrides del usuario: los que están en cat sistema pero NO son runtime.
  const overridesToMove = prompts.filter(
    (p) =>
      p.systemId &&
      p.categoryId === systemCategoryId &&
      !isRuntime(p.systemId),
  );

  console.log(`\nOverrides a mover de "Prompts del sistema" -> "${REVISAR_CATEGORY_NAME}":`);
  if (overridesToMove.length === 0) {
    console.log("  (ninguno)");
  } else {
    for (const p of overridesToMove) {
      console.log(`  id=${p.id}  ${p.systemId.padEnd(28)}  (override del usuario)`);
    }
  }

  // Para que la UI muestre los sintetizados en la categoría correcta, listamos
  // los systemId no-runtime que hay en prompt_defaults (deberían ir a "revisar").
  const defaults = await db.select().from(remoteSchema.promptDefaults);
  const nonRuntimeDefaults = defaults.filter((d) => !isRuntime(d.systemId));
  console.log(`\nSystemIds no-runtime en prompt_defaults (irán a "${REVISAR_CATEGORY_NAME}" vía handler):`);
  for (const d of nonRuntimeDefaults) {
    console.log(`  ${d.systemId}`);
  }

  if (dryRun) {
    console.log("\n[DRY-RUN] No se ha tocado la DB. Ejecuta sin --dry-run para aplicar.");
    return;
  }

  for (const p of overridesToMove) {
    await db
      .update(remoteSchema.prompts)
      .set({ categoryId: revisarCategoryId, updatedAt: new Date() })
      .where(eq(remoteSchema.prompts.id, p.id));
  }
  console.log(`\n✅ Movidos ${overridesToMove.length} overrides a "${REVISAR_CATEGORY_NAME}".`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});