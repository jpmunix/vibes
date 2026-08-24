# AGENTS.md — Reglas del proyecto Vibes / Vibes

> Contrato de trabajo entre **munix** (product owner) y el agente.
> Las reglas aquí son **en piedra** salvo que munix diga lo contrario explícitamente.
>
> **Hermano gemelo de** `.agents/rules/AGENTS.md` en vibes-core (el runtime).
> **Siempre hacemos espejo (no copia literal):** las reglas compartidas (tests, docs,
> Trello, inventarios, naming de artifacts, §5/§6) se reflejan en ambos ficheros,
> **adaptadas a cada repo**. El detalle específico de un repo NO se duplica: se
> referencia con "Gemelo de §X en ...". Cualquier cambio en una regla compartida se
> replica (adaptado) en el otro fichero — y viceversa.

---

## 1. Decisiones en piedra (no negociables)

### 1.1 Tests por slice — **INNEGOCIABLE**

Cada slice vertical (Track B de Fase 1 o cualquier tarea futura) **se entrega con sus tests**:

1. **Unit tests** atómicos por archivo modificado (vibes-core ya los tiene con Vitest).
2. **Contract test golden** contra OpenCode para todo output que cruza la frontera Vibes ↔ runtime (fixtures JSON grabadas del comportamiento actual, comparadas en CI).
3. Si la slice toca la UI, **smoke test manual** documentado en el PR.

**Reglas duras:**
- No se da por terminada una slice sin sus tests verdes en CI.
- No se fusiona un PR sin contract tests actualizados si la slice cambia output visible.
- "Es trivial, no necesita tests" **no es una respuesta aceptable**. Toda tool, todo handler, todo evento nuevo lleva test.
- Si un test requiere mock complejo, se documenta el porqué en el comentario del test.
- Los contract tests se graban UNA vez con OpenCode y son **gold-master**: cambiar una fixture requiere discusión explícita.

> **Por qué:** Vibes está en producción con [opencode_adapter.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/handlers/opencode_adapter.ts) (5500 líneas, debugueado durante meses). El swap a vibes-core **no puede introducir regresiones detectables solo por queja de usuario**. Enterprise first significa que cada release con el flag on pasa los mismos contract tests que pasaba con el flag off.

---

### 1.2 Documentos vivos vs en piedra

