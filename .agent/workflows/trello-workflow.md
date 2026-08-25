---
description: Protocolo del agente sobre el board de Trello — la única fuente de verdad del trabajo. El agente se auto-gestiona la cola: lee, coge, trabaja, documenta, cierra. munix solo dice qué y cuándo, y revisa el código final.
---

# 🗂️ Trello Workflow — El agente como orquestador de su propia cola

> **Filosofía:** munix mira el board, dice "esto", y el agente hace el resto.
> El agente NO es un ejecutor pasivo que espera instrucciones — es el dueño de la
> gestión del trabajo sobre el board. munix revisa **el código final y las pruebas**,
> no el proceso.

## 🎯 Objetivo

Que el board de Trello sea **la única fuente de verdad** del estado del proyecto:

- **Lo que está hecho** → `Done` (con su evidencia)
- **Lo que toca ahora** → `To-do` / `Doing`
- **Lo que está atascado** → se documenta en la card con el comentario `🚧 [Atasco]` (no hay columna `Blocked`)
- **Lo que falta por hacer** → `Backlog` (con su contexto)

El agente **vive en el board**: cada card tiene una **descripción ejecutiva** (qué/por
qué/cómo se verificó — para munix y su jefe) y **comentarios-bitácora** (contexto
técnico, decisiones, referencias a archivos — para el agente dentro de 6 meses).

> [!IMPORTANT]
> **Nada de acumular mierda.** Toda card que se mueve a `Done` DEBE tener:
> evidencia de verificación, comentario de cierre, y —si aplica— tests verdes.
> Una card sin evidencia no se cierra. Punto.

---

## 🧭 Las listas (canónicas, en orden)

| Lista | Significado | Quién la usa |
|---|---|---|
| **Backlog** | Deudas + roadmap post-MVP (fases 2-5) | El agente la lee para priorizar |
| **Ideas** | Ideas sueltas, NO planificadas (fuera del flujo, no se priorizan) | munix las apunta; el agente no las toca |
| **To-do** | Pendiente inmediato (ops, próximo trabajo) | munix la llena; el agente la consume |
| **Doing** | En curso ahora mismo | El agente (1-2 cards máximo) |
| **Review** | Terminada, esperando revisión de munix (incluye las pruebas manuales) | **Solo munix** la mueve (el agente deja la evidencia y avisa) |
| **Done** | Cerrada y verificada | El agente la mueve tras OK de munix |

> **No hay columna `Blocked` ni `Manual tests`** (eliminadas 2026-08-25): los atascos
> se documentan en la card con `🚧 [Atasco]` y las pruebas manuales las hace munix
> dentro de `Review` antes de dar el OK.

**Regla de oro:** el agente NO trabaja en más de 1-2 cards a la vez. Si está en
`Doing`, no coge otra hasta cerrar o dejar la actual atascada (con `🚧 [Atasco]`).

---

## 🔧 Los scripts (la caja de herramientas)

