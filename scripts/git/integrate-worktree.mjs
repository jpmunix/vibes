#!/usr/bin/env node
/**
 * integrate-worktree.mjs — Integra un worktree en la rama madre y lo limpia.
 *
 * La rama del worktree es un andamio desechable. Este script hace el flujo
 * completo de integración en la rama de la que nació el worktree (la rama
 * checkouteada en el repo principal), y luego borra todos los restos:
 *
 *   1. Verifica que NO estás dentro de un worktree (nunca integrar desde uno).
 *   2. Comprueba si la rama madre es ancestro de la rama del worktree (ff-only).
 *   3. Si NO lo es (la rama madre avanzó por otro worktree concurrente), hace
 *      `git rebase <rama-madre>` en la rama del worktree para coger los cambios
 *      de los demás, y luego ff-only. Solo PARA si el rebase tiene conflictos.
 *   4. `git merge --ff-only <rama>` en la rama madre.
 *   5. `git push origin <rama-madre>`.
 *   6. Borra la rama remota del worktree (`git push origin --delete <rama>`).
 *   7. `git branch -d <rama>` + `git worktree remove <ruta>`.
 *
 * Uso:
 *   node scripts/git/integrate-worktree.mjs --branch <rama-worktree> [--cwd <repo>]
 *
 * Opciones:
 *   --branch <rama>   Rama del worktree a integrar (obligatorio).
 *   --cwd <repo>      Repo principal (default: el directorio actual, si no es worktree).
 *   --force           Modo "descarta": borra worktree + rama local (-D) + remota sin merge.
 *   --yes             No preguntar confirmación (ideal para uso del agente).
 *
 * Confirmación:
 *   Sin --yes el script pide confirmación en terminal. El prompt tiene un
 *   TIMEOUT de 10s: si no llega respuesta (agente en background sin TTY/teclado),
 *   se CANCELA solo — nunca se cuelga leyendo stdin. Para uso no interactivo
 *   (el agente) se usa SIEMPRE --yes: sin --yes en background el prompt
 *   expira a los 10s y aborta la integración.
 *
 * Seguridad:
 *   - Se NUNCA ejecuta desde un worktree (error).
 *   - Trabajo concurrente: si ff-only falla, rebasea automáticamente sobre la
 *     rama madre (los cambios de otros worktrees se conservan). Solo PARÁ y
 *     avisa si el rebase tiene CONFLICTOS (nunca se resuelven a lo bruto).
 *   - Si --force y la rama no está mergeada, usa `branch -D` (descartar sin merge).
 *
 * ⚠️  Requiere OK explícito de munix antes de ejecutarlo (acción de repo, §1.5).
 *   El agente lo usa cuando munix dice "sube" / "integra" / "haz el push".
 */
import { execFileSync, execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// ---- helpers ----------------------------------------------------------------

function git(args, cwd) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (err) {
    const msg = err.stderr?.toString?.().trim() || err.message;
    throw new Error(`git ${args.join(' ')} falló:\n${msg}`);
  }
}

function isWorktree(cwd) {
  try {
    const gitDir = git(['rev-parse', '--git-dir'], cwd);
    return gitDir.includes('worktrees');
  } catch {
    return false; // no es repo git
  }
}

function worktreePathFor(branch, cwd) {
  const lines = git(['worktree', 'list', '--porcelain'], cwd).split('\n');
  for (let i = 0; i < lines.length; i++) {
    // En el porcelain, la secuencia por worktree es:
    //   worktree <ruta>
    //   HEAD <sha>
    //   branch refs/heads/<rama>
    // La ruta está DOS líneas antes de la rama, no una.
    if (lines[i] === `branch refs/heads/${branch}` && lines[i - 2]?.startsWith('worktree ')) {
      return lines[i - 2].slice('worktree '.length);
    }
  }
  return undefined;
}

// ---- args -------------------------------------------------------------------

const args = process.argv.slice(2);
const getArg = (name) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : undefined;
};
const hasFlag = (name) => args.includes(`--${name}`);

