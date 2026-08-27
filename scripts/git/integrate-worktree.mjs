#!/usr/bin/env node
/**
 * integrate-worktree.mjs — Integra un worktree en la rama madre y lo limpia.
 *
 * La rama del worktree es un andamio desechable. Este script hace el flujo
 * completo de integración en la rama de la que nació el worktree (la rama
 * checkouteada en el repo principal), y luego borra todos los restos:
 *
 *   1. Verifica que NO estás dentro de un worktree (nunca integrar desde uno).
 *   2. Comprueba que la rama madre es ancestro de la rama del worktree (ff-only).
 *   3. `git merge --ff-only <rama>` en la rama madre.
 *   4. `git push origin <rama-madre>`.
 *   5. Borra la rama remota del worktree (`git push origin --delete <rama>`).
 *   6. `git branch -d <rama>` + `git worktree remove <ruta>`.
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
 * Seguridad:
 *   - Se NUNCA ejecuta desde un worktree (error).
 *   - Si el ff-only falla (la rama madre avanzó), PARA y avisa — nunca merge 3-way.
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
    if (lines[i] === `branch refs/heads/${branch}` && lines[i - 1]?.startsWith('worktree ')) {
      return lines[i - 1].slice('worktree '.length);
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
  process.stdout.write('¿Continuar? (s/N): ');
  let resp = 'n';
  try {
    resp = execSync('read -r line && echo "$line"', { stdio: [0, 'pipe', 'ignore'], encoding: 'utf8' }).trim().toLowerCase();
  } catch { /* EOF */ }
  if (resp !== 's' && resp !== 'y') {
    console.log('❌ Cancelado.');
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

// Verificar ff-only: la rama madre debe ser ancestro de la rama del worktree.
const isAncestor = (() => {
  try {
    git(['merge-base', '--is-ancestor', mainBranch, branch], cwd);
    return true;
  } catch {
    return false;
  }
})();
if (!isAncestor) {
  console.error(`❌ '${mainBranch}' NO es ancestro de '${branch}' → merge NO es fast-forward.`);
  console.error('   La rama madre avanzó por otro lado. PARA y avisa a munix — nunca merge 3-way.');
  process.exit(1);
}

// 1. Merge ff-only
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
