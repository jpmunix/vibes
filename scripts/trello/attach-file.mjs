#!/usr/bin/env node
/**
 * attach-file.mjs — Adjunta ficheros locales a una card existente.
 *
 * Uso:
 *   node scripts/trello/attach-file.mjs --card "Título" \
 *     --file "./captura.png,./plan.pdf" \
 *     [--name "Nombre visible"]
 *
 * Busca la card por ref flexible (título exacto case-insensitive, #N, o
 * shortId). Límite por adjunto: 10 MB (API de Trello). --name (opcional)
 * renombra el adjunto (aplica a todos los ficheros).
 */
import { attachFile, resolveCard } from './lib.mjs';

const args = process.argv.slice(2);
const getArg = (name) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : undefined;
};

const cardName = getArg('card');
const files = (getArg('file') || '').split(',').map((s) => s.trim()).filter(Boolean);
const name = getArg('name');

if (!cardName) {
  console.error('❌ Falta --card (título, #N o shortId de la card)');
  process.exit(1);
}
if (!files.length) {
  console.error('❌ Falta --file (ruta del fichero a adjuntar; varios separados por coma)');
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

for (const file of files) {
  try {
    const attachment = await attachFile(card.id, file, name);
    const kb = (attachment.bytes || 0) / 1024;
    console.log(`📎 Adjunto subido: ${attachment.name} (${kb.toFixed(0)} KB)`);
    console.log(`   ${attachment.url}`);
  } catch (err) {
    console.error(`❌ ${err.message}`);
    process.exit(1);
  }
}
