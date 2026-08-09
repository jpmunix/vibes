# Walkthrough — Fase 1 MVP + Extirpación de OpenCode (Capas 0-2)

La sesión goal terminó la Fase 1 de extremo a extremo: **vibes-core (Track A)** como runtime standalone y **el runtime bridge en Vibes (Track B)** que sustituye el camino OpenCode detrás de un flag. Todo con tests, como manda AGENTS.md.

---

## Qué se construyó

### vibes-core — Track A (A1–A6)

| Slice | Resultado |
|---|---|
| A1 Provider Registry | `createProviderRegistry()` + `openAiCompatibleFactory()`, protocolo por defecto `openai-compatible` |
| A2 AgentDefinition + hidratación | tipo `AgentDefinition`, persistencia SQLite, filtrado de tools, `toolOverrides`, `maxIterations`, fork copia el agente. Fix de bug latente: v2.4 no persistía system_prompt/enabled_tools |
| A3 Permission flow | `PermissionGate` inyectable, eventos `permission.requested/resolved`, `requiresConsent` por tool, `createTimeoutGate` fail-closed (5 min, paridad mCode) |
| A4 Validación de args | validador hand-rolled (subset JSON Schema) en `@vibes/tools`; sin ajv |
| A5 `@vibes/bridge` | `attachBridge`/`dispatch` + `buildTimeline` neutrales; los tags `<vibes-*>` viven en Vibes (frontera P1 intacta) |
| A6 Builder API | `createRuntimeBuilder()` con defaults sensatos; CLI y server migrados |

### Vibes — W1 + Track B (B1–B6)

- **W1** — aliases de Vite + paths de TS apuntan al **fuente TypeScript** de vibes-core (no `file:` deps, porque `workspace:*` rompe npm). `better-sqlite3` + `@electron/rebuild` declarados en `package.json`.
- **B1** [runtime_host.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/runtime/runtime_host.ts) — singleton `getRuntime()` con sqliteStorage en `userData/runtime-sessions.db`, ModelProvider delegante (re-resuelve el modelo por request), gate de permisos que reenvía a la UI, protocolo openai-compatible.
- **B2** [runtime_bridge.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/runtime/runtime_bridge.ts) — `handleRuntimeStream()` con el **mismo shape de retorno de 7 campos** que el adaptador. Decisión de arquitectura: **una sesión fresca hidratada por turno** (no resume), encaja con DP-4 (Vibes es dueño del historial). Hidratación: scrub de tags `<vibes-*>`, descarta el prompt actual duplicado, límite 20 mensajes.
- **B3** [permission_state.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/runtime/permission_state.ts) — estado de permisos pendiente (fail-closed, timeout 5 min) + registro session→UI. El canal `opencode-permission:respond` hace fallback al runtime.
- **B4** [event_mapper.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/runtime/event_mapper.ts) — RuntimeEvent → tags `<vibes-*>`, paridad 1:1 con el renderizado del adaptador (`cleanResponseText` portado íntegro).
- **B5** — flag `runtimeBridgeEnabled` en `UserSettingsSchema`; switch ternario en [chat_stream_handlers.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/handlers/chat_stream_handlers.ts) (OpenCode intacto); cancelación cableada; `shutdownRuntime()` en will-quit.
- **B6** — **77 tests nuevos** (fixtures sintéticas, decisión C):
  - [event_mapper.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/runtime/event_mapper.test.ts) — 31 tests de paridad de tags/timeline/limpieza.
  - [model_resolver.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/runtime/model_resolver.test.ts) — 13 tests de precedencia de resolución (custom static > selectedModel, customProviders/ollama/lmstudio/openrouter, routing vía OpenRouter con prefijo gateway, fallback env).
  - [permission_state.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/runtime/permission_state.test.ts) — 10 tests (fail-closed, timeout, abort).
  - [runtime_host.gate.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/runtime/runtime_host.gate.test.ts) — 9 tests del gate de permisos: fast-path read-only, pills allow/deny, fail-closed sin ventana, round-trip ask→`opencode-permission:request`→respuesta del renderer.
  - [runtime_bridge.contract.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/runtime/runtime_bridge.contract.test.ts) — 10 tests contra un runtime in-process (storage en memoria + mockFetch) cubriendo los 5 escenarios del spec: shape de retorno/chunks IPC, escritura real vía tool, **permiso denegado (la tool no corre y el stream termina igual)**, cancelación, y **segundo turno sobre el mismo chatId (hidratación del intercambio anterior)**. Además: hidratación/dedup/scrub y explore read-only.
  - [prompt_attach.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/runtime/prompt_attach.test.ts) — 4 tests del compositor de system prompt.

