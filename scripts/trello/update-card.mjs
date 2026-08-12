#!/usr/bin/env node
/**
 * update-card.mjs — Actualiza una card existente (descripción, lista, labels, checklist).
 *
 * Uso:
 *   node scripts/trello/update-card.mjs --card "Título" \
 *     [--desc "Nueva descripción"] \
 *     [--move "Done"] \
 *     [--label-add "fase-3"] \
 *     [--label-remove "fase-2"] \
 *     [--check-item "Criterio 1"] \
 *     [--comment "Texto del comentario"]
 *
 * Busca la card por título exacto (case-insensitive). Si no existe, falla.
 */
import { resolveCard, updateCard, moveCard, resolveLabelIds, addComment, getChecklists, updateCheckItem, findListByName, getLists } from './lib.mjs';

const args = process.argv.slice(2);
const getArg = (name) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : undefined;
};

const cardName = getArg('card');
const newDesc = getArg('desc');
const moveTo = getArg('move');
// Posición al mover: 'top' (default, primera), 'bottom', o número (1 = primera).
// Si la card ya estaba en la lista destino, igualmente se reordena al top.
const movePos = getArg('pos') ?? 'top';
const labelAdd = (getArg('label-add') || '').split(',').map((s) => s.trim()).filter(Boolean);
const labelRemove = (getArg('label-remove') || '').split(',').map((s) => s.trim()).filter(Boolean);
const checkItem = getArg('check-item');
const comment = getArg('comment');

if (!cardName) {
  console.error('❌ Falta --card');
  process.exit(1);
}

const card = await resolveCard(cardName);
if (!card) {
  console.error(`❌ No existe ninguna card con ref "${cardName}" (probé #N, shortId, y título).`);
  process.exit(1);
}
if (card.name !== cardName && !/^\d+$/.test(String(cardName).replace(/^#/, ''))) {
  console.log(`ℹ️  Resuelto "${cardName}" → "${card.name}" (#${card.idShort})`);
}

// Convierte secuencias de escape que el usuario escribe literalmente en CLI
// (\n, \t) a sus caracteres reales, ya que bash NO las expande al pasar argumentos.
function unescape(s) {
  return s.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
}

if (newDesc !== undefined) {
  await updateCard(card.id, { desc: unescape(newDesc) });
  console.log(`✏️  Descripción actualizada`);
}

if (moveTo) {
  const list = await findListByName(moveTo);
  if (!list) {
    const lists = await getLists();
    console.error(`❌ Lista "${moveTo}" no encontrada. Listas: ${lists.map((l) => l.name).join(', ')}`);
    process.exit(1);
  }
  // Normaliza el valor de --pos: 'top', 'bottom' o número. Cualquier otra cosa falla.
  let posNorm;
  if (typeof movePos === 'string') {
    const lc = movePos.toLowerCase();
    if (lc === 'top' || lc === 'bottom') {
      posNorm = lc;
    } else if (/^-?\d+(\.\d+)?$/.test(movePos)) {
      posNorm = Number(movePos);
    } else {
      console.error(`❌ --pos "${movePos}" no válido. Usa "top", "bottom" o un número.`);
      process.exit(1);
    }
  }
  await moveCard(card.id, list.id, posNorm);
  const posLabel = posNorm === 'top' ? ' (primera)' : posNorm === 'bottom' ? ' (última)' : ` (pos=${posNorm})`;
  console.log(`➡️  Movida a "${list.name}"${posLabel}`);
}

if (labelAdd.length) {
  const ids = await resolveLabelIds(labelAdd);
  const current = card.idLabels || [];
  const merged = [...new Set([...current, ...ids])];
  await updateCard(card.id, { idLabels: merged.join(',') });
  console.log(`🏷️  Labels añadidos: ${labelAdd.join(', ')}`);
}

if (labelRemove.length) {
  const current = card.idLabels || [];
  const labels = await (await import('./lib.mjs')).getLabels();
  const removeIds = labelRemove.map(
    (n) => labels.find((l) => l.name.toLowerCase() === n.toLowerCase())?.id,
  ).filter(Boolean);
  const remaining = current.filter((id) => !removeIds.includes(id));
  await updateCard(card.id, { idLabels: remaining.join(',') });
  console.log(`🏷️  Labels quitados: ${labelRemove.join(', ')}`);
}

if (checkItem) {
  const checklists = await getChecklists(card.id);
  // Busca el item en todas las checklists de la card
  for (const cl of checklists) {
    for (const item of cl.checkItems || []) {
      if (item.name.toLowerCase() === checkItem.toLowerCase()) {
        await updateCheckItem(card.id, item.id, 'complete');
        console.log(`☑️  Checklist item completado: "${checkItem}"`);
      }
    }
  }
}

if (comment) {
  await addComment(card.id, unescape(comment));
  console.log(`💬 Comentario añadido`);
}

if (!newDesc && !moveTo && !labelAdd.length && !labelRemove.length && !checkItem && !comment) {
  console.log(`ℹ️  Card "${cardName}" encontrada. Nada que actualizar (usa --desc, --move, --label-add, --check-item, --comment).`);
  console.log(`   ${card.url}`);
}
