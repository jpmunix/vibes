# Worktrees — detección, creación y limpieza

> **CUÁNDO LEER ESTO:** Antes de **cualquier** operación git (`git status` cuenta). Ejecuta `git rev-parse --git-dir` y si la salida contiene `worktrees`, estás en uno.
>
> **ESENCIA (si no lees más):** Detecta siempre si estás en un worktree (`git rev-parse --git-dir` → contiene `worktrees`). Desde un worktree NUNCA se hace push, merge ni se borran ramas del repo principal. Para una card que toque **los dos repos** (carcasa + runtime), crea **un contenedor** `/home/munix/Desarrollo/GitRepo/vibes-<id>-<slug>/` con **dos worktrees hermanados** (`vibes/` y `core/`, misma rama). El `vibes/` resuelve el runtime por **cascada** (`VIBES_CORE_DIR` → `../core/packages` → `../vibes-core/packages`), así cada contenedor es una **copia arrancable completa**. Crear worktrees requiere OK explícito de munix. Worktrees sin movimiento en 3 días → reportar a munix, nunca borrar por libre.

El agente puede trabajar en un **worktree de git**: un checkout aislado del repo, con su propia rama y su propio working tree, pero compartiendo el `.git` (objetos, historial, remotes) del repo principal.

Vibes tiene **dos repos git independientes** que se consumen por **fuente TypeScript** (sin dist hasta la Fase 5): la carcasa `Vibes` y el runtime `vibes-core`. Los aliases `@vibes/*` de la carcasa se resuelven contra el runtime. Para que una card que toca los dos repos sea **probable sin pisar la rama madre**, usamos el **patrón contenedor**: un directorio con dos worktrees hermanados.

```
/home/munix/Desarrollo/GitRepo/
├── Vibes/                         # principal (rama feature/vibes-core)
├── vibes-core/                    # principal (rama main)
└── vibes-231-db-agnostico/        # ← CONTENEDOR de la card
    ├── vibes/                     # worktree carcasa (rama vibes-231-db-agnostico)
    └── core/                      # worktree runtime (rama vibes-231-db-agnostico)
```

Como son repos git independientes, la **misma rama** puede existir en ambos sin choque. Dentro del contenedor, el `vibes/` ve el runtime en `../core/packages` (hermano) — no hace falta env ni config: **cada contenedor es una copia arrancable completa**.

## Detección — SIEMPRE al empezar a trabajar

Antes de cualquier operación git, ejecutar:

```bash
git rev-parse --git-dir
```

- Si la salida **contiene `worktrees`** (p. ej. `.../.git/worktrees/<rama>`) → estás en un worktree.
- Si la salida es `.git` o una ruta normal → estás en el repo principal.

Otras señales: `.git` es un **archivo** (no un directorio) con una línea `gitdir: <ruta>` que apunta al gitdir real, y `git rev-parse --show-toplevel` apunta al worktree (no al repo principal).

> **No es automático que Antigravity meta al agente en un worktree** — puede estar trabajando directamente en el repo principal. La detección es obligatoria cada vez, no se asume.

## Resolución del runtime — cascada (Vibes/vitest/tsgo)

Los alias `@vibes/*` se resuelven en **cascada**, en este orden:

1. `VIBES_CORE_DIR` (env) — override explícito, para casos raros.
2. `../core/packages` — estructura contenedor: `/vibes-<card>/{vibes,core}` (el worktree de la carcasa ve el del runtime a su lado).
3. `../vibes-core/packages` — estructura plana actual / repo principal.

