#!/usr/bin/env node
/**
 * ag-chats.mjs — Consulta conversaciones de Antigravity desde CLI.
 *
 * Replica la lógica de lectura del tracker del proxy de Antigravity
 * (antigravity-proxy/proxy/src/antigravity-tracker.ts) para poder listar
 * los chats de un proyecto (p. ej. "Vibes") y leer el transcript de cada uno,
 * desde un LLM o desde el móvil, sin abrir Antigravity.
 *
 * SOLO LECTURA: no borra ni modifica nada del workspace de Antigravity.
 *
 * Por defecto, `list` muestra los chats de los workspaces activos del repo Vibes:
 * Vibes, arneses (sin corpus, detectado por workspaceUri) y vibes-core.
 *
 * Uso:
 *   node scripts/ag-chats.mjs list                                # los 3 workspaces activos (Vibes, arneses, vibes-core)
 *   node scripts/ag-chats.mjs list --all                          # todos los proyectos del workspace
 *   node scripts/ag-chats.mjs list --project <nombre>             # otro proyecto (p. ej. cinco-villas)
 *   node scripts/ag-chats.mjs list --archived                     # solo archivadas
 *   node scripts/ag-chats.mjs list --active                       # solo activas
 *   node scripts/ag-chats.mjs show <cascadeId>                    # transcript completo
 *   node scripts/ag-chats.mjs show <cascadeId> --type USER_INPUT  # solo mensajes de usuario
 *   node scripts/ag-chats.mjs show <cascadeId> --steps            # incluye todos los pasos
 *
 * Dependencias: CLI `sqlite3` del sistema (sin dependencias nativas de node).
 * En Linux: `apt install sqlite3` (o ya viene preinstalado en casi todas las distros).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// ── Paths ──
const agBase = path.join(os.homedir(), '.gemini', 'antigravity');
const conversationsDir = path.join(agBase, 'conversations');
const brainDir = path.join(agBase, 'brain');
const summariesPb = path.join(agBase, 'agyhub_summaries_proto.pb');

// Filtro por defecto: los workspaces activos del repo Vibes (mCode).
// arneses no tiene corpus, se detecta por workspaceUri que termine en /arneses.
const DEFAULT_PROJECTS = ['Vibes', 'arneses', 'vibes-core'];

// ── SQLite CLI helper ──
// Wraps the system `sqlite3` CLI. Returns parsed rows (objects) or raw bytes
// for blob queries.

function sqliteJson(dbPath, sql) {
  const out = execFileSync('sqlite3', ['-readonly', '-json', dbPath, sql], {
    maxBuffer: 256 * 1024 * 1024,
    encoding: 'utf-8',
  });
  try {
    return out.trim() ? JSON.parse(out) : [];
  } catch {
    return [];
  }
}

function sqliteValue(dbPath, sql) {
  const out = execFileSync('sqlite3', ['-readonly', '-batch', dbPath, sql], {
    maxBuffer: 256 * 1024 * 1024,
    encoding: 'utf-8',
  });
  return out.replace(/\|$/, '').replace(/^Bang$/, '').trim();
}

function sqliteBlobHex(dbPath, sql) {
  const out = execFileSync(
    'sqlite3',
    ['-readonly', '-batch', '-noheader', '-separator', '', dbPath, sql],
    { maxBuffer: 512 * 1024 * 1024, encoding: 'utf-8' }
  );
  // The blob may come back as X'HEX...' literal; handle both forms.
  const trimmed = out.trim();
  const m = trimmed.match(/^X'([0-9A-Fa-f]*)'/);
  if (m) return Buffer.from(m[1], 'hex');
  // Fallback: assume raw bytes already returned (we used noheader).
  // Strip leading '|' separator if present.
  return Buffer.from(trimmed.replace(/^\|/, ''), 'hex');
}

// ── Protobuf helpers (schema-less wire-type walker) ──

function readVarint(buf, pos) {
  let result = 0;
  let shift = 0;
  while (pos < buf.length) {
    const b = buf[pos++];
    result |= (b & 0x7f) << shift;
    if (!(b & 0x80)) return [result, pos];
    shift += 7;
  }
  return [result, pos];
}

function decodeProto(buf, depth = 0, maxDepth = 12) {
  const fields = [];
  let pos = 0;
  while (pos < buf.length) {
    let tag;
    [tag, pos] = readVarint(buf, pos);
    const fieldNo = tag >> 3;
    const wireType = tag & 0x7;

    if (wireType === 0) {
      let val;
      [val, pos] = readVarint(buf, pos);
      fields.push([fieldNo, wireType, val]);
    } else if (wireType === 1) {
      if (pos + 8 > buf.length) break;
      fields.push([fieldNo, wireType, buf.subarray(pos, pos + 8)]);
      pos += 8;
    } else if (wireType === 2) {
      let length;
      [length, pos] = readVarint(buf, pos);
      if (pos + length > buf.length) break;
      const data = buf.subarray(pos, pos + length);
      pos += length;

      // Try string first
      if (length > 0 && length < 50000) {
        try {
          const s = data.toString('utf-8');
          if (s.length > 0 && [...s].every((c) => (c.charCodeAt(0) > 31 && c.charCodeAt(0) < 127) || c === '\n' || c === '\t' || c === '\r')) {
            fields.push([fieldNo, wireType, s]);
            continue;
          }
        } catch { /* not utf-8 */ }
      }

      // Try recursing into submessage
      if (depth < maxDepth && length > 0) {
        const sub = decodeProto(data, depth + 1, maxDepth);
        if (sub.length > 0) {
          fields.push([fieldNo, wireType, sub]);
          continue;
        }
      }
      fields.push([fieldNo, wireType, Buffer.from(data)]);
    } else if (wireType === 5) {
      if (pos + 4 > buf.length) break;
      fields.push([fieldNo, wireType, buf.subarray(pos, pos + 4)]);
      pos += 4;
    } else {
      break;
    }
  }
  return fields;
}

