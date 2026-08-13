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
 *     [--check-item "Criterio 1"] (repetible; también acepta comas: "A,B") \
 *     [--comment "Texto del comentario"] \
 *     [--ref "conv=<id>" --ref "#VIBES-92" --ref "rama@hash" ...]
 *
 * Busca la card por título exacto (case-insensitive). Si no existe, falla.
 *
 * --ref (repetible): anclas de trazabilidad card ↔ conversación ↔ repo
 * (regla §1.10.10 de AGENTS.md). Se anteponen al --comment como ref-line:
 *   🔗 Refs: conv=<id> | #VIBES-NN | <rama>@<hash> | contract=<c> | artifact=<ruta>
 * Claves conocidas: conv, card, branch, commit, contract, artifact.
 * Sin --comment pero con --ref, añade un comentario solo con la ref-line.
 */
import { resolveCard, updateCard, moveCard, resolveLabelIds, addComment, getChecklists, updateCheckItem, findListByName, getLists, buildRefLine } from './lib.mjs';

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
const checkItems = (() => {
  // Recoge TODOS los valores de --check-item (puede repetirse y/o llevar comas)
  const values = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--check-item' && args[i + 1]) {
      values.push(...args[i + 1].split(',').map((s) => s.trim()).filter(Boolean));
      i++; // salta el valor ya consumido
    }
  }
  return values;
})();
const comment = getArg('comment');
// --ref (repetible): anclas de trazabilidad; ver lib.mjs parseRefs/buildRefLine.
const refs = (() => {
  const values = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--ref' && args[i + 1]) {
      values.push(args[i + 1]);
      i++; // salta el valor ya consumido
    }
  }
  return values;
})();

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

if (checkItems.length) {
  const checklists = await getChecklists(card.id);
  // Indexa los items por nombre (lowercase) para resolver rápido y avisar de no encontrados
  const byName = new Map();
  for (const cl of checklists) {
    for (const item of cl.checkItems || []) {
      byName.set(item.name.toLowerCase(), item);
    }
  }
  for (const name of checkItems) {
    const item = byName.get(name.toLowerCase());
    if (!item) {
      console.warn(`⚠️  Item de checklist no encontrado: "${name}"`);
      continue;
    }
    await updateCheckItem(card.id, item.id, 'complete');
    console.log(`☑️  Checklist item completado: "${name}"`);
  }
}

const refLine = buildRefLine(refs);
if (comment || refLine) {
  // La ref-line (si existe) va SIEMPRE al inicio del comentario, separada
  // por línea en blanco del texto del comentario (regla §1.10.10).
  const body = comment ? unescape(comment) : '';
  const fullText = refLine && body ? `${refLine}\n\n${body}` : refLine || body;
  await addComment(card.id, fullText);
  console.log(refLine ? `💬 Comentario añadido (con ref-line)` : `💬 Comentario añadido`);
}

if (!newDesc && !moveTo && !labelAdd.length && !labelRemove.length && !checkItems.length && !comment && !refLine) {
  console.log(`ℹ️  Card "${cardName}" encontrada. Nada que actualizar (usa --desc, --move, --label-add, --check-item, --comment, --ref).`);
  console.log(`   ${card.url}`);
}