- **Vite/Vitest** usan `fs.existsSync` sobre los candidatos (miran `shared/package.json`) — ver [vite.vibes-aliases.mts](file:///home/munix/Desarrollo/GitRepo/Vibes/vite.vibes-aliases.mts) y [vitest.config.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/vitest.config.ts).
- **tsgo/tsc** usan los `paths` en [tsconfig.app.json](file:///home/munix/Desarrollo/GitRepo/Vibes/tsconfig.app.json): cada alias es un array de candidatos (`../core/...` primero, luego `../vibes-core/...`). TS prueba en orden y coge el primero que exista.

> [!NOTE]
> Con la cascada, **no hace falta `VIBES_CORE_DIR` en el flujo normal**: dentro del contenedor el `vibes/` resuelve solo contra `../core/packages`. El env es solo para overrides puntuales (p. ej. probar contra un core concreto fuera del contenedor).

## Reglas cuando se trabaja en un worktree

- El repo principal es el checkout normal (p. ej. `/home/munix/Desarrollo/GitRepo/Vibes`). **NUNCA** hacer push, merge, borrar ramas ni tocar el repo principal desde el worktree.
- Los commits locales en el worktree son seguros (viven en la rama del worktree). El `git push` y el merge siguen requiriendo OK explícito de munix (AGENTS.md §1.5).
- El worktree es un andamio desechable para la tarea: si munix pide fusionar, se fusiona y se elimina; si no le gusta, se descarta sin más.
- **En contenedor**, los dos worktrees (`vibes/` y `core/`) comparten el ciclo de vida: se crean, se trabajan y se limpian juntos.

## Integración del worktree — flujo real (sin PRs)

> **munix es el único developer del proyecto.** No se abren PRs ni se hace merge vía GitHub.
> El flujo de integración de un worktree es directo: **merge fast-forward en la RAMA MADRE + push**.

**RAMA DESTINO = la rama de la que nació el worktree** (la que estaba checkouteada en el repo principal al crearlo). NO es una rama fija hardcodeada: depende del repo.

| Repo | Rama de trabajo (destino de integración) |
|---|---|
| **Vibes** (carcasa) | `feature/vibes-core` |
| **vibes-core** (runtime) | `main` |

> [!IMPORTANT]
> Verificar SIEMPRE la rama madre real antes de integrar (es la que `git rev-parse --abbrev-ref HEAD` devuelve en el repo principal). No asumir el destino por el nombre del repo. **Concurrencia:** munix trabaja en varios worktrees a la vez. Si el ff-only falla porque la rama madre avanzó con los cambios de otro worktree, el agente **rebasea automáticamente** sobre la rama madre (conserva los cambios de los demás) y continúa. Solo **PARA y avisa** si el rebase produce **CONFLICTOS** — nunca resolver a lo bruto ni merge 3-way sin OK.

### Flujo de integración (manual, a pelo) — worktree suelto

```bash
# 1. Preflight en el worktree: verificar que tests pasan antes de integrar
cd <ruta-worktree>
npm test # o pnpm test / vitest según repo

# 2. Desde el repo principal (NUNCA desde el worktree):
cd <repo-principal>                        # Vibes o vibes-core
git switch <rama-madre>                    # Asegurar checkout de la rama destino (p. ej. feature/vibes-core o main)
test "$(git branch --show-current)" = "<rama-madre>"
git merge --ff-only <rama-worktree>        # p. ej. vibes-70-retry-semantico

# 3. Push de la rama madre:
git push origin <rama-madre>

# 4. Borrar la rama remota del worktree (solo si se llegó a pushear en working):
if git ls-remote --exit-code --heads origin <rama-worktree> >/dev/null 2>&1; then
  git push origin --delete <rama-worktree>
fi

# 5. Limpiar rama local + worktree (SIEMPRE en este orden: worktree ANTES que la rama):
git worktree remove <ruta-worktree>
git branch -d <rama-worktree>
```

### Flujo de integración (manual) — contenedor (dos repos)

Para evitar estados partidos si un repo falla, el flujo sigue este protocolo estricto:
1. **Preflight en ambos worktrees**: tests y verificación en verde antes de tocar los repos principales.
2. **Merges locales en ambos repos principales**: primero runtime, luego carcasa. Si el merge de la carcasa falla, `main` de core NO se ha pusheado y el rebase/fix se hace en local sin romper el remoto.
3. **Pushes de ambos repos principales**: primero runtime, luego carcasa.
4. **Limpieza del contenedor**: remove de ambos worktrees y delete de ramas locales.

```bash
# 1. PREFLIGHT (en los dos worktrees hermanos):
cd /home/munix/Desarrollo/GitRepo/vibes-<id>-<slug>/core && npm test
cd /home/munix/Desarrollo/GitRepo/vibes-<id>-<slug>/vibes && npm test

# 2. MERGES LOCALES (primero runtime, luego carcasa — SIN PUSH TODAVÍA):
cd /home/munix/Desarrollo/GitRepo/vibes-core
git switch main && test "$(git branch --show-current)" = "main"
git merge --ff-only vibes-<id>-<slug>

cd /home/munix/Desarrollo/GitRepo/Vibes
git switch feature/vibes-core && test "$(git branch --show-current)" = "feature/vibes-core"
git merge --ff-only vibes-<id>-<slug>

# 3. PUSHES ENCADENADOS (ambos merges locales ya están validados):
cd /home/munix/Desarrollo/GitRepo/vibes-core && git push origin main
cd /home/munix/Desarrollo/GitRepo/Vibes && git push origin feature/vibes-core

# 4. BORRAR RAMAS REMOTAS (solo si se llegaron a pushear en working):
if git -C /home/munix/Desarrollo/GitRepo/vibes-core ls-remote --exit-code --heads origin vibes-<id>-<slug> >/dev/null 2>&1; then
  git -C /home/munix/Desarrollo/GitRepo/vibes-core push origin --delete vibes-<id>-<slug>
fi
if git -C /home/munix/Desarrollo/GitRepo/Vibes ls-remote --exit-code --heads origin vibes-<id>-<slug> >/dev/null 2>&1; then
  git -C /home/munix/Desarrollo/GitRepo/Vibes push origin --delete vibes-<id>-<slug>
fi

# 5. LIMPIAR CONTENEDOR (ambos worktrees + rama local en cada repo):
cd /home/munix/Desarrollo/GitRepo/vibes-core
git worktree remove ../vibes-<id>-<slug>/core && git branch -d vibes-<id>-<slug>
cd /home/munix/Desarrollo/GitRepo/Vibes
git worktree remove ../vibes-<id>-<slug>/vibes && git branch -d vibes-<id>-<slug>
rm -rf /home/munix/Desarrollo/GitRepo/vibes-<id>-<slug>
```

> [!NOTE]
> **Orden del paso de limpieza:** `git worktree remove` ANTES que `git branch -d`. Git no deja borrar una rama que un worktree sigue usando.
> **Orden de integración:** runtime antes que carcasa — la carcasa en `feature/vibes-core` puede depender de tipos nuevos del runtime.

Consideraciones:
- **Fast-forward siempre**: el worktree cuelga de la punta de la rama madre (se creó derivado de esa rama). Si el ff-only falla porque la rama madre avanzó por **otro worktree concurrente**, **rebasear automáticamente** sobre la rama madre (conserva los cambios de los demás) y continuar; solo **parar y avisar a munix** si el rebase tiene **conflictos** (nunca merge 3-way ni resolver a lo bruto sin OK).
- **Commitea ANTES de integrar**: el rebase y el ff-only trabajan sobre commits — los cambios sin commitear del worktree deben commitearse primero.
- **La rama del worktree NUNCA se conserva viva** en remoto: si por trabajo en curso hubo que pushearla (`git push -u origin <rama>`), tras integrar se borra (paso 4) para no dejar ramas huérfanas.
- **Descarte** (munix dice "descarta"): `git worktree remove --force` de ambos hermanos + `git branch -D <rama>` en cada repo + `git push origin --delete` si se hubiera pusheado.
- **El estado del PR no existe**: la rama madre (`feature/vibes-core` en Vibes, `main` en vibes-core) es el destino final y la única rama que se mantiene en remoto.

## Al empezar una card — crear worktree SOLO si no se está ya en uno

1. **Detectar primero** (ver arriba).
2. **Si ya se está en un worktree** → usar ese como espacio aislado de la card. **No crear otro** (evitar duplicar worktrees para la misma tarea).
3. **Si NO se está en un worktree** (se está en el repo principal) y la **card toca los dos repos** → proponer crear el **contenedor** con los dos worktrees hermanados indicando explícitamente la rama base de cada repo principal (Vibes → `feature/vibes-core`, vibes-core → `main`):

   ```bash
   mkdir -p /home/munix/Desarrollo/GitRepo/vibes-<id>-<slug>

   # Worktree de la CARCASA (base explícita: feature/vibes-core):
   cd /home/munix/Desarrollo/GitRepo/Vibes
   git worktree add ../vibes-<id>-<slug>/vibes -b vibes-<id>-<slug> feature/vibes-core

   # Worktree del RUNTIME (base explícita: main):
   cd /home/munix/Desarrollo/GitRepo/vibes-core
   git worktree add ../vibes-<id>-<slug>/core -b vibes-<id>-<slug> main
   ```

4. **Si NO se está en un worktree** y la **card toca un solo repo** → proponer crear el worktree suelto de ese repo, especificando su rama base:

   ```bash
   # Desde el repo principal (Vibes con feature/vibes-core, o vibes-core con main):
   cd /home/munix/Desarrollo/GitRepo/Vibes
   git worktree add ../<ruta-worktree> -b vibes-<idShort>-<slug> feature/vibes-core
   ```

5. **Pedir OK explícito de munix cada vez** antes de ejecutar `git worktree add` + `git checkout -b` (es acción que crea ramas, AGENTS.md §1.5: requiere OK). No se crea por libre.
6. **Naming** sugerido para la rama y el contenedor: `vibes-<idShort>-<slug>` (limpio y trazable a la card), p. ej. `vibes-92-fix-permisos`. En contenedor, los dos worktrees comparten la rama y el nombre del contenedor es el de la rama.

> [!TIP]
> **Probar la app en el contenedor:**
> 1. Si el worktree de la carcasa es nuevo, instalar dependencias una vez: `cd /home/munix/Desarrollo/GitRepo/vibes-<id>-<slug>/vibes && npm install` (o enlazar `node_modules`).
> 2. Arrancar la app: `npm start` (o `npm run dev`).
> Compila contra `../core/packages` automáticamente — no hace falta tocar la rama madre ni `main`.

## Limpieza — prune de worktrees sin movimiento (regla de los 3 días)

- Si al inspeccionar el repo se detectan worktrees **sin movimiento en los últimos 3 días** (sin commits, sin cambios en el working tree), el agente **lo reporta a munix** con la lista y propone `git worktree remove` de los muertos.
- El agente **no borra worktrees por su cuenta**: primero avisa y espera OK (son acción destructiva, AGENTS.md §1.5). La excepción es el worktree de la tarea actual tras fusión/descarte aprobado por munix.
- **El prune cuenta el contenedor como unidad**: si el par `vibes/`+`core/` no ha tenido movimiento en 3 días, se reporta el contenedor entero.
- Para detectar worktrees sin movimiento:

  ```bash
  git worktree list
  git log -1 --format=%ci <rama>   # fecha del último commit de cada rama
  ```

> **Por qué:** el trabajo en paralelo con muchos agentes genera worktrees/ramas efímeros. Sin limpieza, se acumulan y el repo se convierte en un cementerio. Un worktree sin movimiento en 3 días es basura o una tarea atascada que hay que reportar, no conservar.

## Checklist de cumplimiento

- [ ] ¿He ejecutado `git rev-parse --git-dir` antes de la primera operación git?
- [ ] Si estoy en un worktree: ¿me he abstenido de push/merge/borrado de ramas sobre el repo principal?
- [ ] ¿He propuesto el contenedor (`vibes/` + `core/`) cuando la card toca los dos repos, y el worktree suelto cuando toca uno?
- [ ] ¿He propuesto crear el/los worktree(s) especificando rama base explícita y esperé el OK explícito de munix antes de ejecutar?
- [ ] ¿La rama del worktree deriva de la rama madre correspondiente (`feature/vibes-core` en Vibes, `main` en vibes-core)?
- [ ] ¿En contenedor, el `vibes/` resuelve el runtime contra `../core/packages` (no necesito `VIBES_CORE_DIR`)?
- [ ] ¿He ejecutado preflight en ambos worktrees y verificado ambos merges locales antes de hacer push en ninguno?
- [ ] ¿He revisado worktrees sin movimiento en 3 días y los he reportado (sin borrar por libre)?