function findAt(fields, pathArray) {
  let cur = fields;
  for (let i = 0; i < pathArray.length - 1; i++) {
    let next = null;
    for (const [f, w, v] of cur) {
      if (f === pathArray[i] && w === 2 && Array.isArray(v)) {
        next = v;
        break;
      }
    }
    if (!next) return null;
    cur = next;
  }
  const target = pathArray[pathArray.length - 1];
  for (const [f, w, v] of cur) {
    if (f === target) return { w, v };
  }
  return null;
}

function getStr(fields, ...pathArray) {
  const r = findAt(fields, pathArray);
  if (r && r.w === 2 && typeof r.v === 'string') return r.v;
  return undefined;
}

function getInt(fields, ...pathArray) {
  const r = findAt(fields, pathArray);
  if (r && r.w === 0 && typeof r.v === 'number') return r.v;
  return undefined;
}

function walkFirstText(fields, minLen = 50) {
  for (const [f, w, v] of fields) {
    if (w === 2 && typeof v === 'string' && v.length >= minLen) {
      if (v.startsWith('$') || v.startsWith('file:') || v.startsWith('file://')) continue;
      if (v.includes('://', 0) && v.indexOf('://') < 30) continue;
      return v;
    }
    if (w === 2 && Array.isArray(v)) {
      const r = walkFirstText(v, minLen);
      if (r) return r;
    }
  }
  return undefined;
}

// ── Read archived map from .pb index ──
// In the .pb, each top-level f1 (wt2) submessage holds a ConversationSummary.
// Within it, field 1 (string) is the cascade_id, field 2 (wt2) is the summary,
// and the "active" marker is field 21 (varint=1) inside field 2.
// If field 21 == 1 -> NOT archived. If absent -> archived.

// summaryIndex keyed by cascadeId -> { archived: boolean, summary: string|null }.
// Antigravity genera el "summary" automaticamente para cada chat; es el nombre
// que se muestra en el panel izquierdo (p. ej. "Workspace Conversation Access",
// "Reference OpenSource Projects"). Tambien expone el estado archivado.
//
// En el .pb: cada top-level f1 (wt2) es un ConversationSummary con:
//   f1 (string) = cascade_id
//   f2 (wt2) = submessage con f1 (string) = summary, f21 (varint=1) = active
// Si falta f21 -> archivada.

