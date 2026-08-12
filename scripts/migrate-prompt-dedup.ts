/**
 * MIGRACIÓN — Deduplicar prompts del sistema en la tabla `prompts` (per-user).
 *
 * Regla nueva (2026-08-12): los prompts del sistema NO se escriben en la tabla
 * del usuario. Solo se persiste una fila en `prompts` con `systemId` cuando
 * el usuario EDITA el default (content != prompt_defaults.content). El contenido
 * base siempre se lee de `prompt_defaults`.
 *
 * Esta migración deja la DB consistente con esa regla:
 *  - Para cada systemId, si hay UNA fila en cat 19 'Prompts del sistema'
 *    (cat del seed) con content igual al default, y existe OTRA fila (en otra
 *    categoría) con content != default -> la fila distinta se considera
 *    override del usuario: se copia su content a la fila de cat 19 y se borra
 *    la antigua.
 *  - Filas con content == default (duplicados exactos) -> se borran.
 *  - Filas con content != default y NO hay fila en cat 19 -> se mueven a cat 19
 *    (override), para que el 100% de los prompts editables vivan en
 *    'Prompts del sistema'.
 *  - Filas con systemId huérfano (no existe en prompt_defaults) -> se avisa
 *    y se dejan tal cual (defensivo).
 *
 * Idempotente: si corres dos veces, la segunda vez no encuentra nada que
 * migrar y termina en cero cambios.
 *
 * Uso:
 *   npx tsx scripts/migrate-prompt-dedup.ts          # ejecuta
 *   npx tsx scripts/migrate-prompt-dedup.ts --dry-run # solo muestra
 */
import { getRemoteDb } from "../src/db/remote";
import * as remoteSchema from "../src/db/remote-schema";
import { eq, and } from "drizzle-orm";

const SYSTEM_CATEGORY_NAME = "Prompts del sistema";
const SYSTEM_CATEGORY_DESC =
  "Prompts del sistema editables (versión guardada en prompt_defaults)";

interface Plan {
  systemId: string;
  keepRowId: number;
  dropRowIds: number[];
  overrideContent: string | null; // si hay edición legítima, content final
  targetCategoryId: number;
  reason: string;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const db = getRemoteDb();
  const [defaults, prompts, categories] = await Promise.all([
    db.select().from(remoteSchema.promptDefaults),
    db.select().from(remoteSchema.prompts),
    db.select().from(remoteSchema.promptsCategories),
  ]);

  const defBy = new Map(defaults.map((d) => [d.systemId, d]));
  const systemCategory = categories.find((c) => c.name === SYSTEM_CATEGORY_NAME);
  if (!systemCategory) {
    console.error(`❌ No existe la categoría "${SYSTEM_CATEGORY_NAME}". Abortando.`);
    process.exit(1);
  }
  const systemCategoryId = systemCategory.id;

  // Si la categoría de sistema no tiene descripción, la rellenamos (no es destructivo).
  if (systemCategory.description !== SYSTEM_CATEGORY_DESC) {
    if (!dryRun) {
      await db
        .update(remoteSchema.promptsCategories)
        .set({ description: SYSTEM_CATEGORY_DESC })
        .where(eq(remoteSchema.promptsCategories.id, systemCategoryId));
    }
    console.log(
      `📝 ${dryRun ? "[dry-run] " : ""}update prompts_categories ${systemCategoryId} description`,
    );
  }

  const systemRowsByUser = new Map<string, typeof prompts>();
  for (const p of prompts) {
    if (!p.systemId) continue;
    if (!systemRowsByUser.has(p.userId)) systemRowsByUser.set(p.userId, []);
    systemRowsByUser.get(p.userId)!.push(p);
  }

  const plans: Plan[] = [];

