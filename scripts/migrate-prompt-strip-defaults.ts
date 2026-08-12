/**
 * MIGRACIÓN — Eliminar de la tabla `prompts` las filas que son copia exacta del
 * default del sistema (sin ningún override).
 *
 * Regla nueva (2026-08-12): `prompts` (per-user) SOLO guarda overrides
 * legítimos del usuario. Una fila existe si y solo si:
 *   - content != prompt_defaults.content, O
 *   - enabled != 1 (default), O
 *   - scope  != 'all' (default).
 * Si las tres coinciden con el default, la fila se elimina — el handler
 * `list` sintetizará la entrada desde prompt_defaults.
 *
 * Idempotente + dry-run.
 *
 * Uso:
 *   npx tsx scripts/migrate-prompt-strip-defaults.ts          # ejecuta
 *   npx tsx scripts/migrate-prompt-strip-defaults.ts --dry-run # solo muestra
 */
import { getRemoteDb } from "../src/db/remote";
import * as remoteSchema from "../src/db/remote-schema";
import { eq, and, inArray } from "drizzle-orm";

function isOverride(
  row: { content: string; enabled: number; scope: string | null },
  def: { content: string },
): boolean {
  if (row.content !== def.content) return true;
  if (row.enabled !== 1) return true;
  if ((row.scope ?? "all") !== "all") return true;
  return false;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const db = getRemoteDb();

  const [defaults, prompts] = await Promise.all([
    db.select().from(remoteSchema.promptDefaults),
    db.select().from(remoteSchema.prompts),
  ]);
  const defBy = new Map(defaults.map((d) => [d.systemId, d]));

  const toDelete: { id: number; systemId: string; reason: string }[] = [];
  let orphansKept = 0;

  for (const row of prompts) {
    if (!row.systemId) continue; // custom del usuario — no se toca
    const def = defBy.get(row.systemId);
    if (!def) {
      // huérfano: systemId no existe en prompt_defaults. Defensivo: dejar.
      orphansKept++;
      continue;
    }
    if (!isOverride(row, def)) {
      toDelete.push({
        id: row.id,
        systemId: row.systemId,
        reason: `content==default, enabled=${row.enabled}, scope='${row.scope ?? "all"}'`,
      });
    }
  }

  console.log(`prompt_defaults: ${defaults.length}`);
  console.log(`prompts (per-user): ${prompts.length}`);
  console.log(`a borrar (copia exacta del default, sin override): ${toDelete.length}`);
  console.log(`huérfanos mantenidos (systemId sin default): ${orphansKept}`);

  if (toDelete.length === 0) {
    console.log("✅ Nada que borrar. La tabla ya cumple la regla nueva.");
    return;
  }

  console.log("\n=== A BORRAR ===");
  for (const r of toDelete) {
    console.log(`  id=${r.id}  ${r.systemId.padEnd(24)}  ${r.reason}`);
  }

  if (dryRun) {
    console.log("\n[DRY-RUN] No se ha tocado la DB. Ejecuta sin --dry-run para aplicar.");
    return;
  }

  const ids = toDelete.map((r) => r.id);
  await db.delete(remoteSchema.prompts).where(inArray(remoteSchema.prompts.id, ids));

  console.log(`\n✅ Borradas ${ids.length} filas.`);
  console.log(`   Ejecuta npx tsx scripts/diag-prompt-duplication.ts para verificar.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