let summaryIndex = null;
let summaryIndexTs = 0;

function readSummaryIndex() {
  if (!fs.existsSync(summariesPb)) return new Map();
  try {
    const buf = fs.readFileSync(summariesPb);
    const map = new Map();
    let pos = 0;

    while (pos < buf.length) {
      let tag, fno, wt;
      [tag, pos] = readVarint(buf, pos);
      fno = tag >> 3;
      wt = tag & 7;

      if (fno === 1 && wt === 2) {
        let len;
        [len, pos] = readVarint(buf, pos);
        if (pos + len > buf.length) break;
        const payload = buf.subarray(pos, pos + len);
        pos += len;

        let cascadeId = null;
        let summary = null;
        let active = false;
        let p = 0;
        while (p < payload.length) {
          let t2, fno2, wt2;
          [t2, p] = readVarint(payload, p);
          fno2 = t2 >> 3;
          wt2 = t2 & 7;
          if (wt2 === 0) {
            let v;
            [v, p] = readVarint(payload, p);
          } else if (wt2 === 1) {
            p += 8;
          } else if (wt2 === 2) {
            let l2;
            [l2, p] = readVarint(payload, p);
            const data = payload.subarray(p, p + l2);
            p += l2;
            if (fno2 === 1) {
              cascadeId = data.toString('utf-8');
            } else if (fno2 === 2) {
              let q = 0;
              while (q < data.length) {
                let t3, fn3, wt3;
                [t3, q] = readVarint(data, q);
                fn3 = t3 >> 3;
                wt3 = t3 & 7;
                if (wt3 === 0) {
                  let v;
                  [v, q] = readVarint(data, q);
                  if (fn3 === 21) active = v === 1;
                } else if (wt3 === 1) {
                  q += 8;
                } else if (wt3 === 2) {
                  let l3;
                  [l3, q] = readVarint(data, q);
                  const inner = data.subarray(q, q + l3);
                  q += l3;
                  if (fn3 === 1) {
                    try { summary = inner.toString('utf-8'); } catch { /* keep null */ }
                  }
                } else if (wt3 === 5) {
                  q += 4;
                } else {
                  break;
                }
              }
            }
          } else if (wt2 === 5) {
            p += 4;
          } else {
            break;
          }
        }
        if (cascadeId) {
          map.set(cascadeId, { archived: !active, summary: summary || null });
        }
      } else {
        if (wt === 0) { let _; [_, pos] = readVarint(buf, pos); }
        else if (wt === 1) { pos += 8; }
        else if (wt === 2) { let l; [l, pos] = readVarint(buf, pos); pos += l; }
        else if (wt === 5) { pos += 4; }
        else break;
      }
    }
    return map;
  } catch (e) {
    console.warn(`[ag-chats] could not read summary index: ${e?.message}`);
    return new Map();
  }
}

function getSummaryIndex() {
  let mtime = 0;
  try {
    if (fs.existsSync(summariesPb)) mtime = fs.statSync(summariesPb).mtimeMs;
  } catch { /* ignore */ }
  if (!summaryIndex || mtime !== summaryIndexTs) {
    summaryIndex = readSummaryIndex();
    summaryIndexTs = mtime;
  }
  return summaryIndex;
}

// ── Read trajectory_metadata_blob (protobuf) for a .db ──
function readTrajectoryBlob(dbPath) {
  try {
    const hex = sqliteBlobHex(dbPath, "SELECT hex(data) FROM trajectory_metadata_blob WHERE id = 'main'");
    return hex.length > 0 ? hex : null;
  } catch {
    return null;
  }
}

// ── Read step_payload (protobuf) for a step index ──
function readStepPayload(dbPath, idx) {
  try {
    const hex = sqliteBlobHex(dbPath, `SELECT hex(step_payload) FROM steps WHERE idx = ${idx} LIMIT 1`);
    return hex.length > 0 ? hex : null;
  } catch {
    return null;
  }
}

