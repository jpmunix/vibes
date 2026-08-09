# Slice 2.1 — Cerrar B6 (eliminación real de opencode_adapter)

> **Documento vivo.** Se actualiza con cada sub-slice que ejecute munix.
> **Trigger:** Fase 2 alternativa aprobada.
> **Plan ejecutable** con las 3 decisiones validadas por munix (10:36).

## Decisiones validadas

| # | Decisión | Implicación |
|---|---|---|
| **1** | **A1:** Implementar `runtimeHost.deleteSession(chatId)` en runtime_bridge antes de migrar A1 | Hay que escribir código nuevo en runtime_bridge.ts (no destructivo, va antes del borrado) |
| **2** | **A2:** `handleVisualQuickEdit` y `registerQuestionHandler` se migran **luego**. Dejar **comentado** su código actual y **documentar** en post-mvp-roadmap.md | El código seguirá existiendo pero como stub comentado, con `// TODO(mvp-cleanup):` |
| **3** | **DB:** columna `opencode_session_id` queda como **dead column** con comentario | No tocar la columna ni la migración |

---

## Sub-slices (orden estricto, cada una verde antes de la siguiente)

```
2.1.1 [runtime:deleteSession] → 2.1.2 [A3 cleanup] → 2.1.3 [A2 stubs] → 2.1.4 [main.ts] → 2.1.5 [package.json] → 2.1.6 [borrar archivos] → 2.1.7 [walkthrough.md]
```

### 2.1.1 — Implementar `runtimeHost.deleteSession(chatId)`

**Por qué primero:** sin esto, los flujos de "borrar chat" y "reset DB" quedan **rotos en producción** si simplemente borramos A1 sin migrarlo.

**Archivos:**
- [`src/ipc/runtime/runtime_host.ts`](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/runtime/runtime_host.ts) — añadir `export async function deleteRuntimeSession(chatId: number): Promise<void>`.
- [`src/ipc/runtime/runtime_bridge.ts`](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/runtime/runtime_bridge.ts) — re-export.

**Lógica propuesta:**
```ts
export async function deleteRuntimeSession(chatId: number): Promise<void> {
  const sessionId = getActiveRuntimeSession(chatId);
  if (!sessionId) return; // No-op: no había sesión viva
  const runtime = getRuntime();
  // El Runtime interface debe exponer deleteSession; verificar runtime.ts
  await runtime.deleteSession(sessionId);
}
```

**Tests** (cumple §1.1 del AGENTS.md):
- `runtime_host.delete.test.ts` (nuevo):
  - deleteSession con sesión existente → la elimina del storage.
  - deleteSession con sesión inexistente → no-op silencioso.
  - deleteSession con chatId que NO está en el bridge → no-op.

**Verificación previa (lectura, no ejecución):**
- Leer `runtime.ts` (la interfaz Runtime en vibes-core) para confirmar que existe `deleteSession(sessionId)`. Si no, **preguntar a munix antes de añadirlo** (toca vibes-core, es cambio cross-repo).

**Criterio de aceptación:**
- Función exportada y testeada.
- 3+ tests verdes.

---

### 2.1.2 — Resolver A3 (cleanup fácil)

