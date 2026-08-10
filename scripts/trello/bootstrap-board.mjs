#!/usr/bin/env node
/**
 * bootstrap-board.mjs — Monta listas + cards iniciales en el board de Trello.
 *
 * Uso:
 *   node scripts/trello/bootstrap-board.mjs [--dry-run] [--force]
 *
 * - Idempotente: crea listas que falten y cards que no existan (por título).
 * - --dry-run: muestra qué haría sin tocar el board.
 * - --force:  si una card ya existe, la actualiza (desc, lista, labels) en vez de saltarla.
 *
 * Las cards iniciales se cargan desde ./cards.json.
 * Cada card puede llevar: desc (ejecutiva), checklist (criterios de aceptación)
 * y comments (bitácora técnica para el agente futuro).
 * Además, board_desc se escribe como descripción del board (leyenda).
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  api, getLists, getCards, findListByName, resolveLabelIds,
  createChecklist, addCheckItem, updateCard, getChecklists, addComment, getBoard,
} from './lib.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRY_RUN = process.argv.includes('--dry-run');
const FORCE = process.argv.includes('--force');

const CARDS_PATH = join(__dirname, 'cards.json');
if (!existsSync(CARDS_PATH)) {
  console.error(`❌ No existe ${CARDS_PATH}. Crea el JSON de cards primero.`);
  process.exit(1);
}

const seed = JSON.parse(readFileSync(CARDS_PATH, 'utf8'));

// 0. Descripción del board (leyenda) — solo si viene en el seed
if (seed.board_desc && !DRY_RUN) {
  const board = await getBoard();
  if (board.desc !== seed.board_desc) {
    await api(`/1/boards/${board.id}`, { desc: seed.board_desc }, 'PUT');
    console.log('📝 Descripción del board actualizada (leyenda).');
  } else {
    console.log('ℹ️  Descripción del board ya correcta.');
  }
} else if (seed.board_desc && DRY_RUN) {
  console.log('📝 [dry] Actualizaría la descripción del board (leyenda).');
}

// Listas objetivo (canónicas, en orden de izquierda a derecha)
// Estructura:
// • Done: trabajo cerrado y verificado (MVP + hardening)
// • To-do: pendiente inmediato (ops)
// • Backlog: deudas y roadmap post-MVP (fases 2-5)
// • Doing / Blocked / Review: flujo del agente
const LIST_ORDER = ['Backlog', 'To-do', 'Doing', 'Blocked', 'Review', 'Done'];
const LIST_ALIAS = {
  'backlog': 'Backlog',
  'ideas': 'Backlog',
  'todo': 'To-do',
  'to-do': 'To-do',
  'doing': 'Doing',
  'in progress': 'Doing',
  'blocked': 'Blocked',
  'review': 'Review',
  'done': 'Done',
};
const canonicalName = (n) => LIST_ALIAS[(n || '').trim().toLowerCase()] || (n || '').trim();

// 1. Normalizar listas existentes (alias → canónico)
const lists = await getLists();
for (const l of lists) {
  const canonical = canonicalName(l.name);
  if (canonical && canonical.toLowerCase() !== l.name.trim().toLowerCase()) {
    if (DRY_RUN) {
      console.log(`📋 [dry] Renombraría "${l.name}" → "${canonical}"`);
    } else {
      await api(`/1/lists/${l.id}`, { name: canonical }, 'PUT');
      console.log(`📋 Lista renombrada: "${l.name}" → "${canonical}"`);
    }
  }
}

// 2. Crear listas que falten
const listIds = {};
for (const name of LIST_ORDER) {
  const existing = await findListByName(name);
  if (existing) {
    listIds[name] = existing.id;
  } else if (DRY_RUN) {
    console.log(`📋 [dry] Crearía lista "${name}"`);
  } else {
    const nl = await api(`/1/boards/${(await import('./lib.mjs')).CONFIG.boardId}/lists`, { name }, 'POST');
    listIds[name] = nl.id;
    console.log(`📋 Lista creada: "${name}"`);
  }
}

if (DRY_RUN) {
  console.log('\n🏁 [dry-run] Nada más que hacer (no se tocó el board).');
  process.exit(0);
}

// 3. Cards
const existingCards = await getCards();
for (const seedCard of seed.cards || []) {
  const listName = canonicalName(seedCard.list) || 'To-do';
  const idList = listIds[listName];
  if (!idList) {
    console.warn(`⚠️  Lista "${listName}" no resuelta para card "${seedCard.title}" — se salta`);
    continue;
  }

  const labelIds = await resolveLabelIds(seedCard.labels || []);
  const existing = existingCards.find(
    (c) => c.name.toLowerCase() === seedCard.title.toLowerCase(),
  );

  if (existing && !FORCE) {
    console.log(`ℹ️  Ya existe: "${seedCard.title}" — se salta (usa --force para actualizar)`);
    continue;
  }

  if (existing && FORCE) {
    await updateCard(existing.id, {
      desc: seedCard.desc || '',
      idList,
      idLabels: [...new Set([...(existing.idLabels || []), ...labelIds])].join(','),
    });
    console.log(`🔄 [force] Actualizada: "${seedCard.title}" → ${listName}`);
    if (seedCard.checklist?.length) {
      const checklists = await getChecklists(existing.id);
      if (!checklists.length) {
        const cl = await createChecklist(existing.id, 'Criterios de aceptación');
        for (const item of seedCard.checklist) await addCheckItem(cl.id, item);
        console.log(`   Checklist añadido (${seedCard.checklist.length} items)`);
      }
    }
    continue;
  }

  const card = await api('/1/cards', { idList, name: seedCard.title, desc: seedCard.desc || '' }, 'POST');
  for (const labelId of labelIds) {
    await api(`/1/cards/${card.id}/idLabels`, { value: labelId }, 'POST');
  }
  console.log(`✅ Creada: "${seedCard.title}" → ${listName}`);

  if (seedCard.checklist?.length) {
    const cl = await createChecklist(card.id, 'Criterios de aceptación');
    for (const item of seedCard.checklist) await addCheckItem(cl.id, item);
    console.log(`   Checklist: ${seedCard.checklist.length} items`);
  }

  if (seedCard.comments?.length) {
    for (const comment of seedCard.comments) {
      await addComment(card.id, comment);
    }
    console.log(`   Comentarios: ${seedCard.comments.length}`);
  }
}

console.log('\n🏁 Bootstrap completado.');