// ── Fallback: derive title from first few step_payload blobs ──
function titleFromStepPayload(dbPath, stepCount) {
  if (!stepCount) return undefined;
  for (let i = 0; i < Math.min(stepCount, 30); i++) {
    const hex = readStepPayload(dbPath, i);
    if (!hex) continue;
    try {
      const fields = decodeProto(hex);
      const msg = walkFirstText(fields);
      if (msg) return msg.split('\n')[0];  // primera línea completa, sin truncar
    } catch { /* keep trying */ }
  }
  return undefined;
}

// ── Scan a single .db ──
function scanOneDb(dbPath, cascadeId, summaryRef) {
  try {
    const stat = fs.statSync(dbPath);
    const entry = {
      cascadeId,
      title: undefined,
      project: undefined,
      workspaceUri: undefined,
      corpusName: undefined,
      gitRemote: undefined,
      gitBranch: undefined,
      model: undefined,
      createdAt: undefined,
      lastActivity: undefined,
      stepCount: 0,
      transcriptLines: undefined,
      fileSizeKb: Math.floor(stat.size / 1024),
      parentRoots: undefined,
      archived: summaryRef.get(cascadeId)?.archived ?? false,
      summary: summaryRef.get(cascadeId)?.summary ?? null,
      // summary = nombre autogenerado del chat por Antigravity (visible en el panel izquierdo).
      // Puede venir del .pb (pre-resuelto en `_si`) o del transcript como fallback.
    };

    // trajectory_meta
    const metaRows = sqliteJson(dbPath, 'SELECT trajectory_id FROM trajectory_meta LIMIT 1');
    if (metaRows[0]?.trajectory_id) entry.trajectoryId = metaRows[0].trajectory_id;

    // trajectory_metadata_blob
    const blob = readTrajectoryBlob(dbPath);
    if (blob) {
      const fields = decodeProto(blob);
      const ts = getInt(fields, 2, 1);
      if (ts) entry.createdAt = new Date(ts * 1000).toISOString();

      entry.workspaceUri = getStr(fields, 1, 1) ?? getStr(fields, 7);
      entry.corpusName = getStr(fields, 1, 3, 1);
      entry.gitRemote = getStr(fields, 1, 3, 2);
      entry.gitBranch = getStr(fields, 1, 4);
    }


    // step count
    const countRows = sqliteJson(dbPath, 'SELECT COUNT(*) as c FROM steps');
    entry.stepCount = countRows[0]?.c ?? 0;

    // executor_metadata -> model
    try {
      const emHex = sqliteBlobHex(dbPath, 'SELECT hex(data) FROM executor_metadata ORDER BY idx DESC LIMIT 1');
      if (emHex.length > 0) {
        const emFields = decodeProto(emHex);
        entry.model = getStr(emFields, 10, 1, 28);
      }
    } catch { /* executor_metadata may not exist */ }

    // parent_references
    try {
      const refRows = sqliteJson(dbPath, 'SELECT hex(data) as hex FROM parent_references');
      if (refRows.length > 0) {
        entry.parentRoots = [];
        for (const row of refRows) {
          if (!row.hex) continue;
          const pFields = decodeProto(Buffer.from(row.hex, 'hex'));
          const pUuid = getStr(pFields, 1);
          if (pUuid) entry.parentRoots.push(pUuid);
        }
      }
    } catch { /* parent_references may not exist */ }

    // Derive project name
    if (entry.workspaceUri?.startsWith('file://')) {
      const p = entry.workspaceUri.replace('file://', '');
      entry.project = p.split('/').pop() || p;
    }

    // transcript.jsonl for title + last activity
    const transcriptPath = path.join(brainDir, cascadeId, '.system_generated', 'logs', 'transcript.jsonl');
    if (fs.existsSync(transcriptPath)) {
      try {
        const content = fs.readFileSync(transcriptPath, 'utf-8');
        const lines = content.split('\n').filter((l) => l.trim());
        entry.transcriptLines = lines.length;

        // El titulo de una conversacion es el summary autogenerado por Antigravity
        // (visible en el panel izquierdo, p. ej. "Workspace Conversation Access").
        // Ya viene de `entry.summary` (.pb). Si falta usamos el primer USER_INPUT
        // del transcript como fallback.
        if (!entry.summary) {
          for (const line of lines) {
            try {
              const obj = JSON.parse(line);
              if (obj.type === 'USER_INPUT') {
                let msgContent = obj.content || '';
                if (msgContent.includes('<USER_REQUEST>')) {
                  msgContent = msgContent.split('<USER_REQUEST>')[1]?.split('</USER_REQUEST>')[0]?.trim() || msgContent;
                }
                entry.summary = msgContent.split('\n')[0];
                break;
              }
            } catch { /* skip bad lines */ }
          }
        }
        entry.title = entry.summary;

        if (lines.length > 0) {
          try {
            const last = JSON.parse(lines[lines.length - 1]);
            entry.lastActivity = last.created_at;
          } catch { /* ignore */ }
        }
      } catch { /* read error */ }
    }

    // Fallback title from step_payload (solo si no hay summary ni transcript)
    if (!entry.title) {
      entry.title = titleFromStepPayload(dbPath, entry.stepCount);
    }

    return entry;
  } catch {
    return null;
  }
}

