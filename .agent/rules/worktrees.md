# Worktrees — detección, creación y limpieza

> **CUÁNDO LEER ESTO:** Antes de **cualquier** operación git (`git status` cuenta). Ejecuta `git rev-parse --git-dir` y si la salida contiene `worktrees`, estás en uno.
>
> **ESENCIA (si no lees más):** Detecta siempre si estás en un worktree (`git rev-parse --git-dir` → contiene `worktrees`). Desde un worktree NUNCA se hace push, merge ni se borran ramas del repo principal. Crear un worktree nuevo requiere OK explícito de munix, y se deriva de la rama checkouteada en el repo principal (no siempre `main`). Worktrees sin movimiento en 3 días → reportar a munix, nunca borrar por libre.

El agente puede trabajar en un **worktree de git**: un checkout aislado del repo, con su propia rama y su propio working tree, pero compartiendo el `.git` (objetos, historial, remotes) del repo principal.

## Detección — SIEMPRE al empezar a trabajar

Antes de cualquier operación git, ejecutar:

```bash
git rev-parse --git-dir
```

- Si la salida **contiene `worktrees`** (p. ej. `.../.git/worktrees/<rama>`) → estás en un worktree.
- Si la salida es `.git` o una ruta normal → estás en el repo principal.

Otras señales: `.git` es un **archivo** (no un directorio) con una línea `gitdir: <ruta>` que apunta al gitdir real, y `git rev-parse --show-toplevel` apunta al worktree (no al repo principal).

> **No es automático que Antigravity meta al agente en un worktree** — puede estar trabajando directamente en el repo principal. La detección es obligatoria cada vez, no se asume.

## Reglas cuando se trabaja en un worktree

- El repo principal es el checkout normal (p. ej. `/home/munix/Desarrollo/GitRepo/Vibes`). **NUNCA** hacer push, merge, borrar ramas ni tocar el repo principal desde el worktree.
- Los commits locales en el worktree son seguros (viven en la rama del worktree). El `git push` y el merge siguen requiriendo OK explícito de munix (AGENTS.md §1.5).
- El worktree es un andamio desechable para la tarea: si munix pide fusionar, se fusiona y se elimina; si no le gusta, se descarta sin más.

## Integración del worktree — flujo real (sin PRs)

> **munix es el único developer del proyecto.** No se abren PRs ni se hace merge vía GitHub. El flujo de integración de un worktree es directo: **merge fast-forward en `feature/vibes-core` + push**, ejecutado por el agente cuando munix lo pide explícitamente ("haz el push", "integra el worktree" o similar).

```bash
# 1. Desde el repo principal (NUNCA desde el worktree):
cd /home/munix/Desarrollo/GitRepo/Vibes
git merge --ff-only <rama-worktree>        # p. ej. vibes-204-auditoria-ui

# 2. Push de la rama principal:
git push origin feature/vibes-core
```

Consideraciones:
- **Fast-forward siempre**: el worktree cuelga de la punta de `feature/vibes-core` (se creó derivado de esa rama). Si el ff-only falla (el main avanzó por otro lado), **parar y avisar a munix** — nunca hacer merge con 3-way sin OK.
- **Push de la rama del worktree**: si se pusheó la rama del worktree (p. ej. `git push -u origin vibes-204-auditoria-ui`), tras integrarla en `feature/vibes-core` se **borra la rama remota** del worktree (`git push origin --delete <rama-worktree>`) para no dejar ramas huérfanas.
- **Eliminar el worktree local** tras integrar: `git worktree remove <ruta-worktree>` + limpiar la rama local (`git branch -d <rama-worktree>`), con OK de munix (es acción destructiva, AGENTS.md §1.5).
- **El estado del PR no existe**: `feature/vibes-core` es el destino final y la única rama que se mantiene en remoto.

## Al empezar una card — crear worktree SOLO si no se está ya en uno

1. **Detectar primero** (ver arriba).
2. **Si ya se está en un worktree** → usar ese como espacio aislado de la card. **No crear otro** (evitar duplicar worktrees para la misma tarea).
3. **Si NO se está en un worktree** (se está en el repo principal) → proponer crear uno **derivado de la rama checkouteada en el repo principal en ese momento** (no siempre de `main`). P. ej. si el repo principal está en `feature/vibes-core`, la rama del worktree sale de ahí:

   ```bash
   # Desde el repo principal:
   git worktree add ../<ruta-worktree> -b vibes-<idShort>-<slug>
   ```

4. **Pedir OK explícito de munix cada vez** antes de ejecutar `git worktree add` + `git checkout -b` (es acción que crea ramas, AGENTS.md §1.5: requiere OK). No se crea por libre.
5. **Naming** sugerido para la rama del worktree: `vibes-<idShort>-<slug>` (limpio y trazable a la card), p. ej. `vibes-92-fix-permisos`.

## Limpieza — prune de worktrees sin movimiento (regla de los 3 días)

- Si al inspeccionar el repo se detectan worktrees **sin movimiento en los últimos 3 días** (sin commits, sin cambios en el working tree), el agente **lo reporta a munix** con la lista y propone `git worktree remove` de los muertos.
- El agente **no borra worktrees por su cuenta**: primero avisa y espera OK (son acción destructiva, AGENTS.md §1.5). La excepción es el worktree de la tarea actual tras fusión/descarte aprobado por munix.
- Para detectar worktrees sin movimiento:

  ```bash
  git worktree list
  git log -1 --format=%ci <rama>   # fecha del último commit de cada rama
  ```

> **Por qué:** el trabajo en paralelo con muchos agentes genera worktrees/ramas efímeros. Sin limpieza, se acumulan y el repo se convierte en un cementerio. Un worktree sin movimiento en 3 días es basura o una tarea atascada que hay que reportar, no conservar.

## Checklist de cumplimiento

- [ ] ¿He ejecutado `git rev-parse --git-dir` antes de la primera operación git?
- [ ] Si estoy en un worktree: ¿me he abstenido de push/merge/borrado de ramas sobre el repo principal?
- [ ] Si he propuesto crear un worktree: ¿esperé el OK explícito de munix antes de ejecutar?
- [ ] ¿La rama del worktree deriva de la rama checkouteada en el repo principal (no de `main` por defecto)?
- [ ] ¿He revisado worktrees sin movimiento en 3 días y los he reportado (sin borrar por libre)?
