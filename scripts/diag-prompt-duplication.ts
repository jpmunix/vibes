/**
 * DIAGNÓSTICO — ¿los prompt_defaults del sistema están duplicados en `prompts`
 * (per-user) o solo se escriben cuando hay variación?
 *
 * Consulta de solo lectura. Para cada usuario, compara el `content` de cada
 * fila `prompts` con `systemId` contra el `content` de `prompt_defaults`:
 *   - Igual  -> "duplicado" (la fila no aporta nada, copia del default)
 *   - Distinto -> "variación" (override del usuario)
 *   - systemId sin default -> huérfano
 *   - sin systemId -> prompt custom del usuario
 *
 * Uso: npx tsx scripts/diag-prompt-duplication.ts
 */
import { getRemoteDb } from "../src/db/remote";
import * as remoteSchema from "../src/db/remote-schema";

async function main() {
  const db = getRemoteDb();

  const [defaults, allPrompts, categories, users] = await Promise.all([
    db.select().from(remoteSchema.promptDefaults),
    db.select().from(remoteSchema.prompts),
    db.select().from(remoteSchema.promptsCategories),
    db.select().from(remoteSchema.users),
  ]);

  const defaultsBySystemId = new Map(defaults.map((d) => [d.systemId, d]));
  const userById = new Map(users.map((u) => [u.id, u]));

  const byUser = new Map<string, typeof allPrompts>();
  for (const p of allPrompts) {
    if (!byUser.has(p.userId)) byUser.set(p.userId, []);
    byUser.get(p.userId)!.push(p);
  }

  console.log(`prompt_defaults (global): ${defaults.length}`);
  console.log(`prompts (per-user, total): ${allPrompts.length}`);
  console.log(`usuarios con filas en prompts: ${byUser.size}`);
  console.log(`categorías: ${categories.length}`);
  console.log("");

  let totalDuplicates = 0;
  let totalVariations = 0;
  let totalCustom = 0;
  let totalOrphans = 0;

  for (const [userId, prompts] of byUser) {
    const user = userById.get(userId);
    const label = user ? `${user.displayName || user.email} (${userId})` : userId;

    const withSystem = prompts.filter((p) => p.systemId);
    const custom = prompts.filter((p) => !p.systemId);

    let duplicates = 0;
    let variations = 0;
    const variationDetail: string[] = [];

    for (const p of withSystem) {
      const def = defaultsBySystemId.get(p.systemId!);
      if (!def) {
        totalOrphans++;
        variationDetail.push(`  ⚠️  ${p.systemId}: no existe en prompt_defaults (huérfano)`);
        continue;
      }
      if (p.content === def.content) {
        duplicates++;
      } else {
        variations++;
        variationDetail.push(`  ✏️  ${p.systemId}: content difiere del default (v${def.version})`);
      }
    }

    totalDuplicates += duplicates;
    totalVariations += variations;
    totalCustom += custom.length;

    console.log(`--- user: ${label} ---`);
    console.log(`  filas en prompts: ${prompts.length} (system: ${withSystem.length}, custom: ${custom.length})`);
    console.log(`  duplicados (content == default): ${duplicates}`);
    console.log(`  variaciones (content != default): ${variations}`);
    for (const line of variationDetail) console.log(line);
    for (const p of custom) console.log(`  🗂  custom: "${p.title}" (cat ${p.categoryId})`);
    console.log("");
  }

  console.log("=== RESUMEN GLOBAL ===");
  console.log(`duplicados: ${totalDuplicates} | variaciones: ${totalVariations} | custom: ${totalCustom} | huérfanos: ${totalOrphans}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