// ── Scan all conversations ──
function scanAll() {
  if (!fs.existsSync(conversationsDir)) return [];
  const files = fs.readdirSync(conversationsDir).filter(
    (f) => f.endsWith('.db') && !f.endsWith('-shm') && !f.endsWith('-wal')
  );
  const archived = getSummaryIndex();
  const results = [];
  for (const file of files) {
    const cascadeId = file.replace('.db', '');
    const dbPath = path.join(conversationsDir, file);
    const entry = scanOneDb(dbPath, cascadeId, archived);
    if (entry) results.push(entry);
  }
  results.sort((a, b) => {
    const aTime = a.lastActivity || a.createdAt || '';
    const bTime = b.lastActivity || b.createdAt || '';
    return bTime.localeCompare(aTime);
  });
  return results;
}

// ── Project matching ──
function matchesProject(entry, projectNames) {
  const corpus = (entry.corpusName || '').toLowerCase();
  const uri = (entry.workspaceUri || '').toLowerCase();
  const corpusTail = corpus ? corpus.split('/').pop() : '';
  const uriTail = uri.startsWith('file://') ? uri.replace('file://', '').split('/').pop() : '';

  for (const name of projectNames) {
    const target = name.toLowerCase();
    // Exact match on the trailing segment of a "owner/name" corpus.
    // (workspaces sin corpus como "arneses" quedan cubiertos solo por uri).
    if (corpusTail && corpusTail === target) return true;
    // Exact match on the trailing path segment of a file:// workspace uri.
    if (uriTail && uriTail === target) return true;
  }
  return false;
}

// ── CLI argument parsing ──
function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [key, ...valParts] = a.slice(2).split('=');
      const val =
        valParts.length
          ? valParts.join('=')
          : argv[i + 1] && !argv[i + 1].startsWith('--')
            ? argv[++i]
            : true;
      args[key] = val;
    } else {
      args._.push(a);
    }
  }
  return args;
}

// ── Commands ──

function printHelp() {
  console.log(`ag-chats.mjs — Consulta conversaciones de Antigravity (solo lectura)

Uso:
  # Por defecto lista los workspaces activos del repo Vibes:
  # Vibes (corpus jpmunix/vibes), arneses (sin corpus, por workspaceUri) y vibes-core.
  node scripts/ag-chats.mjs list

  # Todos los proyectos del workspace
  node scripts/ag-chats.mjs list --all

  # Otro proyecto concreto (puede ser uno o varios separados por coma)
  node scripts/ag-chats.mjs list --project cinco-villas
  node scripts/ag-chats.mjs list --project cinco-villas,totem-admin

  # Filtrar por estado
  node scripts/ag-chats.mjs list --archived
  node scripts/ag-chats.mjs list --active

  # Leer una conversación concreta (cascadeId del list)
  node scripts/ag-chats.mjs show <cascadeId>
  node scripts/ag-chats.mjs show <cascadeId> --type USER_INPUT
  node scripts/ag-chats.mjs show <cascadeId> --steps

Salida en JSON. El cascadeId se obtiene del comando "list".`);
}

