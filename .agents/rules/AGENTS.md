# AGENTS.md — Reglas del proyecto Vibes / mCode

> Contrato de trabajo entre **munix** (product owner) y el agente.
> Las reglas aquí son **en piedra** salvo que munix diga lo contrario explícitamente.

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
| **Vivos** | [`phase1-tasks.md`](file:///home/munix/Desarrollo/GitRepo/Vibes/docs/plans/phase1-tasks.md), [`post-mvp-roadmap.md`](file:///home/munix/Desarrollo/GitRepo/Vibes/docs/plans/post-mvp-roadmap.md), [`phase1-mvp.md`](file:///home/munix/Desarrollo/GitRepo/Vibes/docs/plans/phase1-mvp.md), prioridades de cada fase | Se actualizan libremente como parte del trabajo. Cualquier cambio se documenta en el archivo. |
| **Roadmap** | [`implementation_plan.md`](file:///home/munix/Desarrollo/GitRepo/Vibes/docs/plans/implementation_plan.md) (el documento guía, la constitución del proyecto) | El agente lo lee pero no lo modifica salvo petición explícita. Es la constitución del proyecto. |

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

### 1.4 Bases de datos — el agente propone, munix ejecuta

- El agente **nunca** ejecuta queries de DB directamente contra bases de producción/desarrollo de munix.
- El agente entrega las queries exactas (DDL/DML) en el documento de la tarea.
- munix las ejecuta, valida, y reporta.
- Para tests del agente (vibes-core), las migraciones a SQLite de tests sí las gestiona el agente, pero documenta el schema esperado.

---

### 1.5 Repositorio y builds — **rutina del agente**

**Lo que el agente ejecuta por su cuenta (verificación pasiva, sin side-effects fuera del árbol):**
- `pnpm test` / `vitest` (correr la suite).
- `pnpm typecheck` / `tsc --noEmit`.
- `pnpm lint` / `eslint`.
- Comandos puramente lectores (`ls`, `cat`, `grep`, `find`, `wc`, `git status`, `git diff`, `git log`).

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

---

### 1.6 Frontera runtime ↔ carcasa (P1 del Roadmap)

- **Runtime** (vibes-core): provider-agnóstico, no conoce UI, no conoce Vibes, no conoce OpenCode. Solo sabe de `RuntimeEvent`, `MessageContentPart`, `ToolResult`, `Workspace`.
- **Carcasa** (Vibes/mCode): traduce `RuntimeEvent` a tags `<vibes-*>` para la UI. Decide prompts, contextos, pills de permisos, visionador sintético. El runtime nunca hace preprocessing de visión.
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

**Los scripts** viven en [`scripts/trello/`](file:///home/munix/Desarrollo/GitRepo/Vibes/scripts/trello/) (Node nativo, sin deps, idempotentes): `list-cards.mjs` (leer), `create-card.mjs` (crear), `update-card.mjs` (mover/actualizar/comentar), `bootstrap-board.mjs` (montar/renormalizar). Credenciales en `.env.trello` (raíz).

#### 1.10.1 Las listas (canónicas, no renombrar sin OK)

| Lista | Qué es | Quién la mueve |
|---|---|---|
| **Backlog** | Deudas + roadmap post-MVP (fases 2-5) | El agente propone, munix decide |
| **To-do** | Pendiente inmediato (ops, próximo trabajo) | munix la llena; el agente la consume |
| **Doing** | En curso (máx 1-2) | El agente |
| **Blocked** | Atascada (falta munix/decisión/dep) | El agente con motivo |
| **Review** | Terminada, esperando OK de munix | El agente al terminar |
| **Done** | Cerrada y verificada | El agente tras OK explícito de munix |

#### 1.10.2 El flujo obligatorio (cada card que se trabaja)

1. **Leer el board** (`list-cards --json`) antes de trabajar. Priorizar: Blocked desbloqueable → To-do → Backlog propuesto.
2. **Coger la card**: `update-card --move Doing --comment "🔄 [Doing] Plan: ..."` — el comentario de inicio documenta el plan (1-2 líneas).
3. **Trabajar** siguiendo AGENTS.md (slices verticales, tests, contract golden). Marcar checklist con `--check-item` conforme se cumplen criterios (no a lo bruto).
4. **Atasco** → `--move Blocked --comment "🚧 [Blocked] Falta: ..."` — **nunca silencio**. El comentario dice qué falta y qué se necesita para desbloquear.
5. **Terminar** → `--move Review --comment "✅ [Review] Tests: N verdes (cmd). Archivos: ..."` — con evidencia de verificación.
6. **Cerrar** → `--move Done` **SOLO con OK explícito de munix** + comentario de cierre `🏁 [Done]` + bitácora si hubo decisiones.

#### 1.10.3 Reglas duras del board

- ❌ **NUNCA** mover a `Done` sin OK explícito de munix + evidencia (tests verdes / verificación manual).
- ❌ **NUNCA** trabajar en más de 1-2 cards a la vez (si estás en Doing, no coges otra).
- ❌ **NUNCA** crear cards duplicadas (los scripts son idempotentes; mirar antes con list-cards).
- ❌ **NUNCA** archivar/borrar cards sin decírselo a munix (archivar = perder evidencia).
- ❌ **NUNCA** renombrar listas ni cambiar la estructura del board sin OK (es en piedra).
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

Antes de mover a Done, el agente verifica TODOS:
1. ¿OK explícito de munix? (verbal o moviendo él la card)
2. ¿Comentario de cierre con evidencia? (tests verdes, verificación manual)
3. ¿Checklist completo? (si la card tiene)
4. ¿Comentario-bitácora si hubo decisiones no obvias?

Si falta algo → la card se queda en Review.

---

## 2. Cosas que se hablan al post-MVP

Estas se mencionan pero no se deciden todavía. Si salen en conversación, el agente anota pero no actúa:

- **DP-2 (attachments/vision)**: soporte multimodal en `MessageContentPart` → Fase 3. mCode implementa visionador sintético.
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
- Si el provider por defecto (OpenAI-compatible) no soporta visión, mCode implementa fallback con visionador sintético.
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
- Mezclar mcode (producto/carcasa) con opencode (motor deprecado) en explicaciones. mCode es la carcasa, vibes-core es el runtime, OpenCode es lo que estamos sustituyendo.

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

El `cardNumber` se obtiene de `node scripts/trello/list-cards.mjs --json | jq '.idShort'`
o con `resolveCard` desde `scripts/trello/lib.mjs`.

---

**Última actualización:** 2026-08-10 (rutina del agente en §1.5: tests/typecheck/lint por cuenta propia, build/restart/repo con OK explícito).
**Mantenedor:** munix.