  for (const [userId, rows] of systemRowsByUser) {
    // Agrupar por systemId
    const bySid = new Map<string, typeof rows>();
    for (const r of rows) {
      const k = bySid.get(r.systemId!) ?? [];
      k.push(r);
      bySid.set(r.systemId!, k);
    }

    for (const [sid, group] of bySid) {
      const def = defBy.get(sid);
      if (!def) {
        console.warn(`⚠️  systemId huérfano: ${sid} (no existe en prompt_defaults). Se deja tal cual.`);
        continue;
      }

      const inSystemCat = group.find((r) => r.categoryId === systemCategoryId);
      const outsideSystemCat = group.filter((r) => r.categoryId !== systemCategoryId);

      const variationRows = group.filter((r) => r.content !== def.content);
      const exactRows = group.filter((r) => r.content === def.content);

      // CASO 1: hay fila en cat 19 con variación -> es la edición legítima.
      // Borrar todas las demás filas del systemId, dejar la de cat 19.
      if (inSystemCat && inSystemCat.content !== def.content) {
        const dropIds = group.filter((r) => r.id !== inSystemCat.id).map((r) => r.id);
        if (dropIds.length > 0) {
          plans.push({
            systemId: sid,
            keepRowId: inSystemCat.id,
            dropRowIds: dropIds,
            overrideContent: inSystemCat.content,
            targetCategoryId: systemCategoryId,
            reason: "fila cat 19 ya es override del usuario; borrar duplicados/fuera",
          });
        }
        continue;
      }

      // CASO 2: hay fila en cat 19 exacta, y al menos una variación fuera de cat 19
      // -> la variación es la edición legítima: mover su content a la fila de cat 19
      // y borrar TODAS las demás filas (incluida la fila antigua de la que viene el content).
      if (inSystemCat && variationRows.length > 0) {
        const edit = variationRows[0];
        const otherVariations = variationRows.slice(1);
        if (otherVariations.length > 0) {
          console.warn(
            `⚠️  ${sid}: ${otherVariations.length} variación(es) extra fuera de cat 19 (ids: ${otherVariations.map((r) => r.id).join(", ")}). Se descarta y se queda la primera.`,
          );
        }
        const dropIds = group.filter((r) => r.id !== inSystemCat.id).map((r) => r.id);
        plans.push({
          systemId: sid,
          keepRowId: inSystemCat.id,
          dropRowIds: dropIds,
          overrideContent: edit.content,
          targetCategoryId: systemCategoryId,
          reason: "mover variación de fuera a cat 19 (override del usuario)",
        });
        continue;
      }

      // CASO 3: hay fila exacta en cat 19, sin variación fuera -> solo duplicados exactos.
      // Borrar lo que esté fuera, dejar la de cat 19.
      if (inSystemCat) {
        const dropIds = group.filter((r) => r.id !== inSystemCat.id).map((r) => r.id);
        if (dropIds.length > 0) {
          plans.push({
            systemId: sid,
            keepRowId: inSystemCat.id,
            dropRowIds: dropIds,
            overrideContent: null,
            targetCategoryId: systemCategoryId,
            reason: "duplicado exacto fuera de cat 19",
          });
        }
        continue;
      }

      // CASO 4: no hay fila en cat 19, hay variación fuera -> la movemos a cat 19 como override.
      if (!inSystemCat && variationRows.length > 0) {
        const edit = variationRows[0];
        const otherVariations = variationRows.slice(1);
        if (otherVariations.length > 0) {
          console.warn(
            `⚠️  ${sid}: ${otherVariations.length} variación(es) extra fuera. Se descarta y se queda la primera.`,
          );
        }
        const dropIds = [
          ...exactRows.map((r) => r.id),
          ...otherVariations.map((r) => r.id),
        ];
        plans.push({
          systemId: sid,
          keepRowId: edit.id, // moveremos esta fila a cat 19
          dropRowIds: dropIds,
          overrideContent: edit.content,
          targetCategoryId: systemCategoryId,
          reason: "mover override a cat 19 (no había fila de seed)",
        });
        continue;
      }

      // CASO 5: solo hay filas exactas fuera de cat 19 -> mover una a cat 19
      // (o si hay varias, dejar una y borrar el resto) para que la categoría sistema
      // tenga el 100% de los defaults editables.
      if (!inSystemCat && exactRows.length > 0) {
        const keep = exactRows[0];
        const dropIds = exactRows.slice(1).map((r) => r.id);
        plans.push({
          systemId: sid,
          keepRowId: keep.id,
          dropRowIds: dropIds,
          overrideContent: null,
          targetCategoryId: systemCategoryId,
          reason: "consolidar duplicado exacto en cat 19",
        });
        continue;
      }
    }
  }

  if (plans.length === 0) {
    console.log("✅ Nada que migrar. La DB ya cumple la regla nueva.");
    return;
  }

  console.log(`\n=== PLAN DE MIGRACIÓN (${plans.length} systemIds) ===\n`);
  for (const p of plans) {
    console.log(
      `  • ${p.systemId.padEnd(24)} keep=#${p.keepRowId} drop=[${p.dropRowIds.join(",") || "—"}] override=${p.overrideContent ? "sí" : "no"} -> cat ${p.targetCategoryId}`,
    );
    console.log(`      ${p.reason}`);
  }

  if (dryRun) {
    console.log("\n[DRY-RUN] No se ha tocado la DB. Ejecuta sin --dry-run para aplicar.");
    return;
  }

  // Aplicar: en orden seguro (UPDATE content -> cambiar categoryId -> DELETE)
  let updated = 0;
  let moved = 0;
  let deleted = 0;
  for (const p of plans) {
    if (p.overrideContent !== null) {
      await db
        .update(remoteSchema.prompts)
        .set({
          content: p.overrideContent,
          updatedAt: new Date(),
        })
        .where(eq(remoteSchema.prompts.id, p.keepRowId));
      updated++;
    }
    await db
      .update(remoteSchema.prompts)
      .set({ categoryId: p.targetCategoryId, updatedAt: new Date() })
      .where(eq(remoteSchema.prompts.id, p.keepRowId));
    moved++;
    for (const id of p.dropRowIds) {
      await db.delete(remoteSchema.prompts).where(eq(remoteSchema.prompts.id, id));
      deleted++;
    }
  }

  console.log(`\n✅ Aplicado. UPDATE=${updated}, MOVE=${moved}, DELETE=${deleted}.`);
  console.log(`   Ejecuta npx tsx scripts/diag-prompt-duplication.ts para verificar.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
