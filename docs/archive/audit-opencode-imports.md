# Slice 2.1 — Auditoría de imports de opencode_adapter

> Documento vivo de trabajo. Se actualiza a medida que se ejecute la slice.
> **Estado:** auditoría completa, pendiente de aprobar plan de migración.

## Resumen ejecutivo

| Métrica | Valor |
|---|---|
| Archivos que importan `opencode_adapter` | 16 |
| Imports que son solo comentarios/historia | 6 (categoría B) |
| Imports reales que hay que tocar | 10 |
| Gaps en runtime_bridge (funciones a migrar antes de borrar) | 3 grupos |

---

## Categoría A — Imports reales a resolver

### A1. Funciones que NO existen en runtime_bridge (GAP — migrar primero)

| Llamada | Archivo:Línea | Usado en |
|---|---|---|
| `destroyOpenCodeSession(chatId)` | [version_handlers.ts:12](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/handlers/version_handlers.ts#L12) | Restaurar versión, saltar a versión arbitraria |
| `deleteOpenCodeSessionById(id)` | [chat_handlers.ts:215](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/handlers/chat_handlers.ts#L215), [chat_handlers.ts:575](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/handlers/chat_handlers.ts#L575) | Borrar chat, purgar chats |
| `cleanupOpenCodeSessionsForApp(appId)` | [app_handlers.ts:1162](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/handlers/app_handlers.ts#L1162) | Borrar app |
| `purgeAllOrphanedOpenCodeSessions(dryRun)` | [app_handlers.ts:1645](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/handlers/app_handlers.ts#L1645), [window_handlers.ts:1113](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/handlers/window_handlers.ts#L1113) | Reset DB, dry-run de limpieza |

**Análisis:** El runtime bridge **NO expone destroy/delete/cleanup de sesión**. Esto significa que el flujo de "borrar chat = olvidar la sesión del runtime" **no existe** en el camino nuevo. Posibilidades:
- (a) La sesión del runtime se elimina al borrar el chat por cascade en la DB del runtime → verificar con `runtime_host.ts`.
- (b) Falta implementar `runtimeHost.deleteSession(chatId)` en el bridge.

**Acción previa a T1.borrar:** decidir (a) o (b). Si (b), implementar primero y añadir test.

### A2. Funciones con migración documentada pero no completada

| Llamada | Archivo:Línea | Estado |
|---|---|---|
| `handleVisualQuickEdit` | [visual_editing_handlers.ts:271](file:///home/munix/Desarrollo/GitRepo/Vibes/src/pro/main/ipc/handlers/visual_editing_handlers.ts#L271) | Comentario "Delegate to the OpenCode visual-edit subagent". Migración al runtime NO HECHA. |
| `registerQuestionHandler` | [ipc_host.ts:57](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/ipc_host.ts#L57) | Comentario explícito: "still lives in opencode_adapter.ts until the runtime supports ask_user". Migración NO HECHA. |

**Análisis:** Dos features que **no migraron** durante el swap. Visual edit y question tool siguen dependiendo de opencode. ¿Se eliminan en esta fase o se documentan como deuda explícita?

**Recomendación:** NO eliminarlas en Slice 2.1. Crear issue separado. El swap está vivo y funcional; romper visual_editing y question en pro-build sería peor que dejar el shim. Documentar como deuda en [`post-mvp-roadmap.md`](file:///home/munix/Desarrollo/GitRepo/Vibes/docs/archive/post-mvp-roadmap.md).

### A3. Funciones candidatas a "borrar sin más"

| Llamada | Archivo:Línea | Decisión |
|---|---|---|
| `updateOpenCodeConfig` | [settings_handlers.ts:220](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/handlers/settings_handlers.ts#L220) | Esta función REESCRIBÍA el archivo de config de opencode. El runtime resuelve modelo/provider por request (ver [walkthrough.md](file:///home/munix/Desarrollo/GitRepo/Vibes/docs/archive/walkthrough.md)). **Borrar bloque try/catch entero** si no hace falta. |
| `shutdownOpenCode` | [settings_handlers.ts:266](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/handlers/settings_handlers.ts#L266) | El walkthrough.md dice que `shutdownRuntime()` está en will-quit. Esta llamada es para reinicio al cambiar provider. **Migrar a `shutdownRuntime()`** o **borrar** si la lógica de "restart on provider change" ya no aplica. |
| `updateOpenCodeMcpConfig` | [mcp_handlers.ts:11](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/handlers/mcp_handlers.ts#L11) | Reescribe config MCP de opencode. Vibes ahora gestiona MCP por su cuenta (verificar). **Borrar si MCP está en runtime.** |
| `openCodeHealthCheck`, `openCodeTestRun` | [opencode_diagnostic_handlers.ts:22](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/handlers/opencode_diagnostic_handlers.ts#L22) | Diagnóstico de opencode. Sin opencode, **borrar archivo entero + `registerOpenCodeDiagnosticHandlers()` en ipc_host.ts:114**. |

---

## Categoría B — Comentarios y docs (no tocar)

- `event_mapper.ts:8` — "Ported from opencode_adapter.ts..."
- `permission_handler.ts:2` — "Capa 2: Permission handler extracted from opencode_adapter.ts."
- `permission_state.ts:4` — "Extracted pattern from opencode_adapter.ts's..."
- `prompt_attach.ts:5` — "Extracted from opencode_adapter.ts (B2/B6)..."
- `error_classifier.ts:8` — "Usado tanto en el backend (opencode_adapter, chat_stream_handlers)..."
- `main.ts:116` — `"opencode_adapter"` comentado en SILENCED_SCOPES.

Son historia. No requieren cambio.

---

## Categoría C — main.ts

`main.ts` ya NO importa `opencode_adapter`. Lo que SÍ tiene pendiente (del walkthrough.md):

- `setImmediate(() => ensureOpenCodeInstalled())` — bloque a borrar.
- `getCachedOpenCodeVersion()` y `ensure_opencode.ts` — imports a eliminar.
- Bloque de migración de skills opencode (referencias en el walkthrough) — buscar y borrar.
- VACUUM de `opencode.db` — buscar y borrar.

**Verificar leyendo `main.ts:400-500`** en busca de estos bloques antes de proponer el diff.

---

## Categoría D — Dependencias de package.json

Verificar si `@opencode-ai/sdk` sigue en [`package.json`](file:///home/munix/Desarrollo/GitRepo/Vibes/package.json) y en `pnpm-lock.yaml`. Si sí, eliminar.

---

## Categoría E — Tabla SQL / DB

La columna `sessions.opencode_session_id` (y similares) en [remote-schema.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/db/remote-schema.ts) y migraciones. Decisión previa:

> **Propuesta:** dejar como dead column con comentario en el código. Migración aparte en otra fase.

---

## Plan propuesto para Slice 2.1 (sub-slices)

| Sub-slice | Acción | Riesgo | Reversible |
|---|---|---|---|
| **2.1.1** | Resolver A3 (`updateOpenCodeConfig`, `shutdownOpenCode`, MCP, diagnostic) — borrar código y archivos | Bajo (funciones no se llaman en runtime path nuevo) | Sí (git revert) |
| **2.1.2** | Resolver A1 (destroy/delete/cleanup) — **decidir antes** entre (a) verificar cascade en DB o (b) implementar en runtime_bridge | Medio (toca runtime bridge) | Sí |
| **2.1.3** | Resolver A2 (`handleVisualQuickEdit`, `registerQuestionHandler`) — **NO migrar en esta fase**, documentar como deuda en post-mvp-roadmap.md | Bajo | Sí |
| **2.1.4** | Limpiar `main.ts` (ensureOpenCodeInstalled, getCachedOpenCodeVersion, skills migration, VACUUM) | Bajo | Sí |
| **2.1.5** | Eliminar `@opencode-ai/sdk` de package.json + lockfile | Bajo | Sí |
| **2.1.6** | Borrar [`opencode_adapter.ts`](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/handlers/opencode_adapter.ts) (201 KB) + [`opencode_diagnostic_handlers.ts`](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/handlers/opencode_diagnostic_handlers.ts) | Medio (último paso, debe ser tras 2.1.1-2.1.5 verde) | Sí |
| **2.1.7** | Actualizar [`walkthrough.md`](file:///home/munix/Desarrollo/GitRepo/Vibes/docs/archive/walkthrough.md) para que deje de mentir sobre B6 | — | — |

**Cada sub-slice termina con `pnpm build` + smoke test manual (cuando munix autorice).**

---

## Pendiente para tu decisión

1. **A1 — destroy/delete/cleanup de sesión**: ¿el cascade en DB del runtime los cubre, o hay que implementar `runtimeHost.deleteSession(chatId)` antes?
2. **A2 — visual_editing y question**: ¿se migran en otra fase o se eliminan? (Mi recomendación: dejar como deuda, abrir issue).
3. **DB huérfana**: ¿confirmas "dejar dead column con comentario"?

---

**Última actualización:** 2026-08-09 (auditoría completa).
