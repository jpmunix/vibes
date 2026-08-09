# Plan: Extirpación de OpenCode — runtime único

munix quiere tirar OpenCode de raíz. No toggle, no flag, no camino latente. Certeza absoluta de que lo que respira es vibes-core.

## Contexto

El adaptador [opencode_adapter.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/handlers/opencode_adapter.ts) (5531 líneas) es el corazón de OpenCode en Vibes. Hay ~15 exports activos consumidos desde 12+ archivos. El runtime bridge (B1–B6) ya cubre el happy path de texto+herramientas con 77 tests verdes.

La estrategia es **cebolla**: cortar lo que hace que OpenCode "viva" (arranque, stream, permisos), probar, y luego ir pelando capas de código muerto hasta que no quede ni el import.

---

## Lo que se rompe (aceptado para empezar a probar)

> [!IMPORTANT]
- **Attachments/imágenes**: no soportados en el runtime (DP-2, post-MVP). Un prompt con imagen se ignora silenciosamente.
- **Integration env vars** (Bunny/PocketBase): no se inyectan en `process.env`. El bash tool del runtime no las ve.
- **MCP servers**: el sync hacia OpenCode se elimina. El runtime tiene su propio soporte MCP, pero no está cableado en el bridge todavía (Fase 3).
- **Visual Quick Edit**: el subagente que edita componentes desde la UI vive en el path OpenCode. Se elimina.
- **Memory bootstrap en cold-start**: no se invoca desde el runtime bridge. La inyección de memoria en el prompt sí funciona (la construye el caller).
- **Custom agent `replace` mode**: el runtime siempre usa su prompt interno + `contextInstructions` aditivas. El modo `replace` se ignora.
- **Retry/fallback automático**: post-MVP (G9, Fase 4).
- **`costUsd`**: siempre `null`. **Reasoning tokens**: siempre `0`. Post-MVP.

Todo lo demás (system prompt, hidratación de historial, tools read/write/bash/glob/grep, permisos con pills, cancelación, checkpoint 10s, tags `<vibes-*>`, title generation, memory extraction) **funciona igual o mejor** que en OpenCode.

---

## Capas propuestas (cada una testeable de forma independiente)

### Capa 0 — Matar el arranque de OpenCode (impacto cero en runtime)

**Objetivo:** OpenCode no se instala, no arranca, no se apaga. Pero el código sigue ahí (inerte).

| Archivo | Cambio |
|---|---|
| [main.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/main.ts) | Eliminar `import { ensureOpenCodeInstalled }` (L11) + bloque `setImmediate` que lo llama (L462-470). Eliminar `import { shutdownOpenCode }` (L39) + llamada en `will-quit` (L1041). Eliminar migración de skills (L177-202) y VACUUM de opencode.db (L341-351). |
| [app_handlers.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/handlers/app_handlers.ts) | Handler `system:restart-opencode-server` (L84-89) → body vacío o eliminado. |

**Verificación:** la app arranca sin tocar el binario opencode. `npm test` verde.

---

### Capa 1 — Hardcodear runtime bridge como único camino de stream

**Objetivo:** Todo chat pasa por `handleRuntimeStream`. `handleOpenCodeStream` no se invoca nunca.

| Archivo | Cambio |
|---|---|
| [chat_stream_handlers.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/handlers/chat_stream_handlers.ts) | Eliminar el ternario `useRuntimeBridge` (L2074-2119). Siempre `handleRuntimeStream`. Eliminar imports de `opencode_adapter` (L129: `handleOpenCodeStream`, `revertLastOpenCodeMessage`, `destroyOpenCodeSession`). |

> [!WARNING]
> Esto rompe `revertLastOpenCodeMessage` (undo/redo) y `destroyOpenCodeSession` (jump-to-version). Ambos dependen de `chatSessionMap` de OpenCode. En el runtime, cada turno es una sesión fresca (DP-4), así que "undo" = revertir el último mensaje en la DB de Vibes (no en la sesión del runtime). Hay que reimplementar undo/redo sobre la DB de Vibes, pero eso es otra slice. Para empezar a probar: undo/redo no disponible.

**Verificación:** la app responde a prompts de texto con el runtime. Contract tests verdes. Smoke test manual: encender app, mandar un prompt en modo `build`, recibir respuesta con tags `<vibes-*>`.

---

### Capa 2 — Migrar el handler de permisos fuera del adapter

**Objetivo:** El canal `opencode-permission:respond` se maneja desde el runtime, sin depender del adapter.

| Archivo | Cambio |
|---|---|
| [NEW] `src/ipc/runtime/permission_handler.ts` | `registerPermissionHandler` que sólo llama a `respondRuntimePermission` (sin la rama OpenCode). |
| [ipc_host.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/ipc_host.ts) | Cambiar import de `registerPermissionHandler` desde `opencode_adapter` → `./runtime/permission_handler`. |

El canal **no se renombra** (`opencode-permission:respond`). La UI lo espera así. Renombrar es scope creep.

**Verificación:** `permission_state.test.ts` + `runtime_host.gate.test.ts` verdes. Smoke test: tool que pide permiso → banner aparece → responder.

---

### Capa 3 — Eliminar funciones de ciclo de vida de sesión OpenCode

**Objetivo:** Borrar las 5 funciones que gestionan sesiones de OpenCode y sus callers.

| Función | Callers a limpiar |
|---|---|
| `revertLastOpenCodeMessage` | `chat_stream_handlers.ts` (undo/redo) |
| `destroyOpenCodeSession` | `version_handlers.ts` (jump-to-version) |
| `deleteOpenCodeSessionById` | `chat_handlers.ts` (delete chat) |
| `cleanupOpenCodeSessionsForApp` | `app_handlers.ts` (delete app) |
| `purgeAllOrphanedOpenCodeSessions` | `app_handlers.ts`, `window_handlers.ts` |

