# Fase 2 (alternativa) — Hardening del MVP

> **Documento vivo.** Se actualiza libremente como parte del trabajo.
> Decisiones "en piedra" se reflejan en `implementation_plan.md` y AGENTS.md.

**Estado:** Borrador pendiente de aprobación de munix (2026-08-09).
**Trigger:** Finalización exitosa del swap OpenCode → vibes-core (B1–B5).
**Filosofía:** sin features nuevas. Cegar el swap antes de construir encima.

---

## ⚠️ Hallazgo crítico al planificar (validado 10:29)

El documento [`walkthrough.md`](file:///home/munix/Desarrollo/GitRepo/Vibes/docs/plans/walkthrough.md) describe el swap como si B6 (eliminación de opencode_adapter) estuviera hecho. **No lo está.** Verificación directa:

| Archivo | Estado real | Lo que dice walkthrough.md |
|---|---|---|
| [chat_stream_handlers.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/handlers/chat_stream_handlers.ts#L2080) | ✅ Ya enruta a `handleRuntimeStream` | OK |
| [app_handlers.ts#L85](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/handlers/app_handlers.ts#L85) | ✅ `restartOpenCodeServer` ya es no-op | OK |
| [opencode_adapter.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/handlers/opencode_adapter.ts) | ❌ Existe, 201 KB, 5500 líneas | "Eliminado" |
| [app_handlers.ts#L1162, #L1645](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/handlers/app_handlers.ts#L1162) | ❌ `await import("./opencode_adapter")` sigue activo | "No se usa" |
| [main.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/main.ts) | ❌ Bloque `setImmediate` con `ensureOpenCode`, `getCachedOpenCodeVersion` siguen | "Eliminado" |

**Conclusión:** B1–B5 están. B6 está descrito como hecho pero no implementado. Esta fase ejecuta realmente B6 + los tracks 2 y 3.

---

## Tracks

### Track 1 — Finalizar B6 (eliminación real de opencode)

**Objetivo:** cerrar el swap. Que `opencode_adapter.ts` sea historia, no un shim de 200 KB que ocupa sitio.

**Acciones concretas:**

1. Auditar cada `import "opencode_adapter"` en todo `src/` con `grep -rln "opencode_adapter" src/`. Lista exhaustiva.
2. Para cada import, decidir:
   - **Borrar el import** si solo exponía funciones que ahora viven en `runtime_bridge.ts` (las 7 que migró B2: `handleOpenCodeStream`, `revertLastOpenCodeMessage`, `destroyOpenCodeSession`, etc.).
   - **Migrar al runtime** si hay lógica específica de opencode que el runtime aún no cubre.
   - **Marcar como dependencia cruzada** si la lógica es legítima de Vibes (ej: side-effects de DB que opencode_adapter dispara).
3. Borrar el archivo [`opencode_adapter.ts`](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/handlers/opencode_adapter.ts) (201 KB) tras vaciarlo.
4. Eliminar de [main.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/main.ts):
   - `import { ensureOpenCodeInstalled }` y la llamada `setImmediate`.
   - `import { shutdownOpenCode }` y la llamada en `will-quit`.
   - Bloque de migración de skills opencode.
   - VACUUM de `opencode.db`.
5. Eliminar [`opencode_diagnostic_handlers.ts`](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/handlers/opencode_diagnostic_handlers.ts) si solo servía a opencode.
6. Eliminar migración SQL de la tabla `opencode.db` en [migrations.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/db/migrations.ts) o donde viva.
7. Borrar dependencias de `package.json`: `@opencode-ai/sdk` y cualquier otra de opencode.

**Criterio de aceptación:**
- `grep -rln "opencode" src/ --include="*.ts"` devuelve **0 resultados** salvo en `runtime_bridge/` (donde se comenta la migración) y `docs/`.
- `pnpm build` (cuando munix lo autorice) sin warnings de imports rotos.
- App arranca y un chat normal funciona (smoke test manual documentado en el PR).

**Riesgos:**
- Side-effects ocultos en opencode_adapter que no estén en runtime_bridge.
- Tabla `sessions.opencode_session_id` referenciada en DB de Vibes → la columna podría quedarse huérfana (decidir: borrar columna en otra migración o dejarla como dead column con comentario).
- Tests que importen de opencode_adapter directamente.

**Estrategia de bajo riesgo:**
1. Hacer el barrido de imports **primero**, sin borrar el archivo.
2. Compilar con TypeScript, corregir lo que rompa.
3. Solo entonces borrar el archivo.

### Track 2 — Contract tests de error (3 escenarios)

**Objetivo:** cerrar los huecos de coverage más dolorosos del contract test golden.

**Archivos a tocar:**
- [`runtime_bridge.contract.test.ts`](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/runtime/runtime_bridge.contract.test.ts) — añadir 3 describe blocks.
- Si el mock de fetch está en un helper separado, reutilizar.

**Tests a añadir:**

#### 2.1 Rate-limit 429
- Mock: provider devuelve 429 con header `Retry-After: 2` en el 2º intento del loop.
- Esperado:
  - El loop NO termina con error.
  - El evento que llega a la UI es `tool.finished` con `output` que incluye "rate limit" + reintento programado.
  - Si `retry` está desactivado, termina con `error.classifier.type === 'rate_limit'`.

#### 2.2 Timeout de provider
- Mock: el primer request a `chat/completions` cuelga >30s.
- Esperado:
  - AbortController dispara.
  - La UI recibe `chatStreamContract.chunk` con `type: 'error'`, mensaje claro.
  - La sesión queda en estado recuperable (no corrupta en DB).

#### 2.3 Error de hidratación
- Mock: la sesión a hidratar tiene un mensaje corrupto (JSON inválido en `MessageContentPart`).
- Esperado:
  - El runtime detecta el problema y descarta **solo ese mensaje**, logueando warning.
  - El resto de la sesión se hidrata bien.
  - El usuario recibe un aviso (no un crash).

**Criterio de aceptación:**
- 3 nuevos describe blocks en el archivo, total >13 tests en el contract test.
- Todos verdes.
- Actualizar [`docs/TESTING.md`](file:///home/munix/Desarrollo/GitRepo/Vibes/docs/TESTING.md) con la descripción de los 3 nuevos (regla §1.8 del AGENTS.md).

**No se hace en esta fase:**
- Tests E2E con Playwright (regla A4 del usuario: overkill para cimentación).
- Cobertura exhaustiva de todos los códigos de error del provider (solo los 3 más probables).

### Track 3 — Documentar la frontera runtime ↔ Vibes

**Objetivo:** cristalizar la promesa de "doble fuente de verdad" en un solo documento canónico, con diagrama y ejemplos de código.

**Nuevo archivo:** [`docs/architecture/runtime-frontier.md`](file:///home/munix/Desarrollo/GitRepo/Vibes/docs/architecture/runtime-frontier.md)

**Estructura propuesta:**

1. **Regla de oro** (la promesa): el runtime es provider-agnóstico, no conoce UI, no conoce Vibes, no conoce OpenCode.
2. **Diagrama de flujo** (mermaid):
   - Vibes → Runtime: qué le pide y cómo.
   - Runtime → Vibes: qué eventos emite y qué NO emite.
   - DBs: Vibes DB (canon de negocio) vs Runtime DB (datos crudos de sesión).
3. **Tabla "qué vive dónde"** con ejemplos concretos:
   - System prompt → Vibes (compose y decide).
   - Memory extraction → Vibes (decide qué memorizar y cuándo).
   - Compactación → Runtime (configurable desde Vibes, ejecuta el runtime).
   - Permission pills → Vibes (interfaz de aprobación, pero el gate es runtime).
   - Tool errors → Runtime decide clasificación, Vibes decide cómo mostrarlo.
4. **Anti-patrones explícitos**: lo que el runtime NO debe hacer nunca, con ejemplos de código de cada lado:
   - Runtime no lee `settings.json` de Vibes.
   - Runtime no escribe en la DB de Vibes.
   - Vibes no le pasa system prompts pre-compactos al runtime.
5. **Cómo añadir una feature cross-cutting** (procedimiento):
   - Si necesita UI → empieza en Vibes.
   - Si necesita ejecución → empieza en Runtime.
   - Si cruza → definir contrato en `RuntimeEvent` o en IPC, **no meter el uno en el otro**.
6. **Referencias cruzadas**: links a [`implementation_plan.md`](file:///home/munix/Desarrollo/GitRepo/Vibes/docs/plans/implementation_plan.md) §Frontera, [AGENTS.md §1.6](file:///home/munix/Desarrollo/GitRepo/Vibes/.agents/rules/AGENTS.md), [vibes-core AGENTS.md §1.6](file:///home/munix/Desarrollo/GitRepo/vibes-core/.agents/rules/AGENTS.md).

**Criterio de aceptación:**
- Documento existe, revisado por munix.
- El diagrama renderiza (mermaid válido).
- Al menos 5 anti-patrones con ejemplo de código real del repo (no inventados).
- Actualizar [`architecture.md`](file:///home/munix/Desarrollo/GitRepo/Vibes/docs/architecture.md) con un link a este nuevo doc.

---

## Orden de ejecución propuesto

```
Track 1 (B6) → Track 3 (docs) → Track 2 (tests)
        │              │                │
        │              │                └─ último porque puede
        │              │                   depender del código final de T1
        │              └─ segundo: docu-
        │                  mentar la fron-
        │                  tera ya limpia
        └─ primero: cie-
           rrar el swap
```

**Slices verticales (cumple §1.3 del AGENTS.md):**

1. **Slice 2.1** — T1 completo (eliminación de opencode_adapter + main.ts + app_handlers.ts + tabla SQL). Tests verdes.
2. **Slice 2.2** — T3 (documento runtime-frontier.md). Sin código, solo docs + mermaid + actualizar architecture.md.
3. **Slice 2.3** — T2 (3 nuevos contract tests + actualización de docs/TESTING.md).

---

## Lo que NO entra en esta fase

- Sub-agentes (Fase 2 original).
- Compactación de contexto (Fase 4.1/4.2).
- Tools nuevas (`patch`, `git_diff`).
- Retry/fallback en el loop (Fase 4.3).
- MCP Gateway nativo (Fase 3.5).
- Tests E2E con Playwright.
- Publicación de paquetes `@vibes/*`.
- Permission DSL.

---

## Riesgos generales

| Riesgo | Mitigación |
|---|---|
| Romper producción al borrar opencode_adapter | Hacer barrido de imports primero, NO borrar el archivo hasta que TS compile verde. Smoke test manual obligatorio antes de cerrar la slice. |
| DB huérfana (`opencode_session_id` en sessions) | Documentar la decisión explícitamente en el PR: ¿borrar columna, dejar dead, o migrar primero? Yo propongo **dejar dead con comentario** por ahora (migración aparte). |
| Contract tests frágiles que rompan con cambios legítimos | Regla §1.8: actualizar docs/TESTING.md en el mismo PR. |
| Documento runtime-frontier.md que nadie lee | Link desde AGENTS.md §1.6 (decisión en piedra) para que sea ley. |
| Walkthrough.md siga mintiendo sobre B6 | Actualizar walkthrough.md en el Slice 2.1 para reflejar la realidad. |

---

**Última actualización:** 2026-08-09 (borrador inicial).
**Mantenedor:** munix.
