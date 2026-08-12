#!/usr/bin/env node
/**
 * create-card.mjs — Crea una card en el board (idempotente: no duplica por título).
 *
 * Uso:
 *   node scripts/trello/create-card.mjs \
 *     --title "Título" \
 *     --desc "Descripción" \
 *     [--list "To Do"] \
 *     [--labels fase-2,deuda] \
 *     [--checklist "Criterio 1|Criterio 2|..."] \
 *     [--pos top]                # posición en la lista: top (default) | bottom | número
 *
 * Si ya existe una card con el mismo título, la lista en vez de duplicar
 * y avisa por stdout para que el agente decida.
 *
 * Política de posición: por defecto 'top' — toda card nueva va arriba del todo
 * de la lista destino (consistente con update-card.mjs, que también va al top).
 */
import { findListByName, resolveCard, createCard, resolveLabelIds, createChecklist, addCheckItem, moveCard, getLists } from './lib.mjs';

const args = process.argv.slice(2);
const getArg = (name) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : undefined;
};

const title = getArg('title');
const desc = getArg('desc') || '';
const listName = getArg('list') || 'To Do';
const labels = (getArg('labels') || '').split(',').map((s) => s.trim()).filter(Boolean);
const checklist = (getArg('checklist') || '').split('|').map((s) => s.trim()).filter(Boolean);
// Posición al crear: 'top' (default, primera), 'bottom' o número (1 = primera).
const posRaw = getArg('pos') ?? 'top';
let posNorm;
if (typeof posRaw === 'string') {
  const lc = posRaw.toLowerCase();
  if (lc === 'top' || lc === 'bottom') {
    posNorm = lc;
  } else if (/^-?\d+(\.\d+)?$/.test(posRaw)) {
    posNorm = Number(posRaw);
  } else {
    console.error(`❌ --pos "${posRaw}" no válido. Usa "top", "bottom" o un número.`);
    process.exit(1);
  }
}

if (!title) {
  console.error('❌ Falta --title');
  process.exit(1);
}

// Idempotencia: si existe, avisar y salir sin duplicar
const existing = await resolveCard(title);
if (existing) {
  console.log(`ℹ️  Ya existe una card "${title}" (#${existing.idShort}, ${existing.url}). No se duplica.`);
  process.exit(0);
}

const list = await findListByName(listName);
if (!list) {
  const lists = await getLists();
  console.error(`❌ Lista "${listName}" no encontrada. Listas: ${lists.map((l) => l.name).join(', ')}`);
  process.exit(1);
}

// Convierte \n literal (que bash no expande al pasar argumentos) a salto real
const unescape = (s) => (s || '').replace(/\\n/g, '\n').replace(/\\t/g, '\t');

const labelIds = await resolveLabelIds(labels);
const card = await createCard({ name: title, desc: unescape(desc), idList: list.id, labels: labelIds, pos: posNorm });
const posLabel = posNorm === 'top' ? ' (primera)' : posNorm === 'bottom' ? ' (última)' : ` (pos=${posNorm})`;
console.log(`✅ Card creada: "${title}" → ${card.url}${posLabel}`);

if (checklist.length) {
  const cl = await createChecklist(card.id, 'Criterios de aceptación');
  for (const item of checklist) {
    await addCheckItem(cl.id, item);
  }
  console.log(`   Checklist "${cl.name}" con ${checklist.length} items`);
}
