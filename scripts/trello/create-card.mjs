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
 *     [--checklist "Criterio 1|Criterio 2|..."]
 *
 * Si ya existe una card con el mismo título, la lista en vez de duplicar
 * y avisa por stdout para que el agente decida.
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
const card = await createCard({ name: title, desc: unescape(desc), idList: list.id, labels: labelIds });
console.log(`✅ Card creada: "${title}" → ${card.url}`);

if (checklist.length) {
  const cl = await createChecklist(card.id, 'Criterios de aceptación');
  for (const item of checklist) {
    await addCheckItem(cl.id, item);
  }
  console.log(`   Checklist "${cl.name}" con ${checklist.length} items`);
}
