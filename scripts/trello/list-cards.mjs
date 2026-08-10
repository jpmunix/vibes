#!/usr/bin/env node
/**
 * list-cards.mjs — Lista las cards del board (para que el agente elija qué tocar).
 *
 * Uso:
 *   node scripts/trello/list-cards.mjs                     # todas, agrupadas por lista
 *   node scripts/trello/list-cards.mjs --list "To Do"      # solo una lista
 *   node scripts/trello/list-cards.mjs --label "fase-2"    # filtrar por label
 *   node scripts/trello/list-cards.mjs --json              # salida JSON (para el agente)
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
const asJson = hasFlag('json');

const [lists, cards, labels] = await Promise.all([getLists(), getCards(), getLabelIds()]);

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

if (asJson) {
  const out = filtered.map((c) => ({
    id: c.id,
    name: c.name,
    list: lists.find((l) => l.id === c.idList)?.name || null,
    labels: (c.idLabels || []).map((id) => labelNameById[id]).filter(Boolean),
    url: c.url,
  }));
  console.log(JSON.stringify(out, null, 2));
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
    console.log(`  • ${c.name}${lbls.length ? `  [${lbls.join(', ')}]` : ''}`);
  }
}
if (!filtered.length) console.log('(sin cards que coincidan)');