function cmdList(args) {
  const all = args.all === true;
  // Por defecto filtra por los workspaces activos del repo Vibes.
  // --project acepta uno o varios (separados por coma) para forzar otros proyectos.
  let projects = DEFAULT_PROJECTS;
  if (args.project !== undefined && typeof args.project === 'string') {
    projects = args.project.split(',').map((s) => s.trim()).filter(Boolean);
  }
  const archivedOnly = args.archived === true;
  const activeOnly = args.active === true;

  const allConvs = scanAll();
  let convs = allConvs;
  if (!all) convs = convs.filter((c) => matchesProject(c, projects));
  if (archivedOnly) convs = convs.filter((c) => c.archived);
  if (activeOnly) convs = convs.filter((c) => !c.archived);

  const groups = new Map();
  for (const c of convs) {
    const name = c.project || '(sin proyecto)';
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(c);
  }

  const result = [];
  for (const [name, list] of groups) {
    const totalSteps = list.reduce((s, c) => s + c.stepCount, 0);
    const totalSizeKb = list.reduce((s, c) => s + c.fileSizeKb, 0);
    const archivedCount = list.filter((c) => c.archived).length;
    const lastActivity = list.map((c) => c.lastActivity || c.createdAt || '').sort().reverse()[0] || undefined;
    result.push({
      project: name,
      workspaceUri: list.find((c) => c.workspaceUri)?.workspaceUri,
      corpusName: list.find((c) => c.corpusName)?.corpusName,
      conversationCount: list.length,
      totalSteps,
      totalSizeKb,
      archivedCount,
      lastActivity,
      conversations: list.map((c) => ({
        cascadeId: c.cascadeId,
        trajectoryId: c.trajectoryId,
        title: c.title,
        project: c.project,
        workspaceUri: c.workspaceUri,
        corpusName: c.corpusName,
        gitRemote: c.gitRemote,
        gitBranch: c.gitBranch,
        model: c.model,
        createdAt: c.createdAt,
        lastActivity: c.lastActivity,
        stepCount: c.stepCount,
        transcriptLines: c.transcriptLines,
        fileSizeKb: c.fileSizeKb,
        parentRoots: c.parentRoots,
        archived: c.archived,
      })),
    });
  }

  result.sort((a, b) => (b.lastActivity || '').localeCompare(a.lastActivity || ''));
  console.log(JSON.stringify(result, null, 2));
}

function cmdShow(args) {
  const cascadeId = args._[0] && args._[0] !== 'show' ? args._[0] : args._[1];
  if (!cascadeId) {
    console.error('Falta cascadeId. Uso: node scripts/ag-chats.mjs show <cascadeId>');
    process.exit(1);
  }

  const typeFilter = args.type && args.type !== true ? args.type : null;
  const showSteps = args.steps === true;

  const transcriptPath = path.join(brainDir, cascadeId, '.system_generated', 'logs', 'transcript.jsonl');
  if (!fs.existsSync(transcriptPath)) {
    console.error(`No hay transcript para ${cascadeId}`);
    process.exit(1);
  }

  const entries = [];
  const content = fs.readFileSync(transcriptPath, 'utf-8');
  for (const line of content.split('\n').filter((l) => l.trim())) {
    try {
      const obj = JSON.parse(line);
      if (typeFilter && obj.type !== typeFilter) continue;
      if (!showSteps && (obj.type === 'CONVERSATION_HISTORY' || obj.type === 'SYSTEM')) continue;
      entries.push(obj);
    } catch { /* skip bad lines */ }
  }

  const _si = getSummaryIndex().get(cascadeId) || {};
  const archived = _si.archived ?? false;
  const summary = _si.summary ?? null;

  console.log(
    JSON.stringify(
      {
        cascadeId,
        archived,
        summary,
        entryCount: entries.length,
        entries,
      },
      null,
      2
    )
  );
}

// ── Entry point ──

function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];

  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    printHelp();
    return;
  }

  if (cmd === 'list') {
    cmdList(args);
  } else if (cmd === 'show') {
    cmdShow(args);
  } else {
    console.error(`Comando desconocido: ${cmd}`);
    printHelp();
    process.exit(1);
  }
}

main();
