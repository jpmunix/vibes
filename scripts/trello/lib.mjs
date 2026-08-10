#!/usr/bin/env node
/**
 * lib.mjs — Cliente base de la API de Trello (Node nativo, sin dependencias).
 *
 * Carga credenciales desde:
 *   1. Variables de entorno (TRELLO_API_KEY, TRELLO_TOKEN, TRELLO_BOARD_ID)
 *   2. Fichero `.env.trello` en la raíz del repo (formato KEY=valor, una por línea)
 *
 * Nota de seguridad: el `.env.trello` NO está en .gitignore por decisión de munix
 * (portabilidad entre ordenadores). El repositorio es privado.
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = join(__dirname, '..', '..', '.env.trello');

/** Carga KEY=valor del fichero .env.trello si existe (sin pisar env ya definidas). */
function loadDotEnv() {
  if (!existsSync(ENV_PATH)) return;
  const content = readFileSync(ENV_PATH, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

loadDotEnv();

export const CONFIG = {
  apiKey: process.env.TRELLO_API_KEY,
  token: process.env.TRELLO_TOKEN,
  boardId: process.env.TRELLO_BOARD_ID,
};

export function requireAuth() {
  if (!CONFIG.apiKey || !CONFIG.token) {
    console.error('❌ Faltan TRELLO_API_KEY y/o TRELLO_TOKEN. Defínelas en env o en .env.trello.');
    process.exit(1);
  }
}

/**
 * Llamada a la API de Trello.
 * @param {string} path  Ruta tipo "/1/boards/{id}/lists" (sin query).
 * @param {object} params  Parámetros de query (se les añade key+token).
 * @param {string} method  GET | POST | PUT | DELETE
 * @param {object} [body]  Cuerpo para POST/PUT.
 * @returns {Promise<any>} JSON de respuesta.
 */
export async function api(path, params = {}, method = 'GET', body) {
  requireAuth();
  const url = new URL(`https://api.trello.com${path}`);
  url.searchParams.set('key', CONFIG.apiKey);
  url.searchParams.set('token', CONFIG.token);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }

  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (res.status === 429 && attempt < maxAttempts) {
      const retryAfter = Number(res.headers.get('Retry-After')) || 2 ** attempt;
      console.warn(`⚠️ Rate limit (429). Reintentando en ${retryAfter}s (intento ${attempt}/${maxAttempts})...`);
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      continue;
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Trello API ${method} ${path} → ${res.status}: ${text.slice(0, 500)}`);
    }
    return res.json();
  }
  throw new Error(`Rate limit persistente en ${path}`);
}

/* ---------- Helpers de alto nivel ---------- */

export async function getLists() {
  return api(`/1/boards/${CONFIG.boardId}/lists`, { fields: 'id,name,pos,closed' });
}

export async function getCards(listId) {
  const params = { fields: 'id,name,desc,idList,idLabels,url,dateLastActivity,idShort' };
  if (listId) params.idList = listId;
  return api(`/1/boards/${CONFIG.boardId}/cards`, params);
}

export async function getLabels() {
  return api(`/1/boards/${CONFIG.boardId}/labels`, { fields: 'id,name,color' });
}

export async function getBoard() {
  return api(`/1/boards/${CONFIG.boardId}`, { fields: 'id,name,desc,url' });
}

export async function createCard({ name, desc = '', idList, labels = [] }) {
  const card = await api('/1/cards', { idList, name, desc }, 'POST');
  for (const labelId of labels) {
    await api(`/1/cards/${card.id}/idLabels`, { value: labelId }, 'POST');
  }
  return card;
}

export async function updateCard(id, fields) {
  return api(`/1/cards/${id}`, fields, 'PUT');
}

export async function moveCard(id, idList) {
  return updateCard(id, { idList });
}

export async function addComment(id, text) {
  return api(`/1/cards/${id}/actions/comments`, { text }, 'POST');
}

export async function getCardComments(cardId) {
  const actions = await api(`/1/cards/${cardId}/actions`, { filter: 'commentCard' });
  return actions.map((a) => ({
    id: a.id,
    text: a.data?.text || '',
    date: a.date,
  }));
}

export async function updateComment(actionId, text) {
  return api(`/1/actions/${actionId}`, { text }, 'PUT');
}

export async function deleteComment(actionId) {
  return api(`/1/actions/${actionId}`, {}, 'DELETE');
}

export async function createChecklist(cardId, name) {
  return api('/1/checklists', { idCard: cardId, name }, 'POST');
}

export async function getChecklists(cardId) {
  return api(`/1/cards/${cardId}/checklists`, { fields: 'id,name,checkItems' });
}

export async function addCheckItem(checklistId, name) {
  return api(`/1/checklists/${checklistId}/checkItems`, { name }, 'POST');
}

export async function updateCheckItem(cardId, checkItemId, state) {
  // state: 'complete' | 'incomplete'
  return api(`/1/cards/${cardId}/checkItem/${checkItemId}`, { state }, 'PUT');
}

/** Busca una lista por nombre (case-insensitive). Devuelve la lista o undefined. */
export async function findListByName(name) {
  const lists = await getLists();
  return lists.find((l) => l.name.toLowerCase() === name.toLowerCase());
}

/** Busca una card por nombre exacto en el board (case-insensitive). */
export async function findCardByName(name) {
  const cards = await getCards();
  return cards.find((c) => c.name.toLowerCase() === name.toLowerCase());
}

/**
 * Busca una card por su número de display (idShort = el "92" que muestra el
 * power-up como #VIBES-92 en la imagen de la card). El shortId "sQM17O2M" no
 * funciona aquí — el power-up lee idShort.
 */
export async function findCardByNumber(number) {
  const n = Number(number);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`Número inválido: ${number}`);
  }
  // La API de Trello no acepta filter por idShort (devuelve 400), así que
  // pedimos las cards con idShort en fields y filtramos en cliente.
  const cards = await api(`/1/boards/${CONFIG.boardId}/cards`, {
    fields: 'id,name,desc,idList,idLabels,url,dateLastActivity,idShort',
  });
  return cards.find((c) => c.idShort === n);
}

/**
 * Resuelve una card por referencia flexible: acepta
 *   - "#92" o "92" (idShort, el número que muestra el power-up)
 *   - "sQM17O2M" (shortId de la URL)
 *   - "B7: ... (fin del hardcode)" (título exacto, case-insensitive)
 * Devuelve la card o undefined. Útil para que los scripts acepten el formato
 * que le resulte más cómodo al usuario (convención git: #VIBES-92).
 */
export async function resolveCard(ref) {
  if (!ref) return undefined;
  const s = String(ref).trim();
  // 1. Short id de la URL (8 chars alfanuméricos)
  if (/^[a-zA-Z0-9]{8}$/.test(s)) {
    try {
      const card = await api(`/1/cards/${s}`, { fields: 'id,name,desc,idList,idLabels,url,dateLastActivity,idShort' });
      if (card) return card;
    } catch { /* no existe con ese shortId, seguimos */ }
  }
  // 2. Número (#92 o 92)
  const m = s.match(/^#?(\d+)$/);
  if (m) {
    const card = await findCardByNumber(m[1]);
    if (card) return card;
  }
  // 3. Título (case-insensitive, primero exacto, luego prefix)
  const exact = await findCardByName(s);
  if (exact) return exact;
  // 4. Fallback: prefix/contains (útil cuando el título tiene timestamps/sufijos)
  const cards = await getCards();
  const lower = s.toLowerCase();
  return (
    cards.find((c) => c.name.toLowerCase().startsWith(lower)) ||
    cards.find((c) => c.name.toLowerCase().includes(lower))
  );
}

/** Resuelve una lista de nombres de label → ids. Crea los que falten. */
export async function resolveLabelIds(labelNames = []) {
  if (!labelNames.length) return [];
  // El short-id del board (ej. "YFE2Kkjv") falla en POST /1/labels → usar id largo
  const board = await getBoard();
  const existing = await getLabels();
  const ids = [];
  for (const name of labelNames) {
    let label = existing.find((l) => l.name.toLowerCase() === name.toLowerCase());
    if (!label) {
      label = await api('/1/labels', { idBoard: board.id, name, color: 'blue' }, 'POST');
      existing.push(label);
    }
    ids.push(label.id);
  }
  return ids;
}