---

## Bugs descubiertos (y arreglados) durante B6

> [!IMPORTANT]
> El contract test de cancelación cazó un bug real de producto: tras pulsar **Stop**, `fetchWithRetry` seguía reintentando con backoff (~7 s colgado). Ahora la señal del llamador corta el bucle al instante ([provider.ts](file:///home/munix/Desarrollo/GitRepo/vibes-core/packages/providers/src/openai-compatible/provider.ts)).

1. `fetchWithRetry` ignoraba la cancelación del llamador → fix fail-fast (vibes-core).
2. Divergencia interfaz/impl: `Runtime.createSession` no declaraba `workspaceRoot` que runtime-impl v2.6 ya soportaba → interfaz completada.
3. `attachToSystemPrompt` extraído del adaptador de 200 KB a [prompt_attach.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/runtime/prompt_attach.ts) (puro) — el adaptador la re-exporta, superficie pública intacta.
4. Test pre-existente roto `engine_fetch.spec.ts` (mock sin `encryptionType` ni `proModeModel`) → mock completado, test verde otra vez.
5. `tsconfig.app.json` → `lib: ES2022` (solo tipos, emission sigue ES2020) para que los fuentes de vibes-core pasen el typecheck en Vibes.

---

## Verificación

| Repo | Resultado |
|---|---|
| Vibes | **246 tests verdes** (169 previos + 77 nuevos). Typecheck = **84 errores = baseline exacta**, cero en archivos de B6 |
| vibes-core | **142 tests verdes** (incl. providers tras el fix de cancelación); typecheck limpio en los 11 paquetes |

---

## Pendiente de munix (comandos)

```bash
cd /home/munix/Desarrollo/GitRepo/Vibes
npm install               # instala better-sqlite3 (+ resto de deps)
npm run rebuild:sqlite    # recompila better-sqlite3 para Electron
```

Después de `npm install` + `npm run rebuild:sqlite`, **la app ya usa el runtime por defecto** (OpenCode fue extirpado en las capas 0-2, ver abajo). No hay flag que activar.

> [!NOTE]
> No ha hecho falta migrar la BD de mCode: el runtime usa su propio SQLite en `userData/runtime-sessions.db`. Los contract tests usan storage en memoria a propósito, así que son verdes incluso antes del `npm install`.

---

## Extirpación de OpenCode — Capas 0+1+2

munix pidió cortar OpenCode de raíz para tener certeza absoluta de que lo que respira es vibes-core. Se ejecutaron 3 capas:

### Capa 0 — Matar el arranque
- [main.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/main.ts): eliminados `ensureOpenCodeInstalled` (import + llamada), `shutdownOpenCode` (import + llamada en will-quit), migración de skills, y VACUUM de opencode.db.
- [app_handlers.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/handlers/app_handlers.ts): handler `restartOpenCodeServer` ahora es no-op (el runtime resuelve modelo/provider por request).

### Capa 1 — Runtime bridge como único camino
- [chat_stream_handlers.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/handlers/chat_stream_handlers.ts): eliminado el ternario `useRuntimeBridge`. Todo chat pasa por `handleRuntimeStream`. Eliminados imports de `handleOpenCodeStream`, `revertLastOpenCodeMessage`, `destroyOpenCodeSession`. Las llamadas a `revertLastOpenCodeMessage` en undo/redo son no-ops comentados (DP-4: sesiones frescas por turno, no hay nada que revertir).

> [!WARNING]
> **Undo/Redo y Jump-to-Version** están temporalmente no operativos. Ambos dependían de `chatSessionMap` de OpenCode. Hay que reimplementarlos sobre la DB de Vibes.

### Capa 2 — Handler de permisos fuera del adapter
- [NEW permission_handler.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/runtime/permission_handler.ts): handler del canal `opencode-permission:respond` sin la rama OpenCode.
- [ipc_host.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/ipc_host.ts): import cambiado al nuevo módulo.

### Estado de OpenCode ahora (post-Slice 2.1.7 — Fase 2 alternativa)
- ❌ No se instala (sin `ensureOpenCodeInstalled`)
- ❌ No arranca (sin `getOpenCodeClient`)
- ❌ No procesa streams (sin `handleOpenCodeStream`)
- ❌ No se apaga (sin `shutdownOpenCode`)
- ❌ El archivo `opencode_adapter.ts` **BORRADO** del repo (Slice 2.1.7, 201 KB / 5531 líneas). También `ensure_opencode.ts` y `opencode_diagnostic_handlers.ts`.
- ❌ Dependencia `@opencode-ai/sdk` quitada de `package.json`.
## Slice 3 — Permisos enterprise (post-MVP hardening)

> **Decisión en piedra**: Vibes es el dueño de la política de permisos. El runtime es policy-agnostic.

### Cambios en el runtime (vibes-core)

- **`requiresConsent` ELIMINADO** de la interfaz `Tool` ([executor.ts](file:///home/munix/Desarrollo/GitRepo/vibes-core/packages/runtime/src/executor.ts)) y del registry. Las 6 tools built-in (`read_file`, `write_file`, `edit_file`, `glob`, `grep`, `shell`) ya no exponen este campo.
- **Loop cambia**: `requestConsent()` ([loop.ts:407](file:///home/munix/Desarrollo/GitRepo/vibes-core/packages/runtime-impl/src/loop.ts#L407)) ya no bypass-ea read-only tools. **Toda tool call va al gate del host.**
- **Tests actualizados**: `built-in.test.ts` confirma que ninguna tool expone `requiresConsent`. `runtime.test.ts` invierte el test "read-only never prompts" → "read-only DOES prompt".

### Cambios en Vibes

- **Schema rename**: `openCodePermissions2` → `permissions` con shape limpio ([schemas.ts:389-462](file:///home/munix/Desarrollo/GitRepo/Vibes/src/lib/schemas.ts#L389-L462)). Keys: `permissions.tools.{toolId}`, `permissions.shellSubPills.{rm,gitReset,gitPush,...}`, `permissions.customRules[]`. **Sin migración** — los settings anteriores del usuario se ignoran.
- **Defaults Vibes** ([permission_defaults.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/runtime/permission_defaults.ts)): `read_file`/`glob`/`grep` → `allow`, mutación → `ask`, web → `ask`. Tabla exportada y congelada con test.
- **Cascada de prioridad** ([permission_resolver.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/runtime/permission_resolver.ts)): custom rule (prefix match) > sub-pill > pill global > default. Función pura con 16 tests.
- **Gate integrado** ([runtime_host.ts:151-209](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/runtime/runtime_host.ts#L151)): `createVibesPermissionGate()` delega en `permissionResolver()`. 14 tests cubriendo cada vía de la cascada.
- **Banner UI limpia** ([formatToolInput.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/lib/formatToolInput.ts)): shell-style → `$ ${command}`, file-style → path (+ content), pattern-style → pattern. 13 tests. La IP `toolInput` cambia de `z.string()` (JSON.stringify'd) a `z.unknown()`.
- **"Permitir siempre" persiste** ([permission_handler.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/runtime/permission_handler.ts) + [permission_state.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/runtime/permission_state.ts)): el handler escribe `permissions.tools[toolId] = "allow"` cuando el usuario responde "always". La próxima vez la pill matchea y el gate no pregunta.

### Reglas de prioridad (Vibes setup)

```
1. customRules[?].pattern (prefix match)   → gana siempre
2. shellSubPills.{rm,gitReset,gitPush*}     → gana a shell si está set
3. permissions.tools.{toolId}              → pill global
4. VIBES_PERMISSION_DEFAULTS[toolId]       → último recurso
5. Tool desconocida                        → "ask" (fail-closed)
```

### Tests Slice 3

- 16 nuevos `permission_resolver.test.ts` (cascada).
- 13 nuevos `formatToolInput.test.ts` (UI formatter).
- 14 modificados `runtime_host.gate.test.ts` (cascade integration).
- 4 modificados `permission_state.test.ts` (toolId tracking).
- 4 modificados `runtime.test.ts` (vibes-core: read-only prompts).
- 1 modificado `built-in.test.ts` (Slice 3.1 sanity).

### Verificación

| Suite | Resultado |
|---|---|
| `vibes-core` runtime-impl | 26/26 ✅ |
| `vibes-core` tools | 27/27 ✅ |
| `vibes-core` providers | 34/34 ✅ |
| `vibes-core` runtime (ssot) | 0 errores tsc ✅ |
| `Vibes` tsc --noEmit | 0 errores ✅ |
| `Vibes` vitest run | **292/292 verde** (15 archivos) |

**Slice 3 — CERRADA en verde. Permisos enterprise listos para test flight.**

---

## Slice 3.9 — Memory leak fix (chat overwrite purga sesiones huérfanas)

**Problema:** `activeSessionByChat: Map<chatId, sessionId>` sobrescribía sin verificar. Si un segundo turno en el mismo chat se lanzaba antes de que el primero terminara, la sesión previa quedaba huérfana en `runtime.sessions` para siempre.

**Fix** ([runtime_bridge.ts:198-218](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/runtime/runtime_bridge.ts#L198-L218)):

```ts
const previousSessionId = activeSessionByChat.get(req.chatId);
if (previousSessionId) {
  activeSessionByChat.delete(req.chatId);
  await runtime.cancel(previousSessionId);
  await runtime.deleteSession(previousSessionId);  // limpia storage
}
```

**Tests:** 3 nuevos en [runtime_bridge.contract.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/runtime/runtime_bridge.contract.test.ts) — purga real, falla defensiva (no propagar), no-op cuando no hay leftover.

---

## Slice 3.10 — Limpieza de UI state cuando se borra un chat

**Problema:** al borrar un chat, el runtime session se eliminaba pero los atoms del renderer (`pendingOCPermissions`, `pendingAskUsers`, `pendingAgentConsents`, `agentTodosByChatId`) mantenían entries huérfanas para ese chatId. Eso podía mostrar banners fantasma o iconos de pregunta en la sidebar tras borrar.

**Fix:**

- **Main:** [chat_handlers.ts:185-240](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/handlers/chat_handlers.ts#L185-L240) emite `chat:deleted { chatId }` vía `safeSend` a todas las ventanas tras borrar un chat.
- **Contrato:** [misc.ts:297-300](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/types/misc.ts#L297-L300) — nuevo evento `chatDeleted` registrado en el namespace `misc`.
- **Listeners:** [AppRoot.tsx](file:///home/munix/Desarrollo/GitRepo/Vibes/src/AppRoot.tsx) y [ChatWindowApp.tsx](file:///home/munix/Desarrollo/GitRepo/Vibes/src/components/chat_window/ChatWindowApp.tsx) escuchan `onChatDeleted` y filtran los 4 atoms por `chatId`.
- **Tests:** 9 nuevos en [misc.deleted.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/types/misc.deleted.test.ts) — 4 verifican el contrato IPC (`miscEvents.chatDeleted.channel`, payload Zod parsing, fail-closed en chatId inválido), 5 verifican la lógica de prune de los atoms (filter por chatId, identidad referencial del Map cuando no hay match).

### Verificación

| Suite | Resultado |
|---|---|
| `Vibes` tsc --noEmit | 0 errores ✅ |
| `Vibes` vitest run | **304/304 verde** (16 archivos, 3 nuevos Slice 3.9, 9 nuevos Slice 3.10) |

**Slices 3.9 + 3.10 + 3.11 — TODAS CERRADAS EN VERDE. Memory leak + UI ghost state eliminados.**

---

## Slice 3.11 — Shutdown hook para pending resolvers

**Problema:** `rejectAllPendingRuntimePermissions()` existía pero **nadie la llamaba** en producción. Si el usuario cerraba Vibes con pops pendientes, los timers de 5 minutos seguían vivos. Al expirar intentaban `runtime.deleteSession(...)` sobre un runtime ya destruido.

**Fix** ([main.ts:976-979](file:///home/munix/Desarrollo/GitRepo/Vibes/src/main.ts#L976-L979)):

```ts
void shutdownRuntime();
rejectAllPendingRuntimePermissions();  // ← nuevo
```

Una línea, dentro del handler existente `will-quit`. Cubre quit normal, `Cmd+Q`, `Alt+F4`, y signal handlers (SIGTERM/SIGINT) que terminan llamando `app.quit()`.

---

### Verificación final

| Suite | Resultado |
|---|---|
| `Vibes` tsc --noEmit | 0 errores ✅ |
| `Vibes` vitest run | **295/295 verde** (16 archivos) |
| `vibes-core` runtime-impl | 26/26 ✅ |
| `vibes-core` tools | 27/27 ✅ |
| `vibes-core` providers | 34/34 ✅ |

**Slices 3.9 + 3.10 + 3.11 — TODAS CERRADAS EN VERDE.**

---

## Slice 3.8 — Resiliencia ante fallo de BunnyDB en "Permitir siempre"

**Problema:** `writeSettings` era fire-and-forget. Si BunnyDB fallaba al persistir `permissions.tools.shell = "allow"`, el usuario pulsaba "Permitir siempre", creía que estaba guardado, y al reiniciar Vibes la pill no existía. Silencioso.

**Fix por capas:**

### Slice 3.8.1 — `writeSettings` retorna `Promise<{ok, error?}>`

[`preferences-cache.ts:186-220`](file:///home/munix/Desarrollo/GitRepo/Vibes/src/main/preferences-cache.ts#L186-L220): `setMany` ahora devuelve `Promise<{ok: boolean, error?: string}>`. El cache update sigue siendo síncrono (UX no cambia), pero el Promise captura el resultado del DB write.

[`settings.ts:164-221`](file:///home/munix/Desarrollo/GitRepo/Vibes/src/main/settings.ts#L164-L221): `writeSettings` retorna el outcome de `setMany`. Para writes runtime-only (`isRunning` y similares) retorna `{ok: true}` sin tocar la DB. Backward-compatible: callers que no hacen `await` siguen funcionando.

### Slice 3.8.2 — `permission_handler.ts` await + emite evento

[`permission_handler.ts:58-110`](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/runtime/permission_handler.ts#L58-L110): cuando `response === "always"`, ahora `await writeSettings(...)`. Si retorna `ok=false` o lanza, emite `permission:persist-failed` a todas las ventanas con `{requestId, toolId, pillKey, message}`.

[`misc.ts:305-313`](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/types/misc.ts#L305-L313): nuevo contrato `permissionPersistFailed` en `miscEvents`.

### Slice 3.8.3 — Renderer toast

[`AppRoot.tsx:224-230`](file:///home/munix/Desarrollo/GitRepo/Vibes/src/AppRoot.tsx#L224-L230) y [`ChatWindowApp.tsx:565-571`](file:///home/munix/Desarrollo/GitRepo/Vibes/src/components/chat_window/ChatWindowApp.tsx#L565-L571): listeners `onPermissionPersistFailed` que llaman `showError()` con el mensaje. **Mensaje específico:** "No se pudo guardar tu preferencia en el servidor. La regla se aplica en esta sesión, pero no se recordará al reiniciar." → el usuario sabe que la pill está activa ahora pero no persistirá.

### Slice 3.8.4 — Tests + docs

[`permission_persist.test.ts`](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/runtime/permission_persist.test.ts): 7 tests —
- 3 verifican el contrato IPC (channel + payload Zod parse + Zod fail-closed)
- 4 verifican `writeSettings` retorna el outcome correcto: ok=true en DB success, ok=false con error en DB failure, ok=true sin DB call sin userId, ok=true en runtime-only updates (isRunning).

### Verificación

| Suite | Resultado |
|---|---|
| `Vibes` tsc --noEmit | 0 errores ✅ |
| `Vibes` vitest run | **311/311 verde** (17 archivos, +7 Slice 3.8) |

**Slice 3.8 — CERRADA EN VERDE.** BunnyDB failure ahora es visible, no silencioso.

---

**Caveats resueltos del análisis (4 de 6):**
- ✅ **#1** Memory leak en `activeSessionByChat` → Slice 3.9
- ✅ **#2** UI ghost state al borrar chat → Slice 3.10
- ✅ **#3** Race en "Permitir siempre" con red flaky → Slice 3.8 (BunnyDB resilience)
- ✅ **#5** Pending resolvers zombis al shutdown → Slice 3.11
- ❌ **#4** Descartado (sí se limpia)
- ❌ **#6** Descartado (UUID por session)

---

### Verificación final
- **311 tests verdes**, typecheck **0 errores**.

- ✅ 4 archivos de handlers migrados a `deleteRuntimeSession` / `deleteRuntimeSessionBySessionId`.
- ✅ `getVersionInfo` ahora devuelve `runtime` en vez de `opencode`.
- ✅ Slices 3.8 + 3.9 + 3.10 + 3.11 — todas cerradas en verde con tests.
- ✅ BunnyDB persist failure ahora visible (Slice 3.8), no silencioso.

**Slice 2.1 — CERRADA en verde. El swap OpenCode → vibes-core está REALMENTE hecho.**

### Verificación
- 292 tests verde (post Slice 3), typecheck 0 errores.