| Tipo | Qué son | Cómo se tratan |
|---|---|---|
| **En piedra** | Decisiones arquitectónicas del Roadmap, contratos del workspace (`@vibes/*`), políticas de seguridad, schema de eventos `RuntimeEvent`, frontera runtime ↔ carcasa (P1) | No se tocan sin discusión explícita. Cambios requieren actualizar el documento padre + comentario en el PR. |
| **Vivos** | [`phase1-tasks.md`](file:///home/munix/Desarrollo/GitRepo/Vibes/docs/archive/phase1-tasks.md), [`post-mvp-roadmap.md`](file:///home/munix/Desarrollo/GitRepo/Vibes/docs/archive/post-mvp-roadmap.md), [`phase1-mvp.md`](file:///home/munix/Desarrollo/GitRepo/Vibes/docs/archive/phase1-mvp.md), prioridades de cada fase | Se actualizan libremente como parte del trabajo. Cualquier cambio se documenta en el archivo. |
| **Roadmap** | [`implementation_plan.md`](file:///home/munix/Desarrollo/GitRepo/Vibes/docs/archive/implementation_plan.md) (el documento guía, la constitución del proyecto) | El agente lo lee pero no lo modifica salvo petición explícita. Es la constitución del proyecto. |

> [!IMPORTANT]
> Si una tarea pide tocar algo "en piedra" sin que munix lo haya pedido, **preguntar antes**. No asumir.

---

### 1.3 Trabajo en slices verticales

La Fase 1 y todo el trabajo futuro se organiza en **slices verticales** (cada uno toca ambos repos de extremo a extremo). No se entrega código sin un slice testeable de extremo a extremo.

Cada slice tiene:
- **Scope claro** (archivos a tocar).
- **Criterio de aceptación verificable** (test o demo).
- **Contract test golden asociado** (si toca output visible).
- **Checkpoint demo-able**: munix puede probarlo manualmente y dar feedback.

---

### 1.4 Bases de datos — estructura en features: el agente propone, munix ejecuta · scripts pedidos: ejecuta el agente

- **Cambiar una tabla o crear tablas nuevas durante una feature (DDL/schema)** → el agente **propone**, munix **ejecuta**: el agente entrega las queries exactas (DDL/DML) en el documento de la tarea; munix las ejecuta, valida y reporta. El agente nunca lanza cambios de schema por libre.
- **Scripts y consultas que munix pide explícitamente** (scripts de consulta/inventario, migraciones, siembras, one-shots, dumps) → el agente los **ejecuta directamente**, sin handoff ni pedir permiso: si munix ha pedido el script, ya está autorizado el acceso.
- Para tests del agente (vibes-core), las migraciones a SQLite de tests sí las gestiona el agente, pero documenta el schema esperado.

---

### 1.5 Repositorio y builds — **rutina del agente**

**Lo que el agente ejecuta por su cuenta (verificación pasiva, sin side-effects fuera del árbol):**
- `pnpm test` / `vitest` (correr la suite).
- `pnpm typecheck` / `tsc --noEmit`.
- `pnpm lint` / `eslint`.
- Comandos puramente lectores (`ls`, `cat`, `grep`, `find`, `wc`, `git status`, `git diff`, `git log`).

> [!IMPORTANT]
> **Typecheck correcto en Vibes (carcasa) — innegociable.**
> El [`tsconfig.json`](file:///home/munix/Desarrollo/GitRepo/Vibes/tsconfig.json) es un **solution file** (`"files": []` + `references`). Correr `npx tsc --noEmit` contra él **no compila nada** y devuelve exit 0 aunque el código esté roto. El comando que **sí** comprueba el código es el script oficial del repo:
> ```
> pnpm ts:main        # = npx tsgo -p tsconfig.app.json --noEmit --incremental
> ```
> (tsgo es el compiler rápido; el equivalente clásico es `npx tsc -p tsconfig.app.json --noEmit`). **Antes de declarar una tarea con TypeScript completada, SIEMPRE ejecutar `pnpm ts:main` y leer el output completo** (no `| head -5`, no confiar en el `$?` de un pipe).
>
> **Fallo documentado (2026-08-24):** se usó `npx tsc --noEmit 2>&1 | head -5; echo "TSC: $?"` contra el solution file. El `head` truncó el output y el `$?` devolvía el código de `head` (0), no de `tsc`. Resultado: se declaró "TSC: 0 errores" habiendo **132 errores reales**. Lección: (1) usar el tsconfig de la app (`-p tsconfig.app.json` / `pnpm ts:main`), (2) no truncar el output ni depender del `$?` de un pipe — leer el log entero o coger el `$?` justo tras el comando sin pipe intermedio.

Estos son **parte del trabajo del agente** y se ejecutan sin pedir permiso. El agente los lanza para verificar sus propios cambios (regla §3.3) y para diagnosticar (regla §3.1). No necesitan OK de munix.

**Lo que el agente nunca ejecuta sin OK explícito:**
- `pnpm build` (ni `tsc -b`, ni `vite build`, ni `electron-builder`, ni equivalentes).
- Reiniciar procesos del proyecto (`pm2 restart`, `kill` de pids del proyecto, `pnpm dev` en background, levantar/parar la app Electron).
- Acciones de repo: `git commit`, `git push`, `gh pr create`, `git tag`, `git checkout -b`.
- Acciones destructivas: `rm -rf`, `git reset --hard`, drop de DB.
- Cualquier comando que mute estado fuera del árbol de trabajo del agente (instalaciones globales, `npm i -g`, tocar `/etc`, etc.).

**Cómo lo pide el agente cuando lo necesita:**
> *"¿Ejecuto `pnpm build` / `pm2 restart` / `git commit -am '...'`?"*

Y espera el OK antes de tocar.

**Resumen de una línea:** el agente verifica (tests/typecheck/lint) por su cuenta; el resto lo decide munix.

**Cuando munix pide un commit explícito** (dice "haz el commit" o similar), el agente ejecuta directamente **sin volver a pedir OK** (el pedido ya es autorización) y con estas reglas:
- **Coge SOLO los archivos trabajados** en la tarea/card actual (`git add` selectivo). No commitea cambios ajenos que estén en el working tree (p. ej. de otra tarea).
- **Genera un mensaje de commit estándar**: tipo convencional (`feat`/`fix`/`refactor`/`chore`/`docs`/`test`...), resumen en línea, y cuerpo con el contexto si aplica.
- **Referencia la card en formato `#VIBES-XX`** en el asunto del commit (o cuerpo si el asunto es largo), donde `XX` es el `idShort` de la card de Trello en la que se trabajó.
- Tras el commit, reporta el hash y el alcance (archivos). El `git push` sigue requiriendo OK explícito aparte.

---

### 1.6 Frontera runtime ↔ carcasa (P1 del Roadmap)

- **Runtime** (vibes-core): provider-agnóstico, no conoce UI, no conoce Vibes, no conoce OpenCode. Solo sabe de `RuntimeEvent`, `MessageContentPart`, `ToolResult`, `Workspace`.
- **Carcasa** (Vibes): traduce `RuntimeEvent` a tags `<vibes-*>` para la UI. Decide prompts, contextos, pills de permisos, visionador sintético. El runtime nunca hace preprocessing de visión.
- Si una feature pide meter algo del runtime en Vibes o viceversa → **preguntar antes**, probablemente viola P1.

---

### 1.7 Lenguaje y tono

- Español de España siempre.
- Tono: amable, empático, profesional. Algo de humor y tacos están bien; mala educación nunca.
- En documentos: github markdown con links `file://`. Nunca mensajes de commit, push, ni PR automáticos.
- Respetar las reglas globales del usuario (`/home/munix/.gemini/config/rules/`), en particular Context7 para docs de librerías.

---

### 1.8 Inventario de tests y mantenimiento — **VITAL**

El inventario completo y detallado de todos los tests del repo vive en [`docs/TESTING.md`](file:///home/munix/Desarrollo/GitRepo/Vibes/docs/TESTING.md). Es un **documento vivo** y la fuente de verdad de qué tests existen, qué cubren, cuándo usarlos y dónde están.

**Reglas:**
- Si se **añade** un test nuevo → se añade su entrada en `docs/TESTING.md` en el mismo cambio.
- Si se **modifica** un test existente → se actualiza su descripción en `docs/TESTING.md`.
- Si se **elimina** un test → se elimina su entrada y se documenta por qué en el PR.
- Antes de tocar cualquier test, **consultar `docs/TESTING.md`** para entender qué cubre y qué contratos (B6 swap, golden fixtures, E2E snapshots) depende de él.
- El **contract test golden del swap B6** ([`runtime_bridge.contract.test.ts`](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/runtime/runtime_bridge.contract.test.ts)) es gold-master: cambiar fixtures requiere discusión explícita (§1.1).
- Los **E2E snapshots** (254 archivos en `e2e-tests/snapshots/`) son golden: si cambian, investigar antes de aceptar. No `--update-snapshots` a lo bruto.
- Documentación cruzada con vibes-core: [`../vibes-core/docs/TESTING.md`](file:///home/munix/Desarrollo/GitRepo/vibes-core/docs/TESTING.md).

> **Por qué:** Vibes está en producción. Sin un inventario actualizado, es imposible saber qué coverage existe antes de tocar algo. Un test que no está documentado es un test que se rompe sin que nadie se entere.

---

### 1.9 Inventario de features listas para probar — **VITAL**

Cada feature cerrada en verde se anota en el artifact [`brain/feature_inventory.md`](file:///home/munix/.gemini/antigravity/brain/4a8ac19e-2d71-470d-8f53-f0c0dd1c7614/feature_inventory.md) con bullets cortos (qué probar, qué validar, resultado esperado). Es la **lista viva** de qué se puede testear a fondo antes de fusionar / deployar.

**Reglas:**
- Cada vez que se cierra una feature (slice / fix / refactor) → añadir bullets al artifact en el mismo cambio.
- Formato: **bullets cortos**, una línea por bullet. Sin prosa larga, sin párrafos descriptivos.
- Cada bullet = **una acción verificable** ("pulsar X", "verificar Y", "esperar Z").
- Si la feature se subdivide en sub-slices (Slice 3.8 → 3.8.1/3.8.2/3.8.3/3.8.4) → agrupar visualmente con el mismo nivel de indentación.
- Si un bullet cambia de comportamiento (regresión, fix) → actualizar el bullet en lugar de añadir uno nuevo con "(fix)".
- El artifact incluye una sección final **"Próximo test flight"** con los 5-10 bullets más críticos para probar primero.

> **Por qué:** munix necesita tener siempre a la vista qué se puede probar y qué cubre cada feature, sin releer el walkthrough entero. Si el artifact no se actualiza con cada slice, perdemos el rastro de qué testear primero.

---

### 1.10 Board de Trello — LA FUENTE DE VERDAD — **INNEGOCIABLE**

El board de Trello ([board](https://trello.com/b/YFE2Kkjv)) es **la única fuente de verdad** del estado del proyecto. munix no es el orquestador ni la memoria del agente: **el agente se auto-gestiona sobre el board**. munix mira el board, dice "esto", y el agente hace el resto (coger, trabajar, documentar, mover, bloquear, cerrar). munix revisa **código final + pruebas manuales**, no el proceso.

El protocolo completo vive en [`.agent/workflows/trello-workflow.md`](file:///home/munix/Desarrollo/GitRepo/Vibes/.agent/workflows/trello-workflow.md). Este §1.10 es el resumen ejecutivo **en piedra**; el workflow es la guía operativa (documento vivo).

**Los scripts** viven en [`scripts/trello/`](file:///home/munix/Desarrollo/GitRepo/Vibes/scripts/trello/) (Node nativo, sin deps, idempotentes): `list-cards.mjs` (leer), `create-card.mjs` (crear), `update-card.mjs` (renombrar/mover/actualizar/comentar), `attach-file.mjs` (adjuntar ficheros locales a una card). Credenciales en `.env.trello` (raíz).

#### 1.10.1 Las listas (canónicas, no renombrar sin OK)

| Lista | Qué es | Quién la mueve |
|---|---|---|
| **Backlog** | Deudas + roadmap post-MVP (fases 2-5) | El agente propone, munix decide |
| **Ideas** | Ideas sueltas NO planificadas (fuera del flujo) | Solo munix |
| **Bitácoras** | Resúmenes ejecutivos de auditorías, inventarios y snapshots del proyecto (no es del flujo de trabajo normal) | El agente al entregar; munix la revisa |
| **To-do** | Pendiente inmediato (ops, próximo trabajo) | munix la llena; el agente la consume |
| **Doing** | En curso (máx 1-2) | El agente |
| **Blocked** | Atascada (falta munix/decisión/dep) | El agente con motivo |
| **Review** | Terminada, esperando OK de munix | El agente al terminar |
| **Manual tests** | En pruebas manuales antes de cerrar | munix (o el agente con su OK) tras validar en Review |
| **Done** | Cerrada y verificada | El agente tras OK explícito de munix |

#### 1.10.2 El flujo obligatorio (cada card que se trabaja)

1. **Leer el board** (`list-cards --light`) antes de trabajar. Priorizar: Blocked desbloqueable → To-do → Backlog propuesto.
2. **Coger la card**: `update-card --move Doing --comment "🔄 [Doing] Plan: ..."` — el comentario de inicio documenta el plan (1-2 líneas).
3. **Trabajar** siguiendo AGENTS.md (slices verticales, tests, contract golden). Marcar checklist con `--check-item` conforme se cumplen criterios (no a lo bruto).
4. **Atasco** → `--move Blocked --comment "🚧 [Blocked] Falta: ..."` — **nunca silencio**. El comentario dice qué falta y qué se necesita para desbloquear.
5. **Terminar** → `--move Review --comment "✅ [Review] Tests: N verdes (cmd). Archivos: ..."` — con evidencia de verificación.
6. **Probar manualmente** → tras validar en Review, `--move "Manual tests" --comment "🧪 [Manual tests] Qué validar: ..."` — pruebas manuales antes de cerrar.
7. **Cerrar** → `--move Done` **SOLO con OK explícito de munix** (tras las pruebas manuales) + comentario de cierre `🏁 [Done]` + bitácora si hubo decisiones.

#### 1.10.3 Reglas duras del board

- ❌ **NUNCA** mover a `Done` sin OK explícito de munix + evidencia (tests verdes / verificación manual).
- ❌ **NUNCA** trabajar en más de 1-2 cards a la vez (si estás en Doing, no coges otra).
- ❌ **NUNCA** crear cards duplicadas (los scripts son idempotentes; mirar antes con list-cards).
- ❌ **NUNCA** archivar/borrar cards sin decírselo a munix (archivar = perder evidencia).
- ❌ **NUNCA** renombrar listas ni cambiar la estructura del board sin OK (es en piedra). Incluidas `Ideas` (2026-08-11: solo munix la llena; el agente no la toca) y `Manual tests` (2026-08-19: paso intermedio de pruebas manuales entre Review y Done; el agente la usa con OK de munix).
- ❌ **NUNCA** marcar checklist sin haber verificado el criterio.
- ✅ **SIEMPRE** documentar con comentarios (inicio, atasco, review, cierre).
- ✅ **SIEMPRE** proponer (comentar) antes de mover cosas de Backlog — el backlog es prioridad de munix.

#### 1.10.4 Comentarios-bitácora (lo que separa el oro de la mierda)

> **Por qué:** dentro de 6 meses, un agente (o munix) debe leer una card de Done y entender TODO sin hablar con nadie. La memoria del proyecto vive en los comentarios del board, no en las conversaciones.

**Formato (prefijos escaneables):**

| Prefijo | Uso | Ejemplo |
|---|---|---|
| `🔄 [Doing]` | Inicio (plan) | `🔄 [Doing] Plan: migrar X a Y, tests A/B` |
| `🚧 [Blocked]` | Atasco (qué falta) | `🚧 [Blocked] Falta decisión munix: ¿SQLite o Postgres?` |
| `✅ [Review]` | Listo (evidencia) | `✅ [Review] Tests: 12 verdes (pnpm test). Archivos: 3` |
| `🧪 [Manual tests]` | Pruebas manuales antes de cerrar (qué validar) | `🧪 [Manual tests] Qué validar: ...` |
| `🏁 [Done]` | Cierre con OK | `🏁 [Done] OK munix. Cerrada.` |
| `🧠 Contexto` | Decisión/porqué técnico | `🧠 Contexto: elegimos X sobre Y porque ...` |
| `📌 Para el agente` | Nota para el futuro | `📌 Para el agente: si tocas esto, ojo con Z` |
| `♻️ Deuda` | Deuda detectada | `♻️ Deuda: al hacer X, Y quedó sin testear → card nueva` |

**Qué escribir:** decisiones y su porqué, alternativas descartadas, referencias a archivos clave, bugs cazados y cómo, cosas no obvias que el código no dice.
**Qué NO escribir:** "he hecho la card", repetir la descripción, detalles que ya están en el código/commits.

> [!TIP]
> Regla del pulgar: **si un agente futuro leyera SOLO los comentarios de la card, ¿podría retomar el trabajo sin hablar con nadie?** Si no, falta contexto.

#### 1.10.5 Detección de deuda (el agente como detector)

Mientras trabaja, si encuentra un bug que no arregla (fuera de scope), una feature que se rompe, o un refactor necesario → **crea card nueva** en Backlog con label `deuda` y checklist de criterios. **No lo arregla en caliente** (scope creep, §6). La card ES la documentación de la deuda.

```bash
node scripts/trello/create-card.mjs --title "Deuda: ..." --desc "**Qué:** ...\n**Por qué importa:** ...\n**Checklist:** ..." --list "Backlog" --labels "deuda" --checklist "Criterio 1|Criterio 2"
```

#### 1.10.6 Cierre de card (checklist de verificación)

Antes de mover a Done, la card pasa por **`Manual tests`** (pruebas manuales) y el agente verifica TODOS:
1. ¿Pasó las pruebas manuales y OK explícito de munix? (verbal o moviendo él la card)
2. ¿Comentario de cierre con evidencia? (tests verdes, verificación manual)
3. ¿Checklist completo? — `list-cards --number <N> --detail > /tmp/card-<N>.json` expone `checklists[].items[].state`; el agente **debe** confirmar que todos están `complete` antes de mover. Si alguno está `incomplete` → no se mueve a Done. La bandera `--check-all` de `update-card.mjs` marca todos los items de todos los checklists como `complete` en un solo paso (usar tras verificarlos manualmente, no a ciegas).
4. ¿Comentario-bitácora si hubo decisiones no obvias?

Si falta algo → la card se queda en `Manual tests` (o `Review` si aún no pasó las pruebas).

#### 1.10.7 Roadmap, tareas y planes — Trello es la fuente de verdad — **INNEGOCIABLE**

Cuando munix pregunte por el estado del roadmap, las tareas pendientes, los planes de trabajo o el progreso general, **siempre nos referimos al board de Trello** como la única fuente de verdad. No se contestan preguntas de roadmap mirando documentos estáticos, artifacts, ni la memoria de la conversación.

- **Consultar el board** (`node scripts/trello/list-cards.mjs --light`) es el primer paso antes de responder cualquier pregunta sobre qué hay pendiente, qué está en curso, o qué se planea.
- **Los artifacts temporales** (plans, walkthroughs, análisis) son **borradores de trabajo** que el agente crea mientras pelotea una tarea (como artifact, no como documento del repo). **Siempre acaban reflejados en Trello** como card, comentario, adjunto o actualización de checklist. Al terminar la tarea, el plan se **sube a la card y se elimina** del working tree (ver §1.12).
- Si existe un artifact de plan que no tiene card equivalente en Trello → **crear la card** o preguntar a munix si debe existir.
- **Nunca** mantener un "roadmap paralelo" en documentos, artifacts o conversaciones que no esté sincronizado con Trello.

> [!IMPORTANT]
> **Por qué:** Si la fuente de verdad vive en dos sitios (Trello + un documento), acaba divergiendo y perdemos la trazabilidad. Un plan en un artifact sin card en Trello es un plan que no existe. Los artifacts son el borrador; Trello es el contrato.

#### 1.10.8 Artifacts de una tarea → se suben SOLOS a la card — **INNEGOCIABLE**

Todo artifact que se genere durante el trabajo de una card (plan, walkthrough, análisis, informe de tests, captura, fixture, documento de apoyo) se sube **automáticamente** como adjunto a la card correspondiente, **sin intervención del usuario**: el agente no espera a que munix lo pida ni pregunta "¿subo esto?". Si se generó durante la tarea, se adjunta.

```bash
node scripts/trello/attach-file.mjs --card "Título de la card" --file "<ruta-del-artifact>/plan-vibes-NN.md,./captura.png"
```

- **Cuándo:** al terminar el trabajo (junto con el `✅ [Review]`), o antes si el artifact es grande o muestra progreso.
- **Card correspondiente:** la card en la que se está trabajando (la de Doing). Si un artifact no tiene card propia, se adjunta a la card de la tarea.
- **Límite:** 10 MB por fichero (API de Trello). Si un artifact lo excede, se avisa en el comentario (nunca se omite en silencio).
- **Código fuente:** no se sube al board (vive en el repo); solo se adjunta si es evidencia relevante (p. ej. el script entregable).

#### 1.10.9 Labels del board — toda card lleva labels coherentes — **INNEGOCIABLE**

Toda card que cree el agente (o munix, como convención compartida) lleva **al menos un label** que refleje su naturaleza, y opcionalmente los complementarios (fase/dimensión). Una card sin labels (o con labels incoherentes con su contenido) es una card mal clasificada: rompe el filtrado y las agrupaciones del board.

**Reglas:**
- Si la card es de **deuda** (revisión, bug no arreglado, refactor pendiente) → label `deuda` siempre.
- Si toca una **dimensión** reconocible (tools, prompts, runtime, ui, sdk, permisos, mcp, db, modelos, workspace, compactacion, resiliencia, subagentes, attachments, migracion, arneses, research, etc.) → añadir ese label, aunque sea transversal.
- Si pertenece a una **fase** (fase-2, fase-3, fase-4, fase-5) → añadir el de fase.
- No abusar: 1-3 labels por card, los que la describen de verdad. No etiquetar por etiquetar.

**Vocabulario canónico de labels** (no inventar nuevos sin motivo — crear label nuevo solo si ninguno existente encaja y merece la pena):
- Dimensiones: `tools`, `prompts`, `runtime`, `ui`, `sdk`, `permisos`, `mcp`, `db`, `modelos`, `workspace`, `compactacion`, `resiliencia`, `subagentes`, `attachments`, `migracion`, `arneses`, `research`
- Fases: `fase-2`, `fase-3`, `fase-4`, `fase-5`, `mvp`
- Transversales: `deuda`, `ops`, `idea`

**Cuándo:** al **crear** la card (junto al `🔄 [Doing]`), no en un paso posterior. Si se hereda una card sin labels o con labels rotos → corregirlos al cogerla.

> **Por qué:** el board es la única fuente de verdad (§1.10.7). Sin labels coherentes, el filtrado por dimensión (p. ej. "qué deuda de tools tenemos") es imposible y el board pierde su valor como instrumento de gestión.

#### 1.10.10 Trazabilidad card ↔ conversación ↔ repo — **INNEGOCIABLE**

Toda card que se mueva a `Doing` lleva, en su **primer comentario** (el `🔄 [Doing]`), una **ref-line** estándar que ancla la card a la conversación de Antigravity y al estado del repo. Se inyecta con la bandera `--ref` (repetible) de `update-card.mjs` / `create-card.mjs`, que antepone la ref-line al comentario automáticamente:

```bash
node scripts/trello/update-card.mjs --card "Título" --move Doing \
  --ref "conv=e7ab9384-..." \
  --ref "#VIBES-92" \
  --ref "feat/vibes-92-x@a1b2c3d" \
  --ref "contract=B6" \
  --comment "🔄 [Doing] Plan: ..."
```

Formato canónico de la ref-line (construido por `buildRefLine()` en `lib.mjs`; los campos vacíos se omiten sin dejar separadores colgando):

```
🔗 Refs: conv=<conversation-id> | #VIBES-NN | <rama>@<commit> | contract=<c> | artifact=<ruta>
```

**Campos y de dónde salen:**

| Campo | Qué ancla | De dónde se saca |
|---|---|---|
| `conv` | Conversación de Antigravity | El ID de la sesión activa (contexto del agente). Ver §1.13 (`ag-chats.mjs`) |
| `#VIBES-NN` | idShort de la card | `list-cards --light` (`idShort`). En `create-card` se auto-inyecta al crear |
| `<rama>@<commit>` | Estado del repo asociado | `git rev-parse --abbrev-ref HEAD` + `git rev-parse --short HEAD` — **explícito**, no autodetección |
| `contract` | Contrato tocado (A1-A4, B6…) | `docs/TESTING.md` / Roadmap, si aplica |
| `artifact` | Walkthrough/plan asociado | Ruta del artifact en el brain, si aplica |

**Reglas:**
- La ref-line va **siempre al inicio** del comentario (antes del prefijo `🔄/🚧/✅/🏁`), separada por una línea en blanco.
- Se **actualiza** la ref-line en el comentario `✅ [Review]` si la rama o el commit cambiaron durante la slice (nuevo comentario con las refs actualizadas).
- El walkthrough/plan asociado a la card lleva al final un bloque `## Trazabilidad` con la misma ref-line (verificación cruzada).
- Las refs de **git son explícitas**: el agente las pasa a mano, no hay autodetección mágica del CWD (decisión de munix).
- `create-card.mjs` añade el comentario ancla **solo si se pasa `--ref`** (no en toda card nueva: sería ruido redundante).
- Cualquier búsqueda de "de dónde viene esta card" empieza por la ref-line del primer comentario.

> **Por qué:** una card sin ref-line es un nodo huérfano: munix abre Antigravity desde el móvil y no sabe qué chat corresponde; abre Trello y no sabe qué conversación tiene el contexto. La ref-line hace el board **navegable de ida y de vuelta**.

> [!NOTE]
> Tests del helper: [`scripts/trello/__tests__/build-ref-line.test.mjs`](file:///home/munix/Desarrollo/GitRepo/Vibes/scripts/trello/__tests__/build-ref-line.test.mjs) — se ejecutan con `node --test "scripts/trello/__tests__/*.test.mjs"` (runner nativo, sin deps).

#### 1.10.11 El número de card va en el título — `#XXX - título` — **INNEGOCIABLE**

Toda card del board lleva su **número (`idShort`) en el título**, en formato `#XXX - título` (p. ej. `#131 - Ajustes para expertos: parámetros avanzados`). El número **siempre al principio**, precediendo a cualquier otro prefijo (incluidos `Deuda:` o `Review:` → pasan a ser `#XX - Deuda: ...`).

**Por qué:** la app de Trello para Android **no muestra el número** de card en ningún sitio (ni en el listado, ni en el detalle) — solo aparece en la URL, que en el móvil es incómoda de consultar. Con el `#XXX` en el título, cualquier card es referenciable y trazable desde el móvil sin abrir la URL.

**Reglas:**
- Toda card **nueva** se crea ya con el `#XXX` en el título (tras `create-card`, el `idShort` asignado se antepone al título con `update-card --name "#XXX - <título>"`).
- **Una vez creada la card, el agente DEBE verificar que el `#idShort` está al principio del título. Si no lo tiene, DEBE actualizarla para añadirlo — siempre, sin excepción. Es innegociable.** No se da una card por creada hasta que su título empieza por `#<idShort> - `.
- Toda card **renombrada** conserva el `#XXX` al principio.
- El `idShort` es el que expone `list-cards --light` (el mismo `#VIBES-NN` de la ref-line, §1.10.10).
- No usar `#VIBES-` como prefijo en el título (`#VIBES-XX` queda solo para la ref-line de los comentarios y los commits): en el título basta `#XX`.
- El formato es `#<idShort> - <título>` (almohadilla, número, espacio, guion, espacio).

> **Por qué:** sin el número en el título, desde Android no hay manera de saber qué card es cuál al hablar de ellas (\"la de los prompts\", \"esa que estaba en Doing\"...). El `#XXX` en el título es la **referencia visible universal**, en móvil y en escritorio.

---

### 1.11 Repos de referencia "los arneses" — sitio de consulta — **INNEGOCIABLE**

El directorio [`arneses/`](file:///home/munix/Desarrollo/GitRepo/arneses) contiene espejos de los proyectos grandes del sector (aider, continue, opencode, pi, plandex) como **sitio de consulta**. Esos proyectos ya han pasado por mil retos que nosotros recién nos planteamos.

**Cuando munix diga "mira como lo hacen los otros"** (o "mira cómo lo hace opencode/pi/continue/aider/plandex", o cualquier consulta sobre cómo resolver un problema que estos proyectos ya hayan resuelto), el agente **busca ahí primero** antes de inventar una solución propia.

**Reglas:**
- `arneses/` es **solo lectura como referencia**: no se modifica nunca (son espejos de terceros).
- Consultar sus `AGENTS.md`, `CONTEXT.md`, `CONTRIBUTING.md`, `docs/`, `packages/` y el código real para aprender patrones, arquitectura, edge-cases y decisiones que ya tomaron.
- **No copiar código literal** sin adaptarlo a nuestra arquitectura (P1 runtime ↔ carcasa) y sin citar la fuente.
- Si un patrón de `arneses/` inspira una decisión propia → documentarlo en la card/PR con referencia al archivo consultado.
- La referencia es **código de terceros con su propia licencia**: respetarla si se reutiliza algo.

> **Por qué:** no reinventar la rueda. Estos proyectos llevan años resolviendo los problemas que estamos empezando a plantearnos (tooling de agentes, loops, prompts, permisos, UI). Su código es una fuente de conocimiento de primera mano.

---

### 1.14 Cero endososas a terceros en código/docs — **INNEGOCIABLE**

El código es nuestro. No mencionamos a ningún proyecto de terceros (OpenCode, aider, continue, pi, plandex, Cursor, Aider, etc.) en ninguna parte del código, documentación, comentarios, descripciones de tools, mensajes de commit, nombres de archivos, ni artefactos del repo propio.

**Reglas duras:**
- ❌ **NUNCA** escribir "basado en...", "paridad con...", "adaptado de...", "inspirado en OpenCode/aider/..." ni ningún equivalente en comentarios, JSDoc, cabeceras de archivo, nombres de funciones, ni nombres de tests.
- ❌ **NUNCA** mencionar a un tercero en `description` de una tool (es string literal que el LLM lee verbatim), ni en `arg.description` del catálogo.
- ❌ **NUNCA** mencionar a un tercero en `docs/TESTING.md`, `TESTING.md`, `walkthrough.md`, `implementation_plan.md` u otros docs del repo.
- ❌ **NUNCA** citar un nombre de tercero en mensajes de commit, PR titles, descripciones de cards de Trello, ni comentarios-bitácora.
- ✅ **SÍ** consultar libremente el directorio `arneses/` (§1.11) para aprender patrones — es un sitio de consulta, no una referencia citada.
- ✅ **SÍ** mencionar a un tercero en una card de deuda, walkthrough de investigación o plan de implementación **si es estrictamente necesario para documentar el porqué de una decisión técnica** (p. ej. "se eligió X sobre Y porque..."). Pero una vez tomada la decisión, el código y docs del repo van sin la mención.
- ✅ **SÍ** indicar la proveniencia del algoritmo en el JSDoc de cabecera del archivo si aporta contexto técnico útil para el siguiente desarrollador, pero con lenguaje descriptivo ("Algoritmo de matching X con Y niveles", no "basado en opencode/packages/...").

> **Por qué:** una mención a OpenCode/aider/etc. en una description de tool es un string que el LLM lee literal y filtra al usuario. Una mención en un comentario sesga a quien lea el código (incluido el propio agente) a "rendir cuentas" a un proyecto que no es nuestro ni va a ser nuestro. El formato `apply_patch` (Begin/Add/Delete/Update/End Patch) es ahora nuestro formato — lo hemos portado, lo mantenemos, lo evolucionamos, y las decisiones sobre él son nuestras. Si alguien quiere saber de dónde viene, está en `arneses/` para consultarlo; pero el código, los tests, los docs y los commits no le hacen la pelota a nadie.

### 1.15 i18n en UI — todo texto visible va a diccionarios — **INNEGOCIABLE**

Cuando se genere o modifique UI (cualquier componente React, cualquier string que el usuario vea), **todo texto visible debe ir a los diccionarios i18n** (`messages.es.ts` / `messages.en.ts`), nunca hardcoded en español (ni en inglés) directamente en el JSX.

**Reglas duras:**
- ❌ **NUNCA** escribir strings literales en el JSX: `>Guardar<`, `placeholder="Selecciona un modelo"`, `title="Eliminar"`, `label: "Con razonamiento"`.
- ✅ **SIEMPRE** usar `t("namespace.key")` o `tPlural("namespace.key", count)` para todo texto que el usuario vea.
- ✅ Cada string nuevo va en **AMBOS diccionarios** (es + en) o el test de paridad falla.
- ✅ Si el string está en un array/const a nivel de módulo (fuera del componente), convertirlo a función que recibe `t`: `getOptions(t)`.
- ✅ Si el string está en un subcomponente (función no exportada en el mismo archivo), ese subcomponente necesita su PROPIO `useI18n()` — el hook del padre no lo cubre.
- ✅ Si el texto es un valor de datos que se persiste en BD (alias de claves, nombres de usuario), **no se traduce** — se deja como valor del usuario. Pero el placeholder, label y descripción del campo SÍ se traducen.
- ❌ "Es un string trivial, no necesita i18n" **no es una respuesta aceptable**. Si el usuario lo ve, va al diccionario.

> **Por qué:** Vibes está en producción y ya tiene sistema i18n con paridad es/en. Hardcodear strings en español rompe el cambio de idioma: el usuario cambia a English y ve mitad de la UI en español. Un string que no está en el diccionario es un string que se cuela sin traducir y que el siguiente agente no sabe que existe. La paridad (31/31) existe precisamente para cazar esto — si añadimos un string sin diccionario, perdemos la garantía de que todo está localizado.

---

## 2. Cosas que se hablan al post-MVP

Estas se mencionan pero no se deciden todavía. Si salen en conversación, el agente anota pero no actúa:

- **DP-2 (attachments/vision)**: soporte multimodal en `MessageContentPart` → Fase 3. Vibes implementa visionador sintético.
- **DP-3 (todos/question tool)**: Fase 2.
- **Retry/fallback** del loop con `error_classifier` → Fase 4 (G9).
- **Publicación de paquetes `@vibes/*`** en registry → Fase 5.
- **Compactación A+B** → Fase 4.
- **MCP Gateway** → Fase 3.
- **SDKs** (Runtime SDK + Extensions SDK) → Fase 5.
- **Tests E2E con Playwright contra Electron real** → Fase 5 (no MVP).
- **Permisos DSL** (más allá de pills allow/deny/ask) → Fase 5.
- **Catálogo de modelos multi-proveedor (models.dev)** → Fase 5 (5.8 del post-MVP). Integrar models.dev como fuente complementaria de metadatos (description/context/output/modalities/capabilities/precios de proveedor directo) cuando un proveedor custom devuelve datos pobres en su `/models`. Vive en la carcasa (respeta P1).

---

## 3. Cómo trabaja el agente

### 3.1 Antes de escribir código

1. Lee los documentos relevantes: Roadmap, fase actual, AGENTS.md.
2. Inspecciona el código real con tools (grep_search, view_file, run_command). Nunca asume.
3. Identifica el punto exacto de cambio con `view_file` con `StartLine`/`EndLine` si el archivo es grande.
4. Verifica logs antes de diagnosticar errores. Si un test falla, leer el log entero.
5. Si la tarea es ambigua o de scope grande → preguntar antes, no inventar.

### 3.2 Al escribir código

1. Un archivo por scope atómico. Si tocas dos cosas no relacionadas, son dos ediciones.
2. Cita los archivos exactos con links `file://` en el documento de la tarea.
3. Justifica cada cambio con referencia al código fuente (línea, función, contrato).
4. No introduces regresiones → cada cambio preserva el comportamiento previo (tests verdes).
5. No muta estado global sin control de concurrencia explícito.
6. Mantén comentarios existentes, docstrings, y la documentación a menos que la tarea pida lo contrario.

### 3.3 Al cerrar una tarea

1. Actualiza el documento de la slice con: archivos tocados, criterios de aceptación logrados/no logrados, tests añadidos.
2. Reporta a munix con resumen corto (no parafrasea el doc, apunta al doc).
3. No declara éxito sin haber visto tests verdes en output real (no basta "debería funcionar").

### 3.4 Errores y excepciones

- Nunca swallow exceptions con `catch {}` silencioso.
- Nunca devuelvas fallback vacío cuando un API retorna null (investiga el upstream).
- Nunca comentes tests que fallan para "arreglarlos". Investiga por qué fallan.
- Si un comando falla, explícalo a munix con el log. No lo escondas.
- Si un comando es peligroso (`rm`, `drop`, `kill`), avisa antes y pide confirmación.

---

## 4. Decisión temporal sobre modelos y providers

- El agente puede sugerir cambios de modelo en `settings.json` de Vibes, pero no los ejecuta.
- Si el provider por defecto (OpenAI-compatible) no soporta visión, Vibes implementa fallback con visionador sintético.
- El runtime no sabe nada de providers específicos.

---

## 5. Postura ante decisiones en documentos

| Si munix dice... | El agente... |
|---|---|
| "Anota esto en el Roadmap" | Lo añade al documento correspondiente con referencia clara. |
| "Decisión en piedra: X" | La refleja aquí en AGENTS.md como regla §1, y en el doc técnico correspondiente. |
| "Esto va a post-MVP" | Lo anota en §2 de AGENTS.md y en el doc de la fase correspondiente. |
| "Cámbialo" sobre algo en piedra | Pregunta para confirmar antes de cambiar. |
| "Cámbialo" sobre algo vivo | Procede libremente, documenta el cambio. |

---

## 6. Anti-patrones explícitos

- "Es trivial, no necesita test" → siempre necesita test.
- "Lo arreglo después" → no se arregla después, se arregla ahora o se documenta como deuda explícita.
- "Esto ya estaba así" → el estado actual no es sagrado si contradice el Roadmap.
- Refactors especulativos ("ya que estamos aquí, mejor reescribo X") → scope creep. Si se ve la necesidad, se propone como tarea aparte.
- "Funciona en mi cabeza" → si no hay test verde, no funciona.
- Mezclar `legacyFoo` (producto/carcasa) con `opencode` (motor deprecado) en explicaciones. `Vibes` es la carcasa, `vibes-core` es el runtime, `OpenCode` es lo que estamos sustituyendo.

---

### 1.12 Nombrado de artifacts por card de Trello

Cuando un plan o walkthrough está atado a una card del board de Trello, el
artifact se nombra `<tipo>-vibes-<cardNumber>.md`, donde `cardNumber` es el
`idShort` que Trello expone (el número mostrado por el power-up como `#VIBES-92`
→ `92`).

- Tipo `plan` → para plans (`implementation_plan.md`).
- Tipo `walkthrough` → para walkthroughs (`walkthrough.md`).
- Ejemplos: `plan-vibes-92.md`, `walkthrough-vibes-92.md`.
- Si la card no tiene número claro, **preguntar antes** de crear el artifact. Si
  munix dice que no hay card, se crea un artifact normal sin sufijo.

> [!IMPORTANT]
> **Ciclo de vida del artifact de plan (convención):**
> 1. **Mientras se pelotea la tarea**, el agente crea el plan como **artifact**
>    (`<tipo>-vibes-<cardNumber>.md`), NO como documento del repo. Vive en el
>    directorio de artifacts del agente (p. ej. `brain/<conversation-id>/`), fuera
>    del working tree. Es un borrador de trabajo que puede iterarse con munix.
> 2. **Al terminar la tarea** (al mover la card a `Review`), el artifact se
>    **sube como adjunto a la card** (`node scripts/trello/attach-file.mjs --card
>    "Título" --file "<ruta-del-artifact>/plan-vibes-NN.md"`).
> 3. **Tras subirlo, se elimina** del working tree. El plan ya no vive en el
>    repo: su destino final es Trello (la fuente de verdad).
> 4. El board de Trello es el **único** lugar donde persisten los planes. No se
>    acumulan artifacts de planes terminados en el repo.

El `cardNumber` es el `idShort`, visible en la salida de
`node scripts/trello/list-cards.mjs --light` (cada card lleva su `idShort`).
Si necesitas confirmarlo con detalle, redirige a fichero tmp:
`node scripts/trello/list-cards.mjs --number <N> --detail > /tmp/card-<N>.json`
y léelo con `view_file`. **Nunca pipes a `jq` ni `python`** (se trunca el
output y produce parse errors — ver trello-workflow.md §1.1). También está
`resolveCard` en `scripts/trello/lib.mjs`.


### 1.13 Consulta de conversaciones de Antigravity (script `ag-chats.mjs`) — **INNEGOCIABLE**

Para revisar los chats del proyecto (incluido el estado **archivado**) y el contenido de cada conversación **sin abrir Antigravity** — p. ej. cuando munix se va al móvil y el agente debe consultar datos de conversaciones pasadas — usar el script [`scripts/ag-chats.mjs`](file:///home/munix/Desarrollo/GitRepo/Vibes/scripts/ag-chats.mjs).

**Qué hace:** replica la lectura del tracker del proxy de Antigravity ([antigravity-tracker.ts](file:///home/munix/Desarrollo/GitRepo/antigravity-proxy/proxy/src/antigravity-tracker.ts)) sobre `~/.gemini/antigravity/` (los `.db` de conversaciones, el índice `.pb` para el estado archivado, y el `transcript.jsonl` para el contenido). Es **solo lectura**: no borra ni modifica nada de Antigravity.

**Uso (salida en JSON):**

```bash
# Por defecto lista los workspaces activos del repo Vibes:
#   Vibes (corpus jpmunix/vibes), arneses (sin corpus, detectado por workspaceUri) y vibes-core.
node scripts/ag-chats.mjs list

# Todos los proyectos del workspace
node scripts/ag-chats.mjs list --all

# Otro proyecto concreto (uno o varios separados por coma)
node scripts/ag-chats.mjs list --project <nombre>
node scripts/ag-chats.mjs list --project cinco-villas,totem-admin

# Filtrar por estado
node scripts/ag-chats.mjs list --archived
node scripts/ag-chats.mjs list --active

# Leer el transcript de una conversación concreta (cascadeId = campo `cascadeId` del list)
node scripts/ag-chats.mjs show <cascadeId>

# Solo mensajes de usuario de una conversación
node scripts/ag-chats.mjs show <cascadeId> --type USER_INPUT

# Incluir también pasos de sistema/herramientas
node scripts/ag-chats.mjs show <cascadeId> --steps
```

> [!NOTE]
> El proyecto actual de trabajo se referencia como **Vibes** (corpus `jpmunix/vibes` / workspace `/Vibes`).
> **Ojo con `arneses`:** no tiene `corpusName` (campo vacío); se detecta por `workspaceUri` que termine en `/arneses`.
> Por defecto `list` devuelve los 3 workspaces activos del repo: Vibes, arneses y vibes-core.
> Para revisarlos, `list` es el primer paso (devuelve `cascadeId`, título, última actividad y `archived`), y `show` lee el contenido de una sola.
> El script depende de la CLI `sqlite3` del sistema (no usa `better-sqlite3`, que en Vibes está compilada para Electron).

> [!IMPORTANT]
> El campo `title` de cada conversación es el **resumen autogenerado por Antigravity** (el nombre que se ve en el panel izquierdo, p. ej. "Workspace Conversation Access"), leído del índice `agyhub_summaries_proto.pb`. No es un truncado del primer prompt.
> Si una conversación no tiene summary en el `.pb`, el script cae al primer `USER_INPUT` del transcript y, en última instancia, al `step_payload`.


---

**Última actualización:** 2026-08-24 (§1.5 reforzado: typecheck en Vibes SIEMPRE con `pnpm ts:main` / `-p tsconfig.app.json`, nunca contra el solution file `tsconfig.json`. Fallo documentado: 132 errores no detectados por usar `tsc --noEmit` + `head` + `$?` del pipe).
**Mantenedor:** munix.
