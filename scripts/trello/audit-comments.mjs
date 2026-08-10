#!/usr/bin/env node
/**
 * audit-comments.mjs — Audita los comentarios y descripciones del board en busca de
 * anomalías (típicamente: \n literal en lugar de saltos reales).
 *
 * Bug cazado: cuando se invoca bash con `--comment "línea1\nlínea2"`, bash NO
 * expande \n — los dos caracteres \ y n llegan literales a Trello y se pintan
 * así. Este script detecta esos casos y, con --fix, los reescribe.
 *
 * Uso:
 *   node scripts/trello/audit-comments.mjs              # reporte humano
 *   node scripts/trello/audit-comments.mjs --json       # reporte machine-readable
 *   node scripts/trello/audit-comments.mjs --fix        # reescribe los comentarios rotos
 *   node scripts/trello/audit-comments.mjs --concurrency 5  # Nº de cards en paralelo
 *
 * Tipos de anomalía:
 *   - escape_literal_n: el texto contiene los 2 caracteres \ y n seguidos
 *   - escape_literal_t: el texto contiene \t literal
 *   - empty_comment: comentario con texto vacío
 *
 * Por qué 1 sola pasada se siente lenta: la API de Trello no permite filtrar
 *   acciones por board, así que hay que pedir /cards/{id}/actions por cada card.
 *   Limitamos la concurrencia para no toparnos con 429 (rate limit).
 */
import { getLists, getCards, getCardComments, updateComment, updateCard } from './lib.mjs';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const fix = args.includes('--fix');
const concIx = args.indexOf('--concurrency');
const concurrency = concIx !== -1 ? Number(args[concIx + 1]) || 5 : 5;

const ANOMALY_PATTERNS = [
  { type: 'escape_literal_n', re: /\\n/g, label: '\\n literal (no salto real)' },
  { type: 'escape_literal_t', re: /\\t/g, label: '\\t literal (no tab real)' },
];

function findAnomalies(text) {
  if (!text) return [];
  const found = [];
  for (const p of ANOMALY_PATTERNS) {
    const m = text.match(p.re);
    if (m) found.push({ type: p.type, count: m.length });
  }
  return found;
}

function unescape(text) {
  return (text || '').replace(/\\n/g, '\n').replace(/\\t/g, '\t');
}

// Iterador con concurrencia limitada (no Promise.all de 71 cards, que revienta 429)
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

const lists = await getLists();
const cards = await getCards();
const total = cards.length;
console.log(`🔍 Auditando ${total} cards (concurrency=${concurrency})...`);

const findings = await pMap(
  cards.map((c) => ({ ...c, listName: lists.find((l) => l.id === c.idList)?.name || '?' })),
  async (card) => {
    const issues = [];
    // Descripción
    const descAnomalies = findAnomalies(card.desc);
    if (descAnomalies.length) {
      issues.push({ kind: 'desc', anomalies: descAnomalies, text: card.desc });
    }
    // Comentarios
    const comments = await getCardComments(card.id);
    for (const cm of comments) {
      if (!cm.text || cm.text.trim() === '') {
        issues.push({ kind: 'comment_empty', commentId: cm.id, anomalies: [{ type: 'empty', count: 1 }] });
        continue;
      }
      const a = findAnomalies(cm.text);
      if (a.length) {
        issues.push({ kind: 'comment', commentId: cm.id, anomalies: a, text: cm.text });
      }
    }
    return { cardId: card.id, listName: card.listName, name: card.name, issues };
  },
  concurrency,
);

const withIssues = findings.filter((f) => f.issues.length > 0);
const totalAnomalies = withIssues.reduce((acc, f) => acc + f.issues.length, 0);

if (asJson) {
  console.log(JSON.stringify({ total, cardsWithIssues: withIssues.length, findings: withIssues }, null, 2));
} else {
  console.log(`\n📊 Resultado: ${totalAnomalies} anomalías en ${withIssues.length} cards.`);
  if (withIssues.length === 0) {
    console.log('✅ Todo limpio.');
  } else {
    console.log('');
    for (const f of withIssues) {
      console.log(`⚠️  ${f.listName} | ${f.name}`);
      for (const issue of f.issues) {
        const label = issue.anomalies.map((a) => `${a.type}×${a.count}`).join(', ');
        if (issue.kind === 'desc') {
          console.log(`    · desc: ${label}`);
        } else if (issue.kind === 'comment_empty') {
          console.log(`    · comment ${issue.commentId}: VACÍO`);
        } else {
          console.log(`    · comment ${issue.commentId}: ${label}`);
        }
      }
    }
    if (fix) {
      console.log('\n🔧 Aplicando --fix...');
      for (const f of withIssues) {
        for (const issue of f.issues) {
          if (issue.kind === 'desc') {
            const fixed = unescape(issue.text);
            await updateCard(f.cardId, { desc: fixed });
            console.log(`   ✏️  ${f.name}: desc corregida`);
          } else if (issue.kind === 'comment') {
            const fixed = unescape(issue.text);
            await updateComment(issue.commentId, fixed);
            console.log(`   ✏️  ${f.name}: comment ${issue.commentId} corregido`);
          }
        }
      }
      console.log('\n✅ Fix aplicado. Vuelve a auditar para confirmar.');
    } else {
      console.log('\n💡 Vuelve con --fix para corregir automáticamente.');
    }
  }
}