**Acciones:**
- [`src/ipc/handlers/settings_handlers.ts#L218-249`](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/handlers/settings_handlers.ts#L218) — borrar bloque try/catch que importa y llama `updateOpenCodeConfig`.
- [`src/ipc/handlers/settings_handlers.ts#L262-275`](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/handlers/settings_handlers.ts#L262) — borrar bloque try/catch que llama `shutdownOpenCode`. Si la lógica de "restart on provider change" sigue siendo válida, sustituir por comentario `// TODO: ¿hace falta restart del runtime al cambiar provider? Verificar.` (preguntar a munix antes de borrar a ciegas).
- [`src/ipc/handlers/mcp_handlers.ts#L11`](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/handlers/mcp_handlers.ts#L11) — borrar import + función `updateOpenCodeMcpConfig` en el archivo.
- [`src/ipc/handlers/mcp_handlers.ts#L443-448`](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/handlers/mcp_handlers.ts#L443) — borrar el bloque `await updateOpenCodeMcpConfig(...)`.
- [`src/ipc/handlers/opencode_diagnostic_handlers.ts`](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/handlers/opencode_diagnostic_handlers.ts) — **borrar archivo entero** (200 líneas).
- [`src/ipc/ipc_host.ts#L49`](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/ipc_host.ts#L49) — borrar import.
- [`src/ipc/ipc_host.ts#L114`](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/ipc_host.ts#L114) — borrar `registerOpenCodeDiagnosticHandlers()`.

**Tests:**
- Verificar que ningún test importa el archivo diagnostic_handlers.
- `pnpm tsc --noEmit` (cuando munix autorice) debe pasar.

**Criterio de aceptación:**
- 0 referencias a `openCodeHealthCheck`, `openCodeTestRun`, `updateOpenCodeConfig`, `updateOpenCodeMcpConfig`.
- TypeScript compila.

---

### 2.1.3 — Resolver A1 (destroy/delete/cleanup con runtimeHost.deleteSession)

**Acciones** (usando la función creada en 2.1.1):

- [`src/ipc/handlers/version_handlers.ts#L12`](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/handlers/version_handlers.ts#L12) — cambiar import:
  ```ts
  // ANTES:
  import { destroyOpenCodeSession } from "./opencode_adapter";
  // DESPUÉS:
  import { deleteRuntimeSession } from "../runtime/runtime_bridge";
  ```
- [`src/ipc/handlers/version_handlers.ts#L388, #L432`](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/handlers/version_handlers.ts#L388) — sustituir llamadas `destroyOpenCodeSession(chatId)` por `deleteRuntimeSession(chatId)`.

- [`src/ipc/handlers/chat_handlers.ts#L213-217`](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/handlers/chat_handlers.ts#L213) — sustituir `deleteOpenCodeSessionById(...)` por `deleteRuntimeSession(chatId)`.
- [`src/ipc/handlers/chat_handlers.ts#L573-578`](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/handlers/chat_handlers.ts#L573) — idem.

- [`src/ipc/handlers/app_handlers.ts#L1160-1170`](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/handlers/app_handlers.ts#L1160) — sustituir `cleanupOpenCodeSessionsForApp(appId)` por un loop que itere los chatIds del app y llame `deleteRuntimeSession(chatId)`. **Verificar primero** cómo se obtienen los chatIds de un appId (query a `chats` table).
- [`src/ipc/handlers/app_handlers.ts#L1643-1650`](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/handlers/app_handlers.ts#L1643) — sustituir `purgeAllOrphanedOpenCodeSessions(false)` por un loop que itere TODOS los chatIds activos y llame `deleteRuntimeSession(chatId)` para cada uno.

- [`src/ipc/handlers/window_handlers.ts#L1111-1115`](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/handlers/window_handlers.ts#L1111) — mismo patrón que app_handlers:1643.

**Tests:**
- Actualizar tests existentes que mockeen estas funciones.
- Si no hay tests específicos, añadir uno por cada handler: "borrar chat → deleteRuntimeSession llamado con el chatId correcto".

**Criterio de aceptación:**
- 0 referencias a `destroyOpenCodeSession`, `deleteOpenCodeSessionById`, `cleanupOpenCodeSessionsForApp`, `purgeAllOrphanedOpenCodeSessions`.
- TypeScript compila.
- Smoke test manual: borrar un chat desde la UI y verificar que el runtime no tiene sesión huérfana (cuando munix autorice `pnpm build`).

---

### 2.1.4 — Resolver A2 (dejar comentado + documentar)

**Acciones:**

- [`src/ipc/handlers/visual_editing_handlers.ts#L269-275`](file:///home/munix/Desarrollo/GitRepo/Vibes/src/pro/main/ipc/handlers/visual_editing_handlers.ts#L269) — sustituir el bloque por:
  ```ts
  // TODO(mvp-cleanup, fase 5+): visual edit todavía depende de opencode.
  // El runtime no soporta visual-edit subagent todavía. Dejamos el código
  // comentado para no perder la feature; replicar en runtime cuando proceda.
  // Ver: docs/plans/post-mvp-roadmap.md §"Deuda del swap B6"
  /*
  const { handleVisualQuickEdit } = await import("../../../../ipc/handlers/opencode_adapter");
  const result = await handleVisualQuickEdit({ appPath, componentFile: relativePath, ...
  */
  throw new Error("Visual edit no migrado al runtime todavía — ver TODO(mvp-cleanup)");
  ```
- [`src/ipc/ipc_host.ts#L54-57`](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/ipc_host.ts#L54) — sustituir el import y la llamada:
  ```ts
  // TODO(mvp-cleanup, fase 5+): question tool todavía vive en opencode_adapter.
  // El runtime no soporta ask_user todavía. Comentado hasta migración.
  /*
  import { registerQuestionHandler } from "./handlers/opencode_adapter";
  ...
  registerQuestionHandler();
  */
  ```

**Documentación:**
- Añadir entrada en [`post-mvp-roadmap.md`](file:///home/munix/Desarrollo/GitRepo/Vibes/docs/plans/post-mvp-roadmap.md) §"Deuda del swap B6" listando:
  - `handleVisualQuickEdit` (visual edit subagent)
  - `registerQuestionHandler` (ask_user tool, pendiente DP-3)
  - DP-3 (todos/question tool) se programa para Fase 2 original según [post-mvp-roadmap.md#L29](file:///home/munix/Desarrollo/GitRepo/Vibes/docs/plans/post-mvp-roadmap.md#L29) — esto encaja.

**Criterio de aceptación:**
- Código comentado, no borrado.
- Documento `post-mvp-roadmap.md` actualizado con la sección de deuda.

---

### 2.1.5 — Limpiar main.ts

**Acciones (lectura previa de main.ts:400-700 para localizar los bloques exactos):**

- Borrar `import { ensureOpenCodeInstalled } from "./main/ensure_opencode"` y la llamada `setImmediate(() => ensureOpenCodeInstalled())`.
- Borrar `import { getCachedOpenCodeVersion } from "./main/ensure_opencode"` y todas las referencias en main.ts (versión opencode en about dialog, etc.).
- Borrar bloque de migración de skills opencode (si existe).
- Borrar VACUUM de `opencode.db`.

**Tests:** ninguno nuevo, smoke test manual obligatorio.

**Criterio de aceptación:**
- 0 referencias a `ensureOpenCodeInstalled`, `getCachedOpenCodeVersion`, `ensure_opencode.ts` en main.ts.
- App arranca sin errores.

---

### 2.1.6 — Eliminar dependencias de opencode del package.json

**Acciones:**

- [`package.json`](file:///home/munix/Desarrollo/GitRepo/Vibes/package.json) — eliminar `@opencode-ai/sdk` y cualquier otra dependencia específica de opencode.
- `pnpm-lock.yaml` — regenerar (cuando munix autorice `pnpm install`).

**Verificación previa:**
- `grep -E '"@?opencode' package.json` debe devolver 0 antes de borrar.
- `pnpm tsc --noEmit` antes y después.

---

### 2.1.7 — Borrar los archivos finales

**Acciones:**

- Borrar [`src/ipc/handlers/opencode_adapter.ts`](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/handlers/opencode_adapter.ts) (201 KB, 5500 líneas).
- Borrar [`src/main/ensure_opencode.ts`](file:///home/munix/Desarrollo/GitRepo/Vibes/src/main/ensure_opencode.ts) si existe.

**Verificación crítica:**
- `grep -rln "opencode_adapter\|ensure_opencode\|ensureOpenCodeInstalled" src/ --include="*.ts"` debe devolver 0.
- `pnpm tsc --noEmit` (cuando munix autorice) debe pasar.
- Smoke test manual: arrancar app + mandar un chat.

**Solo entonces** se considera Slice 2.1 cerrada.

---

### 2.1.8 — Actualizar walkthrough.md

**Acciones:**
- [`docs/plans/walkthrough.md`](file:///home/munix/Desarrollo/GitRepo/Vibes/docs/plans/walkthrough.md) — añadir entrada "Slice 2.1 (B6 real)" describiendo lo que se hizo vs lo que decía el doc original.

---

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Borrar `opencode_adapter.ts` rompe un import dinámico que se me escapó | 2.1.7 empieza con `grep` exhaustivo. Si TS rompe, revertir y diagnosticar. |
| `runtime.deleteSession()` no existe en la interfaz Runtime de vibes-core | 2.1.1 hace verificación previa leyendo `runtime.ts`. Si falta, **preguntar a munix** antes de añadir a vibes-core. |
| Cascade en DB ya cubre la limpieza → implementar `deleteRuntimeSession` es doble trabajo | 2.1.1 propone la función pero **no la usa** en 2.1.3. Si cascade funciona, dejar la función como utility pero no conectarla. Documentar. |
| El smoke test manual descubre regresiones visuales | Esperar a que munix autorice `pnpm build` + arranque de la app. |

---

## Orden de revisión con munix

| Paso | Qué pido a munix |
|---|---|
| 2.1.1 | Autorizar lectura de [`vibes-core/packages/runtime/src/runtime.ts`](file:///home/munix/Desarrollo/GitRepo/vibes-core/packages/runtime/src/runtime.ts) para confirmar `deleteSession` existe. Si no, decidir si añadir a vibes-core (cross-repo, decisión en piedra). |
| 2.1.2 | OK para borrar bloques A3 (irreversible sin git revert). |
| 2.1.3 | OK para sustituir llamadas A1. |
| 2.1.4 | OK para comentar A2 + actualizar post-mvp-roadmap.md. |
| 2.1.5 | OK para limpiar main.ts. |
| 2.1.6 | OK para editar package.json. |
| 2.1.7 | **OK final para borrar archivos.** Esta es la más destructiva. |
| 2.1.8 | OK para actualizar walkthrough.md. |

---

**Última actualización:** 2026-08-09 (plan ejecutable con decisiones validadas).
**Mantenedor:** munix.
