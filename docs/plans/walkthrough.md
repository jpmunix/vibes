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

### Estado de OpenCode ahora
- ❌ No se instala (sin `ensureOpenCodeInstalled`)
- ❌ No arranca (sin `getOpenCodeClient`)
- ❌ No procesa streams (sin `handleOpenCodeStream`)
- ❌ No se apaga (sin `shutdownOpenCode`)
- ⚠️ El archivo `opencode_adapter.ts` (5531 líneas) sigue físicamente en el repo — pero **ningún camino de ejecución lo invoca para streaming**. `registerQuestionHandler` sigue importándose (degrada a no-op sin servidor). Las capas 3-6 (borrado físico, deps, UI, DB) pendientes.

### Verificación
- **246 tests verdes**, typecheck **84 = baseline exacta**, cero errores en archivos tocados.