const branch = getArg('branch');
const cwd = resolve(getArg('cwd') ?? process.cwd());
const force = hasFlag('force');
const autoYes = hasFlag('yes');

if (!branch) {
  console.error('❌ Falta --branch <rama-worktree>. Uso:');
  console.error('   node scripts/git/integrate-worktree.mjs --branch <rama> [--cwd <repo>] [--force] [--yes]');
  process.exit(1);
}
if (!existsSync(resolve(cwd, '.git'))) {
  console.error(`❌ ${cwd} no parece un repo git (sin .git).`);
  process.exit(1);
}
if (isWorktree(cwd)) {
  console.error(`❌ ${cwd} es un WORKTREE. Nunca se integra desde un worktree — usa el repo principal.`);
  process.exit(1);
}

// ---- detección de la rama madre --------------------------------------------

const mainBranch = git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
console.log(`ℹ️  Repo principal: ${cwd} (rama: ${mainBranch})`);

// ---- verificar que la rama del worktree existe -----------------------------

const localBranches = git(['branch', '--format', '%(refname:short)'], cwd).split('\n').filter(Boolean);
if (!localBranches.includes(branch)) {
  console.error(`❌ La rama local '${branch}' no existe. ¿Ya se integró? Nada que hacer.`);
  process.exit(0);
}
console.log(`ℹ️  Rama del worktree encontrada: ${branch}`);

// ---- confirmación -----------------------------------------------------------

if (!autoYes) {
  const accion = force ? 'DESCARTAR' : 'INTEGRAR en';
  console.log(`\n⚠️  Acción: ${accion} ${force ? 'la rama' : `'${branch}' en '${mainBranch}'`}.`);

  // Prompt con TIMEOUT: si no llega una respuesta en 10s (p. ej. agente en
  // background sin humano al teclado), se cancela en vez de colgarse para
  // siempre leyendo stdin. Uso no interactivo → --yes es el camino limpio.
  const { createInterface } = await import('node:readline');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  let resp = 'n';
  try {
    resp = await new Promise((resolve) => {
      const timer = setTimeout(() => { try { rl.close(); } catch {} resolve('timeout'); }, 10_000);
      rl.question('¿Continuar? (s/N): ', (answer) => { clearTimeout(timer); try { rl.close(); } catch {} resolve(answer); });
    });
  } finally { try { rl.close(); } catch {} }
  if (String(resp).trim().toLowerCase() !== 's' && String(resp).trim().toLowerCase() !== 'y') {
    if (resp === 'timeout') console.log('⏱️  Sin respuesta en 10s — cancelado (usa --yes si no es interactivo).');
    else console.log('❌ Cancelado.');
    process.exit(0);
  }
}

// ---- modo DESCARTAR (--force) ----------------------------------------------

if (force) {
  const wtPath = worktreePathFor(branch, cwd);
  if (wtPath) {
    console.log(`🗑️  Descartando worktree ${wtPath}...`);
    git(['worktree', 'remove', '--force', wtPath], cwd);
  }
  console.log(`🗑️  Borrando rama local '${branch}' (-D)...`);
  git(['branch', '-D', branch], cwd);
  try {
    console.log(`🗑️  Borrando rama remota origin/${branch} (si existe)...`);
    git(['push', 'origin', '--delete', branch], cwd);
  } catch { /* la remota no existía — ok */ }
  console.log(`✅ Rama '${branch}' descartada y limpia.`);
  process.exit(0);
}

// ---- modo INTEGRAR ----------------------------------------------------------

// Verificar si ff-only es posible: la rama madre debe ser ancestro de la rama.
const isAncestor = (() => {
  try {
    git(['merge-base', '--is-ancestor', mainBranch, branch], cwd);
    return true;
  } catch {
    return false;
  }
})();