Todo vive en [`scripts/trello/`](file:///home/munix/Desarrollo/GitRepo/Vibes/scripts/trello/) y usa la API de Trello con Node nativo (sin deps). Las credenciales están en `.env.trello` (raíz del proyecto).

| Script | Función | Comando clave |
|---|---|---|
| [list-cards.mjs](file:///home/munix/Desarrollo/GitRepo/Vibes/scripts/trello/list-cards.mjs) | Listar cards. **`--light` es el modo por defecto** (resumen ligero: lista, labels, badges, nº comentarios). Para ver una card en detalle, `--detail` **SIEMPRE redirigido a un fichero en `/tmp`** (ver §1.1) | `node scripts/trello/list-cards.mjs --light` · `node scripts/trello/list-cards.mjs --number 139 --detail > /tmp/card-139.json` |
| [create-card.mjs](file:///home/munix/Desarrollo/GitRepo/Vibes/scripts/trello/create-card.mjs) | Crear card idempotente (no duplica por título) | `node scripts/trello/create-card.mjs --title "X" --desc "Y" --list "To-do" --labels "deuda"` |
| [update-card.mjs](file:///home/munix/Desarrollo/GitRepo/Vibes/scripts/trello/update-card.mjs) | Actualizar (nombre, desc, mover, labels, checklist, comentario, archivar) | `node scripts/trello/update-card.mjs --card "X" --name "Nuevo título" --move "Done" --comment "..."` |
| [attach-file.mjs](file:///home/munix/Desarrollo/GitRepo/Vibes/scripts/trello/attach-file.mjs) | Adjuntar ficheros locales a una card (multipart, máx 10 MB por fichero) | `node scripts/trello/attach-file.mjs --card "X" --file "./captura.png,./plan.pdf"` |
| [audit-comments.mjs](file:///home/munix/Desarrollo/GitRepo/Vibes/scripts/trello/audit-comments.mjs) | Auditar comentarios y descripciones en busca de `\n` literal (y otros caracteres escapados mal) | `node scripts/trello/audit-comments.mjs [--json] [--fix]` |

**Convenciones:**
- **Siempre** usa el `idShort` como identificador (`--card "#92"` o `--card 92`), no el título. El `idShort` es estable; el título puede editarse y romper la referencia. Solo usa el título si no conoces el número.
- **Toda card lleva su número en el título**: formato `#XXX - título` (p. ej. `#92 - Deuda: compactar en caliente`). La app de Android no muestra el número, así que el `#XXX` va SIEMPRE al principio del título. **Una vez creada la card, el agente DEBE verificar que el `#idShort` está al principio del título; si no lo tiene, DEBE actualizarla para añadirlo — siempre, sin excepción. Es innegociable.** Detalle en AGENTS.md §1.10.11.
- Los scripts son **idempotentes**: crear algo que ya existe avisa y no duplica.
- La salida normal (sin flags) es para humanos; `--light` es el modo del agente para leer el board; `--detail` **solo redirigido a fichero tmp**, nunca a stdout ni pipeado.

---

## 🔎 Referenciar una card: el `--card` flexible

`update-card.mjs --card` y `create-card.mjs` usan `resolveCard(ref)` desde
[`lib.mjs`](file:///home/munix/Desarrollo/GitRepo/Vibes/scripts/trello/lib.mjs), que
acepta **4 formas** de referenciar una card:

1. **`#92`** o **`92`** → `idShort` (el número que muestra el power-up Trello como
   `#VIBES-92`). Se listan todas las cards y se filtra localmente (la API de Trello
   no soporta `idShort` como filtro directo → da error 400).
2. **`sQM17O2M`** → `shortLink` (el shortId de la URL de la card en Trello).
3. **Título exacto** → case-insensitive, coincide el nombre completo.
4. **Prefijo del título** → fallback parcial (case-insensitive).

Ejemplos: `--card #92`, `--card 92`, `--card sQM17O2M`,
`--card "B7: Reorganizar scripts trello"`.

> [!TIP]
> Usa el `idShort` (`#92`) en favor de títulos largos. El `idShort` no cambia
> nunca; el título sí puede editarse. Para scripts programáticos, `resolveCard`
> expone una función reutilizable.

---

## 🔄 El ciclo de vida de una card (paso a paso)

### 1️⃣ Leer el board (punto de partida)

Siempre que el agente vaya a trabajar, **primero lee el board**:

```bash
# ✅ SIEMPRE usar --light para leer el board (resumen ligero: lista, labels, badges, nº comentarios)
node scripts/trello/list-cards.mjs --light
```

> [!IMPORTANT]
> **`--light` es el modo por defecto para TODO.** Es suficiente para priorizar,
> buscar cards y ver el estado general (badges, nº de comentarios, checklist
> resumido). Si necesitas más detalle de una card, usa `--detail` **redirigido a
> un fichero tmp** (abajo).

#### 1.1 Ver una card en detalle: SIEMPRE a fichero tmp

Cuando necesites los checklists completos o datos detallados de una card:

```bash
# ✅ Correcto: redirigir a fichero tmp y leerlo con view_file
node scripts/trello/list-cards.mjs --number 139 --detail > /tmp/card-139.json
# luego: view_file /tmp/card-139.json
```

> [!CAUTION]
> **PROHIBIDO pipear la salida de los scripts a `jq` o `python`.**
> El output se trunca en pipes externos y produce JSON corrupto
> (`jq: parse error: Unfinished string at EOF`). Esto ha pasado de verdad y
> es una pérdida de tiempo miserable.
>
> ```bash
> # ❌ NUNCA: pipear a jq (se trunca, parse error)
> node scripts/trello/list-cards.mjs --number 73 --detail | jq '.[] | select(...)'
>
> # ❌ NUNCA: pipear a python
> node scripts/trello/list-cards.mjs --detail | python3 -c 'import json,sys; ...'
>
> # ✅ SIEMPRE: fichero tmp + view_file
> node scripts/trello/list-cards.mjs --number 73 --detail > /tmp/card-73.json
> ```
>
> El agente lee el fichero tmp con su tool de lectura de ficheros (`view_file`).
> Los ficheros en `/tmp` no se cortan, no se truncan, y se pueden leer por
> trozos si son grandes.

Para buscar una card concreta por su número (idShort):

```bash
node scripts/trello/list-cards.mjs --number 139 --light   # resumen rápido (por defecto)
node scripts/trello/list-cards.mjs --number 139 --detail > /tmp/card-139.json  # detalle completo
```

El agente **prioriza así**:
1. Cards en `To-do` que munix haya dejado
2. La card más antigua de `Backlog` con mayor valor (labels `deuda` primero, luego fases)

> [!NOTE]
> La lista **`Ideas` queda FUERA del flujo**: son notas de munix sin planificar.
> El agente **no** las prioriza, no las mueve a `To-do`/`Doing`, ni las trabaja —
> solo las lee si munix se lo pide. No es backlog.

> [!NOTE]
> Si no hay nada en `To-do`, el agente **propone** sacar algo de `Backlog` a `To-do`
> (con un comentario explicando por qué), pero **NO lo mueve sin OK** — el backlog
> es prioridad de munix, no del agente.

### 2️⃣ Coger la card (To-do → Doing)

```bash
node scripts/trello/update-card.mjs \
  --card "Título de la card" \
  --move "Doing" \
  --comment "🔄 [Doing] Empiezo esta card. Plan: ..."
```

El comentario de inicio documenta **el plan** (1-2 líneas) para que cualquiera sepa qué se va a hacer.

> **Labels:** si la card que coges no tiene labels, o los tiene incoherentes con su contenido, corrígelos al cogerla (regla AGENTS.md §1.10.9). Toda card lleva labels de su naturaleza: `deuda` si es deuda, la dimensión (tools, prompts, runtime, ui...) y/o la fase (fase-2..5).

### 3️⃣ Trabajar la card

El agente hace el trabajo (código, tests, docs) **siguiendo AGENTS.md**:
- Slices verticales, tests por slice, contract tests golden, no regresiones.
- **Avanza por el checklist** de la card (si tiene) marcando items con `--check-item` (individual, repetible, acepta comas):

```bash
node scripts/trello/update-card.mjs --card "X" --check-item "Criterio 1"
```

> [!TIP]
> `--check-all` marca **todos** los items de todos los checklists de una card como complete en un solo paso. Útil al cerrar la card. El agente **siempre verifica** los items (ver `list-cards --number X --detail > /tmp/card-X.json` expone `checklists[].items[].state`) antes de usarlo.

```bash
node scripts/trello/update-card.mjs --card "X" --check-all
```

> [!IMPORTANT]
> El checklist de una card = sus **criterios de aceptación**. Marcar un item =
> declarar que está cumplido con evidencia. No marcar a lo bruto.

### 4️⃣ Encontrar un atasco (sin columna — comentario `🚧 [Atasco]`)

Si el agente no puede avanzar solo (falta decisión de munix, falta una dep, falta acceso), **NO se queda bloqueado en silencio**. No hay columna `Blocked` (eliminada 2026-08-25): la card se queda en `Doing` con el atasco documentado:

```bash
node scripts/trello/update-card.mjs \
  --card "X" \
  --comment "🚧 [Atasco] Necesito que munix decida: A o B. Detalle: ..."
```

El comentario DEBE explicar **qué falta** y **qué se necesita** para desbloquear. El agente además avisa a munix por el chat. Cuando munix decide, la card ya está en `Doing` y el agente la retoma directamente.

### 5️⃣ Terminar el trabajo (Doing, con comentario `✅ [Review]` — NO se mueve)

Cuando el código está listo y **verificado** (tests verdes, typecheck, etc.), el agente **NO mueve la card a `Review`** — deja la evidencia en la card en `Doing` y avisa a munix:

```bash
node scripts/trello/update-card.mjs \
  --card "X" \
  --comment "✅ [Review] Trabajo completado. Tests: N verdes (comando X). Archivos tocados: ..."
```

**Solo munix** mueve la card de `Doing` a `Review` cuando la acepta. El comentario de Review resume **qué se hizo** + **evidencia de verificación** (comandos y resultados). Si munix pide cambios, la card **vuelve a `Doing`** (la mueve munix o el agente con su OK) y el agente la retoma — **el desarrollo nunca ocurre estando la card en `Review`** (kanban: Review es inspección, no iteración).

### 6️⃣ Probar manualmente (dentro de `Review` — sin columna)

Las pruebas manuales las hace munix **dentro de `Review`** (no hay columna `Manual tests`, eliminada 2026-08-25), antes de dar el OK de cierre:

- munix valida el comportamiento (los bullets del `feature_inventory` del proyecto)
- si algo falla, la card vuelve a `Doing` con el feedback (paso 5)
- si pasa, munix da el OK para cerrar

### 7️⃣ Cerrar la card (Review → Done) — el momento CRÍTICO

Cuando munix da el OK (verbalmente, tras las pruebas manuales, o moviendo él la card):

```bash
node scripts/trello/update-card.mjs \
  --card "X" \
  --move "Done" \
  --comment "🏁 [Done] Cerrada con OK de munix. Evidencia final: ..."
```

> [!CAUTION]
> **Una card NO se mueve a Done sin:**
> 1. **OK explícito de munix** (verbal o moviendo él la card)
> 2. **Comentario de cierre** con la evidencia (tests verdes, verificación manual)
> 3. **Checklist completo** si la card tiene checklist
> 4. **Comentario-bitácora** si el trabajo tuvo decisiones no obvias (para el agente futuro)
>
> Si falta algo → la card se queda en Review hasta que esté completa.

---

## 📝 El arte de los comentarios-bitácora (lo que separa el oro de la mierda)

> **Por qué:** munix quiere **olvidarse de ser la fuente de memoria**. Dentro de 6
> meses, un agente (o munix) debe poder leer una card de `Done` y entender TODO:
> qué se hizo, por qué, cómo, qué se decidió, qué se descartó, dónde está el código.

### Formato de los comentarios

Usa **prefijos emoji + etiqueta** para que sean escaneables:

| Prefijo | Uso | Ejemplo |
|---|---|---|
| `🔄 [Doing]` | Inicio de trabajo (plan) | `🔄 [Doing] Empiezo. Plan: migrar X a Y, tests A/B/C` |
| `🚧 [Atasco]` | Atasco (qué falta) | `🚧 [Atasco] Falta decisión munix: ¿SQLite o Postgres?` |
| `✅ [Review]` | Trabajo listo (evidencia) | `✅ [Review] Tests: 12 verdes (pnpm test). Archivos: 3` |
| `🏁 [Done]` | Cierre con OK | `🏁 [Done] OK munix. Cerrada.` |
| `🧠 Contexto` | Decisión/porqué técnico | `🧠 Contexto: elegimos X sobre Y porque ...` |
| `📌 Para el agente` | Nota para el futuro | `📌 Para el agente: si tocas esto, ojo con Z` |
| `♻️ Deuda` | Deuda detectada | `♻️ Deuda: al hacer X, Y quedó sin testear → card nueva` |

### Qué escribir (y qué NO)

**SÍ escribir:**
- Decisiones y su **porqué** (el "por qué" es oro; el "qué" ya está en el código)
- Alternativas descartadas y por qué
- Referencias a archivos/funciones clave (`src/ipc/handlers/foo.ts`)
- Bugs cazados en el camino y cómo
- Cosas no obvias que un agente futuro NO sabría por leer el código

**NO escribir:**
- "He hecho la card" (no aporta nada)
- Repetir la descripción (ya está en la card)
- Detalles que ya están en el código/commits (el commit ya existe; el comentario añade contexto)

> [!TIP]
> Regla del pulgar: **si un agente futuro leyera SOLO los comentarios de la card,
> ¿podría retomar el trabajo sin hablar con nadie?** Si no, falta contexto.

---

## 📎 Artifacts de una tarea → se suben SOLOS a la card

Todo artifact que se genere durante el trabajo de una card (plan, walkthrough,
análisis, informe de tests, captura, fixture, documento de apoyo) se sube
**automáticamente** como adjunto a la card correspondiente, **sin intervención del
usuario**. El agente no espera a que munix lo pida ni pregunta: si el artifact se
generó durante la tarea, se adjunta.

```bash
node scripts/trello/attach-file.mjs \
  --card "Título de la card" \
  --file "<ruta-del-artifact>/plan-vibes-NN.md,./captura.png"
```

- Se sube al terminar el trabajo (junto con el `✅ [Review]`), o antes si el artifact es grande o muestra progreso.
- **Card correspondiente** = la card en la que se trabaja (Doing). Si un artifact no tiene card propia, se adjunta a la de la tarea.
- **Límite:** 10 MB por fichero (API de Trello). Si lo excede, avisarlo en el comentario (nunca omitirlo en silencio).
- **Código fuente:** no se sube al board (vive en el repo); solo si es evidencia relevante (p. ej. un script entregable).

> [!IMPORTANT]
> **Ciclo de vida de un artifact de plan:**
> 1. El plan de una tarea se crea como **artifact** (borrador de trabajo, p. ej.
>    `plan-vibes-<cardNumber>.md`) mientras se pelotea la tarea con munix — **no**
>    como documento del repo. Vive en el directorio de artifacts del agente
>    (fuera del working tree).
> 2. Al terminar (mover a `Review`), se **sube como adjunto** a la card (comando
>    de arriba) y **se elimina** del working tree.
> 3. El board de Trello es el **único** lugar donde persisten los planes. Los
>    artifacts de planes terminados no se acumulan en el repo.

---

## 🆕 Detectar deuda nueva (el agente como detector)

Mientras trabaja, si el agente encuentra:
- Un bug que no arregla (fuera de scope) → **card nueva** en Backlog con label `deuda`
- Una feature que se rompe por un cambio → **card nueva** con contexto
- Un refactor necesario → **card nueva** (propuesta, no ejecutada)

```bash
node scripts/trello/create-card.mjs \
  --title "Deuda: [qué es]" \
  --desc "**Qué:** ...\n\n**Por qué importa:** ...\n\n**Checklist:** ..." \
  --list "Backlog" \
  --labels "deuda" \
  --checklist "Criterio 1|Criterio 2"
# Tras crear, añade el número al título (convención #XXX - título, AGENTS.md §1.10.11):
node scripts/trello/update-card.mjs --card "Deuda: [qué es]" \
  --name "#<idShort> - Deuda: [qué es]"
```

> [!NOTE]
> La deuda nueva NO se arregla en caliente (scope creep). Se documenta como card y
> se prioriza en el backlog. Regla de AGENTS.md: "Lo arreglo después" no existe —
> o se arregla ahora, o se documenta como deuda explícita. La card ES esa documentación.

---

---

## 🧪 Ejemplo completo (end-to-end)

Supongamos que munix dice: *"haz la compactación Modo A"*.

1. **Leer**: `list-cards --light` → ve la card "Fase 4: Compactación Modo A — compactor + hook en loop" en Backlog.
2. **Proponer**: comenta *"Propongo mover esta card a To-do para trabajarla"* → munix OK (o el agente la mueve si munix dijo "hazla").
3. **Coger**: `--move "Doing" --comment "🔄 [Doing] Plan: estimator → summarizer → compactor → hook en loop → tests"`
4. **Trabajar**: código + tests. Marca checklist: `--check-item "Compactor.ts (Modo A)"`.
5. **Atasco** (ej. duda de diseño): `--comment "🚧 [Atasco] ¿El buffer reservado debe ser % o tokens? Necesito decisión de munix."` (la card se queda en Doing) + aviso a munix por el chat.
6. **Desbloqueo**: munix decide → el agente retoma la card directamente (sigue en Doing).
7. **Terminar**: `--comment "✅ [Review] Implementado. Tests: 14 verdes (pnpm test). Archivos: estimator.ts, summarizer.ts, compactor.ts, loop.ts"` → la card se queda en Doing con la evidencia; el agente avisa a munix.
8. **Munix revisa**: munix mueve la card a `Review`, revisa el código y hace las pruebas manuales dentro de Review (no hay columna Manual tests). Si algo falla → vuelve a Doing.
9. **Cerrar**: munix da OK tras las pruebas → `--move "Done" --comment "🏁 [Done] OK munix. Cerrada."` + `🧠 Contexto` si hubo decisiones.

> [!IMPORTANT]
> **Sobre los saltos de línea (`\n`)**: bash NO expande `\n` al pasar argumentos por
> CLI. Si escribes `--comment "línea 1\nlínea 2"`, los dos caracteres `\` y `n`
> llegan literales a Trello y se pintan como `\n` en pantalla.
>
> **Solución**: los scripts `create-card.mjs` y `update-card.mjs` ya aplican
> `unescape()` automáticamente, convirtiendo `\n` → salto real y `\t` → tab.
> **El agente puede escribir `\n` con confianza**; ya no hace falta escribir
> caracteres de escape ni hacer cosas raras.

---

## ⚠️ Reglas duras (anti-patterns)

- ❌ **NO** mover una card a Done sin OK de munix + evidencia.
- ❌ **NO** trabajar en más de 1-2 cards a la vez.
- ❌ **NO** crear cards duplicadas (los scripts son idempotentes, pero el agente debe mirar antes).
- ❌ **NO** borrar/archivar cards sin decirle a munix (archivar = perder evidencia).
  - 📌 Para archivar usa el flag `--archive` de `update-card.mjs` (pone `closed=true`):
    ```bash
    node scripts/trello/update-card.mjs --card "X" --archive --comment "🗄️ [Archivada] Motivo..."
    ```
  - ⚠️ Archivar oculta la card del board activo pero conserva su historial/comentarios. **Recuperable** si hiciera falta. Siempre deja un comentario que diga **a qué card nueva (o por qué) se archiva**, para no perder la trazabilidad.
- ❌ **NO** renombrar listas ni cambiar la estructura del board sin OK (es en piedra). Incluida `Ideas` (2026-08-11): solo munix la llena; el agente no la toca. `Blocked` y `Manual tests` fueron **eliminadas** (2026-08-25).
- ❌ **NO** mover la card a `Review`: el agente deja la evidencia (`✅ [Review]`) en la card en `Doing` y avisa; **solo munix** la mueve a `Review`.
- ❌ **NO** marcar checklist items sin haber verificado.
- ✅ **SÍ** documentar SIEMPRE con comentarios (inicio, atasco, review, cierre).
- ✅ **SÍ** proponer (comentar) antes de mover cosas de Backlog.
- ✅ **SÍ** crear cards de deuda cuando se detecte.

---

## 📌 Resumen para el agente (cheatsheet)

```
1. LEE el board (list-cards --light) → prioriza: To-do > Backlog propuesto
   · Para una card concreta: list-cards --number 139 --detail > /tmp/card-139.json
2. COGE la card (--move Doing + comentario plan)
3. TRABAJA (AGENTS.md: slices, tests, contract golden) + marca checklist
4. SI te atascas → comentario 🚧 [Atasco] en la card (sigue en Doing) + avisa a munix (no silencio)
5. AL TERMINAR → comentario ✅ [Review] con evidencia (tests, archivos); NO muevas la card (la mueve munix a Review)
6. MUNIX revisa y hace las pruebas manuales EN Review (no hay columna Manual tests); si pide cambios → vuelve a Doing
7. CON OK de munix (tras las pruebas en Review) → Done con comentario de cierre + bitácora si hay decisiones
8. DEUDA nueva → create-card en Backlog (no la arregles en caliente)
9. LABELS: toda card que creas/coges lleva labels coherentes (deuda/dimensión/fase) — vocabulario en AGENTS.md §1.10.9
```

> [!IMPORTANT]
> El board es la fuente de verdad. Si un comentario y el código se contradicen,
> el código manda pero el comentario debe actualizarse. La memoria del agente está
> en el board, no en la conversación.
