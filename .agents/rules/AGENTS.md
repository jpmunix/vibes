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

Cada feature cerrada en verde se anota en el artifact [`brain/feature_inventory.md`](file:///home/munix/.gemini/antigravity/brain/4a8ac19e-2d71-470d-8f53-f0c0dd1c7614/feature_inventory.md): bullets cortos, una acción verificable por línea, sección final "Próximo test flight". Si el artifact no se actualiza con cada slice, perdemos el rastro de qué testear primero.

📖 **CUÁNDO:** al cerrar una slice en verde → [`artifacts.md`](file:///home/munix/Desarrollo/GitRepo/Vibes/.agent/rules/artifacts.md) (formato completo).

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
| **Review** | Terminada, esperando OK de munix | **Solo munix** (el agente deja la evidencia en la card y avisa; **nunca** mueve a Review) |
| **Done** | Cerrada y verificada | El agente tras OK explícito de munix |

> **No hay columna `Blocked` ni `Manual tests`** (eliminadas 2026-08-25): un atasco se documenta en la card con el comentario `🚧 [Atasco]` (paso 4) y las pruebas manuales las hace munix durante `Review` antes de dar el OK.

#### 1.10.2 El flujo obligatorio (cada card que se trabaja)

1. **Leer el board** (`list-cards --light`) antes de trabajar. Priorizar: To-do → Backlog propuesto.
2. **Coger la card**: `update-card --move Doing --comment "🔄 [Doing] Plan: ..."` — el comentario de inicio documenta el plan (1-2 líneas).
3. **Trabajar** siguiendo AGENTS.md (slices verticales, tests, contract golden). Marcar checklist con `--check-item` conforme se cumplen criterios (no a lo bruto).
4. **Atasco** → no hay columna `Blocked` (eliminada 2026-08-25): dejar la card en `Doing` con el comentario `🚧 [Atasco] Falta: ...` — **nunca silencio**. El comentario dice qué falta y qué se necesita para desbloquear, y el agente avisa a munix por el chat.
5. **Terminar** → el agente **NO mueve la card a `Review`**: deja el comentario `✅ [Review] Tests: N verdes (cmd). Archivos: ...` con la evidencia de verificación y avisa a munix. **Solo munix** mueve la card a `Review` cuando la acepta.
6. **Probar manualmente** → las pruebas manuales las hace munix **dentro de `Review`** (no hay columna `Manual tests`, eliminada 2026-08-25), tras lo cual da el OK para cerrar.
7. **Cerrar** → `--move Done` **SOLO con OK explícito de munix** (tras las pruebas manuales en Review) + comentario de cierre `🏁 [Done]` + bitácora si hubo decisiones.

#### 1.10.3 Reglas duras del board

- ❌ **NUNCA** mover a `Done` sin OK explícito de munix + evidencia (tests verdes / verificación manual).
- ❌ **NUNCA** mover la card a `Review`: el agente termina, deja el comentario `✅ [Review]` con evidencia y avisa; **el movimiento a Review lo hace solo munix**. Si munix pide cambios, la card **vuelve a `Doing`** (la mueve munix o el agente con su OK) y el agente la retoma — **el desarrollo nunca ocurre estando la card en `Review`** (kanban: Review es inspección, no iteración).
- ❌ **NUNCA** trabajar en más de 1-2 cards a la vez (si estás en Doing, no coges otra).
- ❌ **NUNCA** crear cards duplicadas (los scripts son idempotentes; mirar antes con list-cards).
- ❌ **NUNCA** archivar/borrar cards sin decírselo a munix (archivar = perder evidencia).
- ❌ **NUNCA** renombrar listas ni cambiar la estructura del board sin OK (es en piedra). Incluida `Ideas` (2026-08-11: solo munix la llena; el agente no la toca). `Blocked` y `Manual tests` fueron **eliminadas** (2026-08-25).
- ❌ **NUNCA** marcar checklist sin haber verificado el criterio.
- ✅ **SIEMPRE** documentar con comentarios (inicio, atasco, review, cierre).
- ✅ **SIEMPRE** proponer (comentar) antes de mover cosas de Backlog — el backlog es prioridad de munix.

#### 1.10.4 Comentarios-bitácora (lo que separa el oro de la mierda)

Dentro de 6 meses, un agente (o munix) debe leer una card de Done y entender TODO sin hablar con nadie. **La memoria del proyecto vive en los comentarios del board, no en las conversaciones.** Los comentarios llevan prefijos escaneables (`🔄 [Doing]`, `🚧 [Atasco]`, `✅ [Review]`, `🏁 [Done]`, `🧠 Contexto`, `📌 Para el agente`, `♻️ Deuda`).

📖 **CUÁNDO:** al comentar cualquier card → [`trello-workflow.md`](file:///home/munix/Desarrollo/GitRepo/Vibes/.agent/workflows/trello-workflow.md) §📝 (tabla de prefijos, qué escribir y qué no).

#### 1.10.5 Detección de deuda (el agente como detector)

Si encuentra un bug que no arregla (fuera de scope), una feature que se rompe, o un refactor necesario → **crea card nueva** en Backlog con label `deuda` y checklist de criterios. **No lo arregla en caliente** (scope creep, §6). La card ES la documentación de la deuda.

📖 **CUÁNDO:** al detectar deuda → [`trello-workflow.md`](file:///home/munix/Desarrollo/GitRepo/Vibes/.agent/workflows/trello-workflow.md) §🆕 (comando de ejemplo).

#### 1.10.6 Cierre de card (checklist de verificación)

Antes de mover a Done: (1) pruebas manuales en Review + OK explícito de munix; (2) comentario de cierre con evidencia; (3) checklist **completo** (verificar `checklists[].items[].state` todos `complete` antes de mover); (4) comentario-bitácora si hubo decisiones. Si falta algo → la card se queda en `Review`.

📖 **CUÁNDO:** al cerrar una card → [`trello-workflow.md`](file:///home/munix/Desarrollo/GitRepo/Vibes/.agent/workflows/trello-workflow.md) §✅ (detalle mecánico del checklist).

#### 1.10.7 Roadmap, tareas y planes — Trello es la fuente de verdad — **INNEGOCIABLE**

Cuando munix pregunte por roadmap, tareas pendientes, planes o progreso, **siempre se consulta el board** (`node scripts/trello/list-cards.mjs --light`). No se contestan preguntas de roadmap mirando documentos estáticos, artifacts, ni la memoria de la conversación. Los artifacts temporales (plans, walkthroughs) son borradores que **siempre acaban reflejados en Trello** (ver §1.12); un plan en un artifact sin card en Trello es un plan que no existe. Nunca mantener un "roadmap paralelo" fuera del board.

#### 1.10.8 Artifacts de una tarea → se suben SOLOS a la card — **INNEGOCIABLE**

Todo artifact que se genere durante el trabajo de una card se sube **automáticamente** como adjunto, **sin intervención del usuario**: el agente no pregunta "¿subo esto?". Si se generó durante la tarea, se adjunta (al terminar, junto con el `✅ [Review]`; límite 10 MB por fichero; el código fuente no se sube salvo que sea evidencia).

📖 **CUÁNDO:** al terminar una tarea con artifacts → [`trello-workflow.md`](file:///home/munix/Desarrollo/GitRepo/Vibes/.agent/workflows/trello-workflow.md) §📎 (comando `attach-file.mjs` y detalles).

#### 1.10.9 Labels del board — toda card lleva labels coherentes — **INNEGOCIABLE**

Toda card que cree el agente lleva **al menos un label** que refleje su naturaleza (deuda/dimensión/fase), 1-3 labels, puestos al **crear** la card. Card sin labels o incoherentes = mal clasificada: rompe el filtrado del board.

📖 **CUÁNDO:** al crear o coger cualquier card → [`trello-workflow.md`](file:///home/munix/Desarrollo/GitRepo/Vibes/.agent/workflows/trello-workflow.md) §🏷️ (vocabulario canónico completo).

#### 1.10.10 Trazabilidad card ↔ conversación ↔ repo — **INNEGOCIABLE**

Todo movimiento a `Doing` lleva, en el primer comentario, la **ref-line** `🔗 Refs: conv=<id> | #VIBES-NN | <rama>@<commit> | contract=<c> | artifact=<ruta>`, inyectada con `--ref` antes del prefijo. Las refs de **git son explícitas** (las pasa el agente, sin autodetección — decisión de munix). La ref-line se actualiza en el `✅ [Review]` si la rama/commit cambió durante la slice.

📖 **CUÁNDO:** al mover una card a Doing → [`trello-workflow.md`](file:///home/munix/Desarrollo/GitRepo/Vibes/.agent/workflows/trello-workflow.md) §🔗 (tabla de campos, ejemplo bash).

#### 1.10.11 El número de card va en el título — `#XXX - título` — **INNEGOCIABLE**

Toda card lleva su **número (`idShort`) en el título**, formato `#XXX - título` (p. ej. `#131 - Ajustes para expertos`), **siempre al principio** (precediendo incluso `Deuda:` o `Review:`). No usar `#VIBES-` en el título (queda para ref-line y commits): basta `#XX`.

**Una vez creada la card, el agente DEBE verificar que el `#idShort` está al principio del título. Si no lo tiene, DEBE actualizarla para añadirlo — siempre, sin excepción. Es innegociable.** No se da una card por creada hasta que su título empieza por `#<idShort> - `.

> El `idShort` lo expone `list-cards --light`. La arqueología del porqué (app Android) está en [`trello-workflow.md`](file:///home/munix/Desarrollo/GitRepo/Vibes/.agent/workflows/trello-workflow.md) §📜.

#### 1.10.12 Trabajo sin card: captura progresiva — **INNEGOCIABLE**

Cuando munix pide trabajar sin especificar card, el agente **no inventa ni se lanza a lo loco**:

- **Idea difusa → esperar.** Sin scope ni criterio de "hecho", el agente NO crea la card ni trabaja: espera los mensajes de munix que hagan falta (o pregunta lo mínimo para desambiguar).
- **Idea clara → crear y avisar.** Card con los **4 campos mínimos** (título, qué, por qué, criterio de aceptación) → `#idShort` en el título (§1.10.11) → `Doing` con plan + ref-line (§1.10.10) + labels (§1.10.9) → **avisar a munix por el chat**.
- **Nunca trabajar con la idea difusa.** Sin card en `Doing` no hay plan, sin plan no hay código. (Excepción: one-shots/scripts que munix pida explícitamente — §1.4 — pero si se convierten en tarea, acaban en card.)

📖 **CUÁNDO:** al crear una card desde cero → [`trello-workflow.md`](file:///home/munix/Desarrollo/GitRepo/Vibes/.agent/workflows/trello-workflow.md) §0️⃣ (secuencia canónica de comandos).

> **Por qué:** el board es la única fuente de verdad (§1.10.7) y el checklist de una card son sus criterios de aceptación (§1.10.6). Si el agente se pone a picar código con una idea de tres frases sin card, el trabajo no es trazable, no tiene criterio de "hecho" y el board deja de reflejar la realidad. Esperar uno o dos mensajes más cuesta 30 segundos; inventarse una card que no era lo que munix quería cuesta una tarde.

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

Todo texto visible va a los diccionarios i18n (`messages.es.ts` / `messages.en.ts`) vía `t("namespace.key")`, **nunca hardcoded en el JSX**. Cada string nuevo en AMBOS diccionarios. **Ninguna tarea de UI se cierra con strings sin localizar — es criterio de aceptación.** Si al tocar un archivo aparece un string ajeno sin localizar, se pregunta a munix (ni se arregla en caliente ni se ignora). "Es un string trivial" no es respuesta aceptable.

📖 **CUÁNDO:** al crear/modificar cualquier `.tsx` o string visible → [`i18n.md`](file:///home/munix/Desarrollo/GitRepo/Vibes/.agent/rules/i18n.md) (reglas completas, `getOptions(t)`, `useI18n()` en subcomponentes).

---

### 1.16 Worktrees — detección y limpieza — **INNEGOCIABLE**

Gemelo de §1.16 en [vibes-core/AGENTS.md](file:///home/munix/Desarrollo/GitRepo/vibes-core/.agents/rules/AGENTS.md). El agente puede trabajar en un **worktree de git** (checkout aislado con su propia rama, compartiendo el `.git` del repo principal).

**Esencias:**
- **Detección SIEMPRE** antes de cualquier operación git: `git rev-parse --git-dir` → si contiene `worktrees`, estás en uno. No es automático que Antigravity meta al agente en un worktree; se detecta cada vez.
- Desde un worktree: **NUNCA** push, merge, borrar ramas ni tocar el repo principal. Commits locales en la rama del worktree son seguros.
- **Crear worktree por card:** SOLO si no se está ya en uno, derivado de la rama checkouteada en el repo principal, y **con OK explícito de munix** cada vez.
- **Prune (3 días):** worktrees sin movimiento en 3 días → reportar a munix y proponer `git worktree remove`; nunca borrar por libre.

📖 **CUÁNDO:** antes de cualquier operación git → [`worktrees.md`](file:///home/munix/Desarrollo/GitRepo/Vibes/.agent/rules/worktrees.md) (detección completa, creación por card, comandos de limpieza).

---

### 1.17 Tabla de triggers — cuándo consultar cada doc de detalle

El detalle procedimental de las reglas de dominio vive en docs autocontenidos (`Vibes/.agent/rules/` y `workflows/`). El índice solo lleva la esencia; el doc se consulta **bajo demanda** cuando salta su trigger. Ante la duda, se consulta el doc — nunca se aplica la regla de memoria.

| Doc | Trigger (comprobable) |
|---|---|
| [`worktrees.md`](file:///home/munix/Desarrollo/GitRepo/Vibes/.agent/rules/worktrees.md) | Antes de cualquier operación git: `git rev-parse --git-dir`; y cuando munix diga **"sube" / "integra el worktree" / "haz el push"** (§1.18) |
| [`i18n.md`](file:///home/munix/Desarrollo/GitRepo/Vibes/.agent/rules/i18n.md) | Si se crea/modifica cualquier `.tsx` o string visible |
| [`artifacts.md`](file:///home/munix/Desarrollo/GitRepo/Vibes/.agent/rules/artifacts.md) | Al crear un artifact o cerrar una slice |
| [`ag-chats.md`](file:///home/munix/Desarrollo/GitRepo/Vibes/.agent/rules/ag-chats.md) | Si se necesita leer conversaciones pasadas de Antigravity |
| [`trello-workflow.md`](file:///home/munix/Desarrollo/GitRepo/Vibes/.agent/workflows/trello-workflow.md) | Al crear/mover/comentar/cerrar una card de Trello |
| [`docs/TESTING.md`](file:///home/munix/Desarrollo/GitRepo/Vibes/docs/TESTING.md) | Antes de tocar cualquier test |

---

### 1.18 Vocabulario de integración de worktrees — **INNEGOCIABLE**

Cuando munix diga **"sube"**, **"integra el worktree"**, **"haz el push"** o similar para una card que se trabajó en un worktree, el agente ejecuta el **flujo completo de integración** ([`worktrees.md` §Integración](file:///home/munix/Desarrollo/GitRepo/Vibes/.agent/rules/worktrees.md)):

1. Merge **fast-forward en la RAMA MADRE** (la rama de la que nació el worktree: `feature/vibes-core` en Vibes, `main` en vibes-core).
2. Push de la rama madre.
3. Borrar la rama remota del worktree.
4. Limpiar rama local + worktree.

Ese pedido **es autorización implícita** para todo el flujo, incluido el push de integración — no requiere OK adicional por cada paso. El flujo es **manual, paso a paso** (ver [`worktrees.md` §Integración](file:///home/munix/Desarrollo/GitRepo/Vibes/.agent/rules/worktrees.md)): desde el repo principal, `git merge --ff-only <rama-worktree>` sobre la rama madre, `git push origin <rama-madre>`, `git push origin --delete <rama-worktree>` (solo si se pusheó en working), `git worktree remove` y `git branch -d`. **Nunca se intentó automatizar con script: los scripts de integración se eliminaron por inútiles** (se colgaban).

**Trabajo concurrente (VARIOS worktrees):** munix trabaja en varios worktrees a la vez. Si al integrar el ff-only falla porque la rama madre avanzó con los cambios de **otro worktree ya integrado**, el agente **rebasea automáticamente** la rama del worktree sobre la rama madre (para coger los cambios de los demás) y continúa con el ff-only. **NO se para** por desfase de concurrencia.

**Lo que NO es "sube":** pushear la rama del worktree como rama viva en remoto sin integrarla. La rama del worktree es efímera y **nunca se conserva como rama remota**.

**Reglas duras:**
- ❌ **NUNCA** integrar desde un worktree (siempre desde el repo principal).
- ❌ **NUNCA** merge 3-way sin OK: si el ff-only falla y el rebase automático no es posible o produce **CONFLICTOS**, **parar y avisar** — nunca resolver conflictos a lo bruto ni hacer 3-way.
- ❌ **NUNCA** dejar la rama del worktree viva en remoto tras integrar.
- ✅ **SIEMPRE** verificar la rama madre real antes de integrar (no asumir por el nombre del repo).
- ✅ **SIEMPRE** rebasear automáticamente sobre la rama madre si el ff-only falla por concurrencia (los cambios de otros worktrees se conservan).
- ✅ **SIEMPRE** commitea los cambios del worktree ANTES de integrar (el rebase y el ff-only trabajan sobre commits).

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
4. **Checklist de reglas de dominio:** repasa los archivos tocados y confirma qué docs de la tabla de triggers (§1.17) aplicaban (i18n si tocó UI, worktrees si tocó git, Trello si tocó cards, artifacts si creó artifacts) y si se consultaron. Si un doc aplicaba y no se consultó → consultarlo ahora, antes de cerrar.

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

Los artifacts atados a una card se nombran `<tipo>-vibes-<cardNumber>.md`, donde `cardNumber` es el `idShort` de la card (p. ej. `plan-vibes-92.md`, `walkthrough-vibes-92.md`). Si la card no tiene número claro, **preguntar antes** de crear el artifact; si munix dice que no hay card, artifact normal sin sufijo.

**Ciclo de vida:** el plan es un artifact (borrador fuera del working tree) mientras se pelotea la tarea → al terminar se **sube como adjunto a la card** (`attach-file.mjs`) → y se **elimina** del working tree. El board de Trello es el único lugar donde persisten los planes.

📖 **CUÁNDO:** al crear un artifact o confirmar un `idShort` → [`artifacts.md`](file:///home/munix/Desarrollo/GitRepo/Vibes/.agent/rules/artifacts.md) (naming completo, ciclo de vida, nunca pipes a `jq`).


### 1.13 Consulta de conversaciones de Antigravity (script `ag-chats.mjs`) — **INNEGOCIABLE**

Para revisar los chats del proyecto (incluido el estado **archivado**) y el contenido de cada conversación **sin abrir Antigravity** — p. ej. cuando munix se va al móvil y el agente debe consultar datos de conversaciones pasadas — usar el script [`scripts/ag-chats.mjs`](file:///home/munix/Desarrollo/GitRepo/Vibes/scripts/ag-chats.mjs). Es **solo lectura** sobre `~/.gemini/antigravity/`.

📖 **CUÁNDO:** al necesitar datos de conversaciones pasadas → [`ag-chats.md`](file:///home/munix/Desarrollo/GitRepo/Vibes/.agent/rules/ag-chats.md) (uso completo, opciones, notas).


---

**Última actualización:** 2026-08-26 (refactor de presentación: el detalle procedimental se extrae a docs autocontenidos en `.agent/rules/` y `workflows/trello-workflow.md`; el índice conserva las esencias + tabla de triggers §1.17 + checklist de cierre §3.3.4. Ninguna regla cambia de contenido ni de número).
**Mantenedor:** munix.