if (!isAncestor) {
  // Trabajo concurrente: la rama madre avanzó (p. ej. otro worktree se integró
  // antes). NO paramos: rebaseamos la rama del worktree sobre la rama madre
  // para coger los cambios de los demás, y luego el ff-only pasa. Solo paramos
  // si el rebase produce conflictos (ahí sí hay que resolver a mano).
  console.log(`ℹ️  ${mainBranch} avanzó — rebase de '${branch}' sobre '${mainBranch}' (cambios concurrentes)...`);
  const wtPath = worktreePathFor(branch, cwd);
  if (wtPath) {
    // El worktree SÍ existe: la rama está checked out ahí. Hacer el rebase
    // DENTRO del worktree (git -C <wt> rebase) sin checkout desde el repo
    // principal (git lo rechaza: "branch already used by worktree").
    try {
      git(['rebase', mainBranch], wtPath);
    } catch (err) {
      // Rebase con conflictos: abortar DENTRO del worktree, parar y avisar.
      // El worktree conserva los commits sin rebasear; la rama madre no se tocó.
      git(['rebase', '--abort'], wtPath).catch?.(() => {});
      console.error(`❌ El rebase de '${branch}' sobre '${mainBranch}' tuvo CONFLICTOS.`);
      console.error('   No se resuelve automáticamente — PARAR y avisar a munix.');
      console.error(`   El worktree (${wtPath}) conserva los cambios sin rebasear. Resuelve los conflictos manualmente y re-ejecuta el script.`);
      process.exit(1);
    }
    console.log(`   → '${branch}' rebaseado sobre ${mainBranch} (dentro de ${wtPath})`);
  } else {
    // Edge case: la rama local existe pero no tiene worktree (ya se eliminó
    // a mano, p. ej. worktree remove manual). Entonces sí se puede checkoutear
    // desde el repo principal (nadie la tiene en uso).
    const prevHead = git(['rev-parse', '--short', 'HEAD'], cwd);
    git(['checkout', branch], cwd);
    try {
      git(['rebase', mainBranch], cwd);
    } catch (err) {
      git(['rebase', '--abort'], cwd).catch?.(() => {});
      git(['checkout', mainBranch], cwd);
      console.error(`❌ El rebase de '${branch}' sobre '${mainBranch}' tuvo CONFLICTOS.`);
      console.error('   No se resuelve automáticamente — PARAR y avisar a munix.');
      console.error(`   Estado previo restaurado (${mainBranch} en ${prevHead}). La rama '${branch}' sigue con sus cambios sin rebasear.`);
      process.exit(1);
    }
    console.log(`   → '${branch}' rebaseado sobre ${mainBranch}`);
    git(['checkout', mainBranch], cwd);
  }
}

// 1. Merge ff-only (ahora debe pasar, o ya es ancestro directo o tras rebase)
console.log(`🔀 Integrando '${branch}' en '${mainBranch}' (ff-only)...`);
git(['merge', '--ff-only', branch], cwd);
const newHead = git(['rev-parse', '--short', 'HEAD'], cwd);
console.log(`   → ${mainBranch} ahora en ${newHead}`);

// 2. Push de la rama madre
console.log(`⬆️  Push de '${mainBranch}' a origin...`);
git(['push', 'origin', mainBranch], cwd);
console.log(`   → origin/${mainBranch} actualizado`);

// 3. Borrar rama remota del worktree (si se hubiera pusheado)
try {
  console.log(`🗑️  Borrando rama remota origin/${branch}...`);
  git(['push', 'origin', '--delete', branch], cwd);
} catch {
  console.log(`   (origin/${branch} no existía — ok)`);
}

// 4. Limpiar rama local + worktree
const wtPath = worktreePathFor(branch, cwd);
if (wtPath) {
  console.log(`🗑️  Eliminando worktree ${wtPath}...`);
  git(['worktree', 'remove', wtPath], cwd);
}
console.log(`🗑️  Borrando rama local '${branch}'...`);
git(['branch', '-d', branch], cwd);

console.log(`\n✅ Integración completa:`);
console.log(`   - ${mainBranch} → ${newHead} (pusheado a origin)`);
console.log(`   - Rama del worktree '${branch}' eliminada (local + remota)`);
console.log(`   - Worktree eliminado`);
