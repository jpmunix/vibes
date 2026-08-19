#!/usr/bin/env node
/**
 * list-cards.mjs — Lista las cards del board (para que el agente elija qué tocar).
 *
 * Uso:
 *   node scripts/trello/list-cards.mjs                     # todas, agrupadas por lista (legible)
 *   node scripts/trello/list-cards.mjs --list "To Do"      # solo una lista
 *   node scripts/trello/list-cards.mjs --label "fase-2"    # filtrar por label
 *   node scripts/trello/list-cards.mjs --number 139        # filtrar por idShort (#VIBES-139)
 *   node scripts/trello/list-cards.mjs --light             # ✅ MODO POR DEFECTO: resumen ligero (badges, total/checked, comments)
 *   node scripts/trello/list-cards.mjs --detail            # ⚠️  Solo redirigido a fichero tmp (ver abajo)
 *
 * ⚠️  IMPORTANTE — SALIDA GRANDE:
 *   --detail produce output grande. NUNCA lo pipes a jq ni python.
 *   SIEMPRE redirige a un fichero temporal y léelo con view_file:
 *
 *     node scripts/trello/list-cards.mjs --number 139 --detail > /tmp/card-139.json
 *     # luego: view_file /tmp/card-139.json
 *
 *   ❌ NUNCA: node scripts/trello/list-cards.mjs --detail | jq '...'
 *   ❌ NUNCA: node scripts/trello/list-cards.mjs --detail | python3 -c '...'
 */
import { getLists, getCards, getLabels } from './lib.mjs';

const args = process.argv.slice(2);
const getArg = (name) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : undefined;
};
const hasFlag = (name) => args.includes(`--${name}`);

const filterList = getArg('list');
const filterLabel = getArg('label');
const filterNumber = getArg('number');
const asDetail = hasFlag('detail');
const asLight = hasFlag('light');
// En modo light NO pedimos checklists embebidos (payload enorme) — usamos badges.
const cards = await getCards(undefined, { light: asLight });

const [lists, labels] = await Promise.all([getLists(), getLabelIds()]);

function getLabelIds() {
  return getLabels().catch(() => []);
}

const labelNameById = Object.fromEntries(labels.map((l) => [l.id, l.name]));

let filtered = cards;
if (filterList) {
  const list = lists.find((l) => l.name.toLowerCase() === filterList.toLowerCase());
  if (!list) {
    console.error(`❌ Lista "${filterList}" no encontrada. Listas: ${lists.map((l) => l.name).join(', ')}`);
    process.exit(1);
  }
  filtered = filtered.filter((c) => c.idList === list.id);
}
if (filterLabel) {
  filtered = filtered.filter((c) =>
    c.idLabels?.some((id) => (labelNameById[id] || '').toLowerCase() === filterLabel.toLowerCase()),
  );
}
if (filterNumber) {
  const n = Number(filterNumber.replace(/^#?(VIBES-)?/i, ''));
  if (!Number.isFinite(n) || n <= 0) {
    console.error(`❌ Número inválido: ${filterNumber}`);
    process.exit(1);
  }
  filtered = filtered.filter((c) => c.idShort === n);
}

if (asDetail) {
  // ⚠️  --detail produce output grande. SIEMPRE redirigir a fichero tmp.
  if (process.stdout.isTTY) {
    console.error('⚠️  --detail produce output grande y NO debe pintarse en el terminal ni pipearse a jq/python.');
    console.error('   Redirige SIEMPRE a un fichero temporal y léelo con view_file:');
    console.error('');
    console.error('   node scripts/trello/list-cards.mjs --number 139 --detail > /tmp/card-139.json');
    console.error('   # luego: view_file /tmp/card-139.json');
    process.exit(1);
  }
  const out = filtered.map((c) => ({
    id: c.id,
    idShort: c.idShort,
    title: c.name,
    name: c.name,
    list: lists.find((l) => l.id === c.idList)?.name || null,
    labels: (c.idLabels || []).map((id) => labelNameById[id]).filter(Boolean),
    url: c.url,
    checklists: (c.checklists || []).map((cl) => ({
      id: cl.id,
      name: cl.name,
      items: (cl.checkItems || []).map((item) => ({
        id: item.id,
        name: item.name,
        state: item.state,
      })),
    })),
  }));
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
}

if (asLight) {
  // Salida ligera: resumen por card (badges de la API, sin items ni comentarios).
  const out = filtered.map((c) => {
    const b = c.badges || {};
    return {
      idShort: c.idShort,
      title: c.name,
      list: lists.find((l) => l.id === c.idList)?.name || null,
      labels: (c.idLabels || []).map((id) => labelNameById[id]).filter(Boolean),
      checklists: b.checkItems > 0 ? [{ total: b.checkItems, checked: b.checkItemsChecked }] : [],
      comments: b.comments || 0,
      attachments: b.attachments || 0,
      dateLastActivity: c.dateLastActivity,
    };
  });
  console.log(JSON.stringify(out));
  process.exit(0);
}

// Legible: agrupado por lista
const byList = new Map(lists.map((l) => [l.id, []]));
for (const c of filtered) {
  (byList.get(c.idList) || []).push(c);
}
for (const list of lists) {
  const items = byList.get(list.id) || [];
  if (!items.length) continue;
  console.log(`\n📋 ${list.name} (${items.length})`);
  for (const c of items) {
    const lbls = (c.idLabels || []).map((id) => labelNameById[id]).filter(Boolean);
    console.log(`  • #${c.idShort} ${c.name}${lbls.length ? `  [${lbls.join(', ')}]` : ''}`);
  }
}
if (!filtered.length) console.log('(sin cards que coincidan)');