Los callers se sustituyen por no-ops o lógica equivalente sobre la DB de Vibes.

> [!IMPORTANT]
> `version_handlers.ts` (jump-to-version) necesita reescritura: sin `chatSessionMap`, "saltar a versión" significa restaurar mensajes en la DB de Vibes y dejar que la hidratación del runtime lo recoja en el siguiente turno. Esto es una mini-slice por sí mismo.

**Verificación:** `npm test` verde. App arranca, se pueden borrar chats y apps sin crash.

---

### Capa 4 — Eliminar config/permissions/MCP sync hacia OpenCode

| Función | Callers |
|---|---|
| `updateOpenCodeConfig` | `settings_handlers.ts:220` |
| `updateOpenCodePermissions` | `settings_handlers.ts:246` |
| `updateOpenCodeMcpConfig` | `mcp_handlers.ts:11` + `triggerOpenCodeMcpSync` |
| `handleVisualQuickEdit` | `visual_editing_handlers.ts:271` |
| `openCodeHealthCheck` / `openCodeTestRun` | `opencode_diagnostic_handlers.ts` (archivo entero) |

Los handlers de settings se vuelven no-ops (el delegating provider del runtime lee settings on-demand). MCP sync se elimina (Fase 3). Visual Quick Edit se depreca. Diagnósticos se eliminan.

**Verificación:** cambiar modelo en settings → no crash. CRUD de MCP servers → no crash.

---

### Capa 5 — Borrar el adapter y limpiar dependencias

**Objetivo:** Eliminar los 5531 líneas del adapter + deps de package.json + archivos auxiliares.

| Acción |
|---|
| Borrar `opencode_adapter.ts` entero |
| Borrar `src/main/ensure_opencode.ts` entero |
| Borrar `src/ipc/utils/morph_patcher.ts` + `scaffold-tools/*.ts` |
| Borrar `opencode_diagnostic_handlers.ts` entero |
| Borrar `registerQuestionHandler` (o migrar si el runtime soporta ask_user) |
| `package.json`: quitar `@opencode-ai/sdk`, `@ai-sdk/openai`, `@ai-sdk/provider-utils` |
| Limpiar `server/src/shims/opencode-sdk.cjs` + registro |
| Limpiar scopes silenciados en `main.ts` (`opencode_adapter`, `opencode_diagnostic`, `morph_patcher`) |

> [!CAUTION]
> Antes de borrar el adapter, confirmar que NINGÚN archivo importa nada de él. `git grep "opencode_adapter"` debe dar 0 resultados en `src/`.

**Verificación:** `npm test` verde. Typecheck no añade errores. La app compila sin `@opencode-ai/sdk`.

---

### Capa 6 — Limpieza de DB, UI y schemas

| Acción |
|---|
| Borrar columna `opencodeSessionId` de `remote-schema.ts` → munix ejecuta el ALTER TABLE |
| Borrar settings keys: `openCodePermissions*`, `lastOpenCodeUpdateCheck`, `enableMorphPatchTool`, etc. |
| Borrar UI: `AdminOpenCode.tsx`, tab OpenCode en admin |
| Borrar atom `pendingOpenCodePermissionsAtom` (si aplica) |
| Renombrar `chatMode: "opencode-build"` → `chatMode: "runtime-build"` |
| Limpiar strings "OpenCode" hardcoded en componentes UI |

**Query para munix (ejecutar cuando se confirme):**
```sql
ALTER TABLE chats DROP COLUMN opencode_session_id;
```

---

## User Review Required

> [!IMPORTANT]
> **Undo/Redo y Jump-to-Version** se rompen en Capa 1/3. El runtime usa sesiones frescas por turno (DP-4), así que "volver atrás" significa revertir en la DB de Vibes. ¿Aceptas que undo/redo y jump-to-version no funcionen temporalmente mientras lo reimplementamos sobre la DB de Vibes?

> [!IMPORTANT]
> **Visual Quick Edit** (subagente de edición visual desde la UI) se elimina. Es una feature que depende totalmente del path OpenCode. ¿La deprecamos o la quieres en el roadmap post-MVP?

> [!IMPORTANT]
> **MCP servers** pierden el sync automático. El runtime tiene soporte MCP propio pero no está cableado en el bridge todavía (Fase 3 del roadmap). ¿Aceptas que los MCP servers configurados no funcionen hasta Fase 3?

---

## Orden de ejecución recomendado

```
Capa 0 → Capa 1 → Capa 2   ← munix puede empezar a probar AQUÍ
Capa 3 → Capa 4             ← limpieza funcional
Capa 5 → Capa 6             ← limpieza estructural (borrado + deps)
```

Después de **Capa 0+1+2** (que son las más rápidas), OpenCode está muerto: no arranca, no procesa streams, no maneja permisos. munix puede empezar a probar el runtime con certeza absoluta. Las capas 3-6 son limpieza del cadáver y se hacen después, sin prisa.

## Verification Plan

### Automated Tests
- Después de cada capa: `npm test` en Vibes (246+ tests) + `pnpm -r test` en vibes-core (142 tests).
- Typecheck: `npx tsgo -p tsconfig.app.json --noEmit` — mantener baseline de 84 errores (o menos, ya que borrar código reduce errores).

### Manual Verification
- Después de Capa 0+1+2: smoke test real — encender app, mandar prompt en modo `build`, recibir respuesta, probar tool de escritura (permiso), cancelar mid-stream.
- Confirmar que el binario opencode no se instala ni ejecuta (verificar `process list` y `~/.local/share/opencode/` sin actividad).
