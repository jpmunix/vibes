#!/usr/bin/env node
/**
 * rebrand-mcode.mjs — Barrido de rebrand: sustituye cualquier referencia a la
 * marca antigua ("mCode" y sus variantes de mayúsculas) por "Vibes" en TODO el
 * board de Trello.
 *
 * Cubre el 100% de las cards usando filter=all (incluidas las ARCHIVADAS, que
 * el helper getCards() por defecto filtra con filter=open y se dejaría fuera).
 *
 * Campos escaneados:
 *   - Card: name, desc
 *   - Checklist: name
 *   - CheckItem: name
 *   - Comentarios (actions commentCard): text
 *   - Listas: name
 *   - Labels: name
 *   - Board: name, desc
 *
 * Reemplazo case-preserving:
 *   MCODE  → VIBES   (contextos en mayúsculas, p.ej. #MCODE-92 → #VIBES-92)
 *   mcode  → vibes   (contextos en minúsculas)
 *   mCode / MCode / Mcode → Vibes  (cualquier mezcla)
 *
 * Uso:
 *   node scripts/trello/rebrand-mcode.mjs              # DRY-RUN: solo reporta
 *   node scripts/trello/rebrand-mcode.mjs --apply      # muta via API
 *   node scripts/trello/rebrand-mcode.mjs --json       # reporte machine-readable
 */
import { api, CONFIG } from './lib.mjs';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const asJson = args.includes('--json');

/**
 * Sustituye la marca preservando el patrón de mayúsculas del match.
 * Devuelve { text, changed, count }.
 */
export function replaceBrand(text) {
  if (!text) return { text, changed: false, count: 0 };
  let count = 0;
  const replaced = String(text).replace(/mcode/gi, (match) => {
    count += 1;
    if (match === match.toUpperCase()) return 'VIBES';
    if (match === match.toLowerCase()) return 'vibes';
    return 'Vibes';
  });
  return { text: replaced, changed: count > 0, count };
}

const BRAND_RE = /mcode/i;
const hits = []; // cada uno: { scope, ref, field, before, after, id, extra }

/** Registra un hit si el texto contiene la marca. */
function scan(scope, ref, field, text, ctx) {
  if (!text || !BRAND_RE.test(text)) return;
  const { text: after, count } = replaceBrand(text);
  hits.push({ scope, ref, field, before: text, after, count, ...ctx });
}

/* ---------- Fetch del 100% de las cards (incluidas archivadas) ---------- */
// filter=all devuelve abiertas Y archivadas (closed=true).
const cards = await api(`/1/boards/${CONFIG.boardId}/cards`, {
  filter: 'all',
  fields: 'id,name,desc,idShort,closed',
});
const [lists, labels, board] = await Promise.all([
  api(`/1/boards/${CONFIG.boardId}/lists`, { filter: 'all', fields: 'id,name,closed' }),
  api(`/1/boards/${CONFIG.boardId}/labels`, { fields: 'id,name' }),
  api(`/1/boards/${CONFIG.boardId}`, { fields: 'id,name,desc' }),
]);

if (!asJson) console.log(`🔍 Escaneando ${cards.length} cards (incluidas archivadas), ${lists.length} listas, ${labels.length} labels, board...`);

/* Iterador con concurrencia limitada para no reventar el rate limit (429). */
async function pMap(items, fn, limit) {
  const results = [];
  let i = 0;
  const workers = Array.from({ length: limit }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}

await pMap(
  cards,
  async (card) => {
    const ref = `#${card.idShort}${card.closed ? ' (archivada)' : ''}`;
    scan('card', ref, 'name', card.name, { cardId: card.id, cardName: card.name });
    scan('card', ref, 'desc', card.desc, { cardId: card.id, cardName: card.name });

    // Checklists (nombre + items)
    const checklists = await api(`/1/cards/${card.id}/checklists`, {
      fields: 'id,name',
      checkItem_fields: 'id,name',
    });
    for (const cl of checklists) {
      scan('checklist', ref, 'name', cl.name, { checklistId: cl.id, cardId: card.id, cardName: card.name });
      for (const item of cl.checkItems || []) {
        scan('checkitem', ref, 'name', item.name, { checkitemId: item.id, cardId: card.id, cardName: card.name });
      }
    }

    // Comentarios
    const actions = await api(`/1/cards/${card.id}/actions`, { filter: 'commentCard' });
    for (const a of actions) {
      scan('comment', ref, 'text', a.data?.text || '', { actionId: a.id, cardId: card.id, cardName: card.name });
    }
  },
  5,
);

// Listas
for (const l of lists) scan('list', l.name, 'name', l.name, { listId: l.id });
// Labels
for (const lb of labels) scan('label', lb.name, 'name', lb.name, { labelId: lb.id });
// Board
scan('board', board.name, 'name', board.name, { boardId: board.id });
scan('board', board.name, 'desc', board.desc, { boardId: board.id });

/* ---------- Reporte ---------- */
if (asJson) {
  console.log(JSON.stringify({ totalHits: hits.length, hits }, null, 2));
} else {
  console.log(`\n📊 ${hits.length} referencias a la marca antigua encontradas.\n`);
  if (!hits.length) {
    console.log('✅ Todo limpio: no queda ninguna referencia.');
  } else {
    for (const h of hits) {
      console.log(`⚠️  [${h.scope}] ${h.ref} · ${h.field}`);
      console.log(`    antes: ${JSON.stringify(h.before)}`);
      console.log(`    ahora: ${JSON.stringify(h.after)}`);
    }
  }
}

/* ---------- Aplicación ---------- */
if (apply && hits.length) {
  console.log('\n🔧 Aplicando cambios vía API...');
  for (const h of hits) {
    switch (h.scope) {
      case 'card':
        await api(`/1/cards/${h.cardId}`, h.field === 'name' ? { name: h.after } : { desc: h.after }, 'PUT');
        break;
      case 'checklist':
        await api(`/1/checklists/${h.checklistId}`, { name: h.after }, 'PUT');
        break;
      case 'checkitem':
        await api(`/1/cards/${h.cardId}/checkItem/${h.checkitemId}`, { name: h.after }, 'PUT');
        break;
      case 'comment':
        await api(`/1/actions/${h.actionId}`, { text: h.after }, 'PUT');
        break;
      case 'list':
        await api(`/1/lists/${h.listId}`, { name: h.after }, 'PUT');
        break;
      case 'label':
        await api(`/1/labels/${h.labelId}`, { name: h.after }, 'PUT');
        break;
      case 'board':
        await api(`/1/boards/${h.boardId}`, h.field === 'name' ? { name: h.after } : { desc: h.after }, 'PUT');
        break;
    }
    console.log(`   ✏️  [${h.scope}] ${h.ref} · ${h.field} actualizado`);
  }
  console.log('\n✅ Rebrand aplicado. Vuelve a ejecutar sin --apply para verificar que queda 0.');
} else if (!apply && hits.length) {
  console.log('\n💡 DRY-RUN: nada modificado. Vuelve con --apply para reescribir.');
}
