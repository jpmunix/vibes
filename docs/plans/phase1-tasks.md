# Fase 1 MVP — Tareas Reales

> **Fuente:** análisis línea por línea de `vibes-core` y `Vibes` (08 ago, 20:30).
> Nada de lo que sigue es especulación: cada scope referencia código que existe hoy.
> 📄 Documentos padre: [Roadmap](file:///home/munix/Desarrollo/GitRepo/Vibes/docs/plans/implementation_plan.md) · [Fase 1 MVP](file:///home/munix/Desarrollo/GitRepo/Vibes/docs/plans/phase1-mvp.md)

---

## 0. LO QUE YA EXISTE (no se toca salvo extensión)

### vibes-core — más avanzado de lo que el Roadmap sugiere

| Pieza | Estado real |
|---|---|
| `createRuntime(deps, options)` | ✅ [runtime.ts](file:///home/munix/Desarrollo/GitRepo/vibes-core/packages/runtime-impl/src/runtime.ts) — createSession/resume/fork/cancel/subscribe/shutdown |
| Loop con tool calls nativos | ✅ [loop.ts](file:///home/munix/Desarrollo/GitRepo/vibes-core/packages/runtime-impl/src/loop.ts) — streaming, dispatch, persistencia por iteración |
| 6 tools built-in | ✅ read/write/edit/glob/grep/shell + `createBuiltInRegistry()` |
| EventBus con replay | ✅ ring buffer 1000 eventos por sesión |
| SQLite storage | ✅ con event-log |
| Provider OpenAI-compatible | ✅ con SSE y token counting |
| SDK cliente (HTTP/WS) | ✅ [client.ts](file:///home/munix/Desarrollo/GitRepo/vibes-core/packages/sdk/src/client.ts) |
| `providerOverride` por sesión | ✅ ya existe en `createSession` (hardcodeado a openai-compatible) |

### Lo que FALTA en vibes-core (los gaps reales del MVP)

1. **Provider Registry** — hoy `providerOverride` construye el provider a mano ([runtime.ts:183-188](file:///home/munix/Desarrollo/GitRepo/vibes-core/packages/runtime-impl/src/runtime.ts#L183-L188)).
2. **AgentDefinition** — `createSession` recibe campos sueltos (`systemPrompt`, `enabledTools`), no un agente.
3. **Permission flow** — el loop ejecuta tools **sin pedir nada** ([loop.ts:471](file:///home/munix/Desarrollo/GitRepo/vibes-core/packages/runtime-impl/src/loop.ts#L471)). No hay `requiresConsent`, no hay `requestPermission`, no hay eventos de permiso.
4. **Validación de args** — `InMemoryToolRegistry.invoke` dice "in v1 we trust the LLM" ([registry.ts:28-29](file:///home/munix/Desarrollo/GitRepo/vibes-core/packages/tools/src/registry.ts#L28-L29)).
5. **Builder API** — no existe; solo `createRuntime(deps)` crudo.
6. **Paquete bridge** — no existe (`packages/bridge` no está en el workspace).

### Vibes — superficie de integración (el terreno del swap)

| Pieza | Dónde |
|---|---|
| **El punto único de swap** | `handleOpenCodeStream(event, req, abortController, options)` llamado en [chat_stream_handlers.ts:2079](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/handlers/chat_stream_handlers.ts#L2079) |
| Contrato de stream | `chatStreamContract`: invoke `chat:stream` → `chat:response:chunk/end/error`, clave `chatId` |
| Formato de chunks | `{ chatId, messages: MessageSchema[] }` — timeline completo con tags `<vibes-*>` |
| Permisos | evento `opencode-permission:request` + invoke `opencode-permission:respond` → resolver map **privada** en `opencode_adapter.ts` (`pendingPermissionResolvers`) |
| Mapa de agentes | `{ agent: "build", plan: "plan", ask: "explore", mockup: "mockup" }` ([chat_stream_handlers.ts:192-198](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/handlers/chat_stream_handlers.ts#L192-L198)) |
| System prompt | `attachToSystemPrompt(contextInstructions, customSystemPrompt)` — ya es una función pura reutilizable |
| Resolución de modelo | `resolveModelForAgent(agentId, settings, ...)` → `{ model, providerID, modelID }` |
| Cancelación | `chat:cancel` → `abortController.abort()` (mapa `activeStreams` por chatId) |
| Sesiones | `chatSessionMap: Map<chatId, sessionId>` + columna `chats.opencodeSessionId` |
| Defaults de permisos | `PERMISSION_DEFAULTS` (read/list/bash/lsp: allow; edit/webfetch: ask…) |

> [!IMPORTANT]
> **Vibes hoy NO depende de ningún paquete `@vibes/*`.** No hay `file:` ni workspace link.
> La tarea W1 resuelve esto y es bloqueante de todo el Track B.

---

## 1. GRAFO DE DEPENDENCIAS

```
TRACK A (vibes-core)                    TRACK B (Vibes)
─────────────────────                   ─────────────────────
A1 Provider Registry ──┐
A2 AgentDefinition ────┼──► A6 Builder ──► W1 Cableado ──► B1 RuntimeHost ──┐
A3 Permission flow ────┤                                                     ├──► B5 Flag + switch
A4 Validación args ────┘                B2 Session bridge ──────────────────┤
                                        B3 Permission bridge ───────────────┤
A5 Bridge pkg ─────────────────────────► B4 Event mapper (timeline) ────────┘
                                         B6 Tests de contrato
```

---

## 2. TRACK A — vibes-core (los cimientos)

### A1. Provider Registry

**Gap G1.** Hoy el runtime solo sabe hablar con openai-compatible y lo construye a mano.

**Scope:**
- [MODIFY] [provider-types.ts](file:///home/munix/Desarrollo/GitRepo/vibes-core/packages/runtime/src/provider-types.ts) — añadir:
  ```ts
  export type ProviderDescriptor = {
    protocol: string;          // 'openai-compatible' | ...
    baseUrl: string;
    apiKey?: string;
    defaultModel: string;
    extraHeaders?: Record<string, string>;
  };
  export type ProviderFactory = (d: ProviderDescriptor) => ModelProvider;
  export interface ProviderRegistry {
    register(protocol: string, factory: ProviderFactory): void;
    resolve(descriptor: ProviderDescriptor): ModelProvider;  // throw si protocolo desconocido
  }
  ```
- [NEW] `packages/runtime/src/provider-registry.ts` — implementación `createProviderRegistry()` (Map protocol → factory).
- [MODIFY] [runtime.ts (runtime-impl)](file:///home/munix/Desarrollo/GitRepo/vibes-core/packages/runtime-impl/src/runtime.ts) — `RuntimeDeps.providers` gana `registry: ProviderRegistry`; `makeHandle` resuelve `providerOverride` via `registry.resolve({ protocol: 'openai-compatible', ...descriptor })` en vez de importar `createOpenAICompatibleProvider` directamente (eliminar ese import del runtime-impl: el registro lo hace el host).
- [MODIFY] [providers/openai-compatible/index.ts](file:///home/munix/Desarrollo/GitRepo/vibes-core/packages/providers/src/openai-compatible/index.ts) — exportar una `ProviderFactory` lista para registrar.

**Aceptación:** test unitario: registry resuelve descriptor openai-compatible → provider funcional; protocolo desconocido → error tipado. El runtime-impl no importa ningún proveedor concreto.

---

### A2. AgentDefinition

**Gap G2.** `createSession` recibe `systemPrompt`/`enabledTools` sueltos. mCode necesita enviar un agente completo.

**Scope:**
- [MODIFY] [agent.ts](file:///home/munix/Desarrollo/GitRepo/vibes-core/packages/runtime/src/agent.ts) — el tipo (según D2 del Roadmap):
  ```ts
  export type AgentDefinition = {
    id: string;                        // 'build' | 'plan' | 'explore' | custom
    model?: string;                    // override del modelo del descriptor
    systemPrompt?: string;             // lo envía la carcasa
    tools?: string[];                  // subset activo (undefined = todos)
    toolOverrides?: Record<string, { description?: string }>;
    temperature?: number;
    maxIterations?: number;
  };
  ```
- [MODIFY] [runtime.ts (interfaces)](file:///home/munix/Desarrollo/GitRepo/vibes-core/packages/runtime/src/runtime.ts) — `createSession` input gana `agent?: AgentDefinition` y `messages?: Message[]` (hidratación de historial desde la carcasa — necesario porque Vibes inyecta los últimos 20 mensajes hoy con `noReply: true`). Mantener los campos actuales como deprecated-compatible.
- [MODIFY] [runtime.ts (runtime-impl)](file:///home/munix/Desarrollo/GitRepo/vibes-core/packages/runtime-impl/src/runtime.ts) — `createSession` persiste agent en `SessionRecord`; el loop ya respeta `systemPrompt`/`enabledTools` ([loop.ts:108-118](file:///home/munix/Desarrollo/GitRepo/vibes-core/packages/runtime-impl/src/loop.ts#L108-L118)) — extender para `maxIterations` del agente y `toolOverrides` en `describeTools`.
- [MODIFY] [storage-types.ts](file:///home/munix/Desarrollo/GitRepo/vibes-core/packages/runtime/src/storage-types.ts) — `SessionRecord` gana `agent?: AgentDefinition` (JSON serializado en SQLite; ⚠️ **query de migración** — ver §5).

**Aceptación:** crear sesión con `{ agent: { id: 'plan', tools: ['read_file','grep','glob'], systemPrompt } }` → el loop solo ofrece esas tools y usa ese prompt. Test de hidratación: sesión creada con `messages` previas las ve el LLM en el primer turno.

---

### A3. Permission flow

**Gap G4.** El gap más delicado: hoy las tools corren sin freno.

**Scope:**
- [MODIFY] [executor.ts](file:///home/munix/Desarrollo/GitRepo/vibes-core/packages/runtime/src/executor.ts):
  ```ts
  export interface Tool<TArgs = unknown, TResult = unknown> {
    // ... existente
    requiresConsent?: boolean | ((args: TArgs) => boolean);
  }
  export type ToolContext = {
    // ... existente
    requestPermission(toolId: string, args: unknown): Promise<'allow' | 'deny'>;
  };
  ```
- [MODIFY] [events.ts](file:///home/munix/Desarrollo/GitRepo/vibes-core/packages/shared/src/events.ts) — dos eventos nuevos:
  ```ts
  | { type: 'permission.requested'; sessionId: string; requestId: string; toolId: string; args: unknown; ts: number }
  | { type: 'permission.resolved'; sessionId: string; requestId: string; decision: 'allow' | 'deny' | 'timeout'; ts: number }
  ```
- [MODIFY] [runtime.ts (interfaces)](file:///home/munix/Desarrollo/GitRepo/vibes-core/packages/runtime/src/runtime.ts) — `PermissionGate` interface:
  ```ts
  export interface PermissionGate {
    request(input: { sessionId: string; requestId: string; toolId: string; args: unknown }): Promise<'allow' | 'deny'>;
  }
  ```
  en `RuntimeDeps` como `permissions?: PermissionGate` (ausente = deny-all para tools con consent, allow para el resto).
- [MODIFY] [loop.ts (runtime-impl)](file:///home/munix/Desarrollo/GitRepo/vibes-core/packages/runtime-impl/src/loop.ts) — en `dispatchNativeToolCalls` y `dispatchToolCalls`, antes de `tools.invoke`: evaluar `requiresConsent` (necesita acceso a la tool completa: `ToolRegistry` gana `get(toolId): Tool | undefined`), y si aplica → emitir `permission.requested`, await del gate, emitir `permission.resolved`. Deny → `tool_result { ok: false, error: 'permission_denied' }` (el LLM lo ve y decide, igual que OpenCode).
- [MODIFY] [registry.ts](file:///home/munix/Desarrollo/GitRepo/vibes-core/packages/tools/src/registry.ts) — método `get()`.
- Tools built-in: marcar `requiresConsent` — `write_file`/`edit_file`/`shell`: `true`; `read_file`/`glob`/`grep`: `false` (paridad con `PERMISSION_DEFAULTS` de Vibes).

**Aceptación:** test con gate stub: tool con consent → el loop emite `permission.requested`, se queda esperando, gate resuelve `deny` → tool no se ejecuta y el LLM recibe `permission_denied`. Gate ausente + tool con consent → deny automático. Timeout del gate (default 5 min, como Vibes) → `decision: 'timeout'` + deny.

---

### A4. Validación de args por JSON Schema

**Gap T6 del Roadmap ("nacemos fuertes").**

**Scope:**
- [MODIFY] [registry.ts](file:///home/munix/Desarrollo/GitRepo/vibes-core/packages/tools/src/registry.ts) — en `invoke`, validar `args` contra `tool.schema` antes de `execute`. Librería: **ajv** (añadir dependencia a `@vibes/tools`). Fallo → `{ ok: false, error: { name: 'InvalidArgs', message: <detalle ajv> } }`.
- Revisar los 6 schemas built-in: deben ser estrictos (`additionalProperties: false` donde aplique) para que la validación sea real.

**Aceptación:** test: args inválidos para `edit_file` → `InvalidArgs` sin ejecutar la tool.

---

### A5. Paquete `@vibes/bridge`

**Nuevo paquete en el workspace** ([pnpm-workspace.yaml](file:///home/munix/Desarrollo/GitRepo/vibes-core/pnpm-workspace.yaml) ya cubre `packages/*`).

**Filosofía:** el bridge traduce `RuntimeEvent` a un modelo de consumo neutral. **No conoce los tags `<vibes-*>`** — eso es flavor de Vibes y vive en Vibes (frontera P1 del Roadmap).

**Scope:**
- [NEW] `packages/bridge/src/index.ts` + `timeline.ts`:
  ```ts
  export type BridgeHandlers = {
    onTextDelta(delta: { text: string }): void;
    onToolStarted(t: { toolCallId: string; toolId: string; args: unknown }): void;
    onToolFinished(t: { toolCallId: string; toolId: string; result: ToolResult; durationMs: number }): void;
    onPermissionRequested(p: { requestId: string; toolId: string; args: unknown }): void;
    onFinished(f: { reason: FinishReason; usage: TokenUsage }): void;
    onError(e: SerializedError): void;
  };
  export function attachBridge(
    subscribe: (h: (e: RuntimeEvent) => void) => () => void,
    handlers: BridgeHandlers,
  ): () => void;
  ```
- Sin dependencias nuevas (solo tipos de `@vibes/shared`).

**Aceptación:** test con eventos sintéticos: secuencia `llm.delta` × N + `tool.started/finished` + `session.finished` dispara los handlers en orden.

---

### A6. Builder API

**Gap G6 / T5.** Ergonomía para el host (Electron main de Vibes, CLI, server).

**Scope:**
- [MODIFY] [runtime-factory.ts](file:///home/munix/Desarrollo/GitRepo/vibes-core/packages/runtime/src/runtime-factory.ts) ya existe como stub — reemplazar por el Builder real en runtime-impl:
  ```ts
  createRuntimeBuilder()
    .withProvider('openai-compatible', openAiCompatibleFactory)
    .withDefaultProvider(descriptor)
    .withTools(createBuiltInRegistry())
    .withStorage(sqliteStorage)
    .withLoopConfig(partial)
    .withPermissionGate(gate)
    .build()   // → Runtime
  ```
- `createRuntime(deps, options)` queda como API interna; el Builder valida que haya ≥1 provider, storage y loop config (defaults de `DEFAULT_RUNTIME_CONFIG`).
- [MODIFY] [cli/run.ts](file:///home/munix/Desarrollo/GitRepo/vibes-core/packages/cli/src/commands/run.ts) y [server](file:///home/munix/Desarrollo/GitRepo/vibes-core/packages/server/src/server.ts) → migrar al Builder (primeros consumidores reales, detectan errores de ergonomía).

**Aceptación:** CLI y server funcionando igual vía Builder. Test: builder sin provider → error claro en build().

---

## 3. TRACK B — Vibes (el swap)

### W1. Cableado de dependencias ⚠️ BLOQUEANTE

**Problema:** Vibes no depende de `@vibes/*` y los paquetes de vibes-core exportan **TypeScript fuente** (`"main": "./src/index.ts"`), no dist. Vibes compila con Vite/electron-vite.

**Scope:**
- [MODIFY] [Vibes/package.json](file:///home/munix/Desarrollo/GitRepo/Vibes/package.json) — añadir dependencias `file:` a los paquetes necesarios: `@vibes/runtime`, `@vibes/runtime-impl`, `@vibes/shared`, `@vibes/tools`, `@vibes/workspace`, `@vibes/providers`, `@vibes/bridge`.
- [MODIFY] config de Vite/electron-vite de Vibes — incluir `node_modules/@vibes/*` en el pipeline de transpilación (o `resolve.alias` a `../vibes-core/packages/*` durante el desarrollo).
**Aceptación:** `import { createRuntimeBuilder } from '@vibes/runtime-impl'` compila y corre en el main process de Vibes. La app arranca igual que antes (el flag aún no existe).

> [!IMPORTANT]
> **DP-1 confirmado:** dependencias `file:` + alias de dev. Publicar los paquetes queda para la Fase 5 (SDKs).
>
> **Storage:** `better-sqlite3` con `electron-rebuild` (opción D confirmada). El addon C++ se recompila contra el ABI de Electron en el build de Vibes. El `pnpm.onlyBuiltDependencies` del workspace raíz de vibes-core ya lo lista.

---

### B1. RuntimeHost en el main process

**El singleton que sustituye a `getOpenCodeClient()`.**

**Scope:**
- [NEW] `Vibes/src/ipc/runtime/runtime_host.ts`:
  - `getRuntime()` lazy: Builder con provider openai-compatible (baseUrl/apiKey desde settings de Vibes, via `resolveModelForAgent` + `mapProviderForOpenCode` simplificado), `createBuiltInRegistry()`, SQLite storage en `app.getPath('userData')/runtime-sessions.db` (con `electron-rebuild` para el addon nativo), `FsWorkspace` **por app** (root = `getVibesAppPath(appPath)`).
  - `PermissionGate` implementado como cola de promesas (ver B3).
  - `shutdownRuntime()` en el quit de la app.
  - Paridad de arranque con el adaptador: inyección de API keys desde secure storage (reutilizar `extractApiKeysForEnv` — hoy vive en `opencode_adapter.ts`, extraer a utils).

**Aceptación:** test manual: `getRuntime()` crea sesiones contra un workspace temporal y completa un turno con tool calls.

---

### B2. Session bridge — `handleRuntimeStream`

**El corazón del swap: mismo contrato que `handleOpenCodeStream`, motor distinto.**

**Scope:**
- [NEW] `Vibes/src/ipc/runtime/runtime_bridge.ts`:
  ```ts
  export async function handleRuntimeStream(
    event: IpcMainInvokeEvent,
    req: ChatStreamParams,
    abortController: AbortController,
    options: { placeholderMessageId, appPath, chatMessages, agentId,
               contextInstructions, customSystemPrompt, customPromptMode,
               customAgentModelSource, customAgentModel, ... },
  ): Promise<{ fullResponse, success, inputTokens, outputTokens,
               reasoningTokens, cachedTokens, costUsd }>
  ```
  misma forma de retorno que [opencode_adapter.ts:2823](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/handlers/opencode_adapter.ts#L2823) para que `chat_stream_handlers.ts` no note el cambio.
- Internamente:
  1. Resolver `AgentDefinition` (ver B4).
  2. Buscar sesión en `runtimeSessionMap`/`chats.opencodeSessionId` → `resumeSession`, si no `createSession({ agent, messages: historial convertido, workspaceRoot })`.
  3. `attachToSystemPrompt(contextInstructions, customSystemPrompt)` → `agent.systemPrompt` (**se reutiliza tal cual**, es pura).
  4. `session.run(abortController.signal)` + `attachBridge(session.subscribe, handlers)` (paquete A5).
  5. Los handlers actualizan el timeline y emiten `chat:response:chunk` con `{ chatId, messages }` (ver B4 para los tags).
  6. Al terminar: extraer `usage` → tags `<vibes-token-usage>`, archivo modificados → `updatedFiles`, enviar `chat:response:end`.
- Checkpoint de mensajes cada 10 s (paridad con el adaptador) reutilizando la lógica existente de `messages.content`.
- Cancelación: `abortController` ya aborta la señal del runtime ([SessionHandle.run](file:///home/munix/Desarrollo/GitRepo/vibes-core/packages/runtime-impl/src/runtime.ts#L168) la respeta); limpiar mapa y devolver respuesta parcial con `<vibes-cancelled>` igual que hoy.

**Aceptación:** un prompt sencillo ("crea un archivo hola.txt con 'hola'") produce el mismo flujo de chunks que OpenCode: burbuja con `<vibes-write>` + texto final + `updatedFiles: true`.

---

### B3. Permission bridge

**Conectar `permission.requested` del runtime con el banner existente de Vibes. Cero cambios en la UI.**

**Scope:**
- [NEW] `Vibes/src/ipc/runtime/permission_state.ts` — extraer el patrón `pendingPermissionResolvers` de [opencode_adapter.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/handlers/opencode_adapter.ts) a módulo compartido (Map `requestId → resolver` + `waitForPermissionResponse(reqId, timeoutMs)`).
- [MODIFY] `runtime_host.ts` — el `PermissionGate.request()`:
  1. Resolver la pill del tool via lógica equivalente a `resolveToolPermission` (read family → allow directo, igual que hoy).
  2. Si `ask` → `safeSend(event.sender, 'opencode-permission:request', { requestId, sessionId, chatId, toolName, toolInput })` (mismo payload que hoy — la UI no cambia), notification + tray badge si la ventana no tiene foco, await con timeout 5 min.
  3. Respuesta del usuario → resolver la promesa del gate.
- [MODIFY] `registerPermissionHandler` — si el `requestId` pertenece al runtime, resolver en `permission_state` (misma canal `opencode-permission:respond`).
- Persistencia de `always`/`reject` en settings: para el MVP, **solo pills globales** (las `bashCustomRules` granulares son OpenCode-específicas y quedan post-MVP).

**Aceptación:** shell tool con pill en `ask` → aparece el banner de siempre; aceptar → la tool corre; rechazar → el LLM recibe `permission_denied` y sigue conversando.

---

### B4. Event mapper — timeline y tags `<vibes-*>`

**El flavor: traducir eventos del runtime al idioma visual de Vibes.**

**Scope:**
- [NEW] `Vibes/src/ipc/runtime/event_mapper.ts`:
  - `mapToolToVibesTag`: `write_file → <vibes-write>`, `edit_file → <vibes-search-replace>`, `read_file → <vibes-read>`, `shell → <vibes-run-command>`, `glob → <vibes-list-files>`, `grep → <vibes-grep>` (misma tabla que `mapToolToVibesTag` del adaptador — portar, no reinventar).
  - Builder de timeline cronológico: deltas de texto + entradas de tool (buffer de 20 chars, close-before-tool/reopen-after — portar la lógica del adaptador).
  - Tags de cierre: `<vibes-files-changed files=… insertions=… deletions=…>` (desde `tool.finished` de write/edit + `gitDiff` del workspace), `<vibes-token-usage>`, `<vibes-cancelled>`.
- El contrato [chat.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/types/chat.ts) no cambia — ya vale.

**Aceptación:** la UI renderiza tool cards idénticas a las de OpenCode (comparación visual lado a lado).

---

### B5. Feature flag + switch en el call site

**Big bang con red de seguridad.**

**Scope:**
- [MODIFY] settings de Vibes — flag `runtimeBridgeEnabled` (default `false`; activable desde el panel admin/diagnóstico).
- [MODIFY] [chat_stream_handlers.ts:2071-2097](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/handlers/chat_stream_handlers.ts#L2071-L2097) — el único punto de switch:
  ```ts
  const result = settings.runtimeBridgeEnabled
    ? await handleRuntimeStream(event, req, abortController, { ... })
    : await handleOpenCodeStream(event, req, abortController, { ... });
  ```
- [MODIFY] `chat:cancel` handler — si el stream activo es runtime → `runtime.cancel(sessionId)` además del abort.
- [MODIFY] [ipc_host.ts:116-119](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/ipc_host.ts#L116-L119) — registrar el handler de permisos del runtime junto a los existentes.
- **No se elimina `opencode_adapter.ts`** — queda de fallback hasta que el flag sea default.

**Aceptación:** con el flag off, la app es byte-identical en comportamiento. Con el flag on, chat completo funciona.

---

### B6. Tests de contrato

**Scope:**
- [NEW] `Vibes/tests/runtime_bridge.contract.test.ts` — con runtime in-process (storage en memoria):
  1. Prompt simple → secuencia de eventos `chunk...end` con shape Zod válida (`ChatResponseChunkSchema`).
  2. Tool de escritura → chunk con `<vibes-write>`, end con `updatedFiles: true`.
  3. Permiso denegado → tool no corre, stream termina igual.
  4. Cancelación → `chat:cancel` mata el run, respuesta parcial válida.
  5. Resume: segunda petición sobre el mismo `chatId` continúa la conversación.
- [MODIFY] vibes-core: tests ya pedidos en A1-A4 (van con cada tarea).

**Aceptación:** `pnpm test` verde en ambos repos.

---

## 4. ORDEN DE EJECUCIÓN (6 semanas del MVP)

| Semana | Tareas | Hito |
|---|---|---|
| 1 | A1, A4 | Registry + validación. Tests verdes. |
| 2 | A2, A3 | Agentes + permisos en el runtime. |
| 3 | A5, A6 + W1 | Bridge pkg + Builder + Vibes compila contra `@vibes/*`. |
| 4 | B1, B4 | RuntimeHost + mapper de timeline. |
| 5 | B2, B3 | Stream completo + permisos banner. |
| 6 | B5, B6 + smoke manual | Flag, tests, y gente real probando con el flag on. |

---

## 5. QUERIES DE BASE DE DATOS

> [!IMPORTANT]
> Per las reglas de la casa: las queries las ejecuta munix.

### vibes-core — migración SQLite

La tabla `sessions` existe hoy en [migrations.ts](file:///home/munix/Desarrollo/GitRepo/vibes-core/packages/providers/src/sqlite/migrations.ts) pero le faltan 3 columnas: `agent_json` (AgentDefinition serializado), `system_prompt` y `enabled_tools_json` (que el loop ya lee pero la tabla no persiste).

**Para DBs existentes (ejecutar manualmente):**

```sql
ALTER TABLE sessions ADD COLUMN agent_json TEXT;
ALTER TABLE sessions ADD COLUMN system_prompt TEXT;
ALTER TABLE sessions ADD COLUMN enabled_tools_json TEXT;
```

**CREATE TABLE completo (lo que quedará en `migrations.ts` para instalaciones nuevas):**

```sql
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  workspace_root TEXT NOT NULL,
  workspace_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  status TEXT NOT NULL,
  prompt TEXT NOT NULL,
  messages_json TEXT NOT NULL DEFAULT '[]',
  open_files_json TEXT NOT NULL DEFAULT '[]',
  modified_files_json TEXT NOT NULL DEFAULT '[]',
  tool_calls_json TEXT NOT NULL DEFAULT '[]',
  plan_json TEXT,
  summary TEXT,
  token_usage_json TEXT NOT NULL DEFAULT '{"input":0,"output":0,"cacheRead":0,"cacheWrite":0}',
  errors_json TEXT NOT NULL DEFAULT '[]',
  finish_reason TEXT,
  parent_session_id TEXT,
  -- NUEVAS:
  agent_json TEXT,
  system_prompt TEXT,
  enabled_tools_json TEXT
);
```

En el código de `migrations.ts`, el guard idempotente para DBs existentes:

```ts
// SQLite no soporta ADD COLUMN IF NOT EXISTS
try { db.exec('ALTER TABLE sessions ADD COLUMN agent_json TEXT'); } catch {}
try { db.exec('ALTER TABLE sessions ADD COLUMN system_prompt TEXT'); } catch {}
try { db.exec('ALTER TABLE sessions ADD COLUMN enabled_tools_json TEXT'); } catch {}
```

> [!NOTE]
> La columna `agent_json` serializa el `AgentDefinition` completo como JSON. `system_prompt` y `enabled_tools_json` se persisten por separado porque el loop ya los lee como campos sueltos del `SessionRecord` — mantenerlos como columnas propias evita deserializar el JSON entero en cada patch.

### Vibes

Ninguna query nueva: se reutiliza `chats.opencodeSessionId` para guardar el sessionId del runtime (mismo tipo, UUID).

---

## 6. DECISIONES PENDIENTES

| # | Decisión | Opciones | Mi recomendación |
|---|---|---|---|
| **DP-1** | Cómo consume Vibes los paquetes `@vibes/*` | (a) `file:` deps, (b) aliases de Vite al source, (c) publicar en registry | **(a) + alias de dev**. Publicar = Fase 5. |
| **DP-2** | Attachments/imágenes en el MVP | (a) excluir (texto solo), (b) incluir partes multimodales en `MessageContentPart` | **Post-MVP confirmado.** Excluido del MVP. **La frontera:** el runtime acepta imagen si el modelo la soporta (caso optimista — añadir `{ type: 'image', data: ... }` a `MessageContentPart` y que el provider la serialice). Si el modelo no soporta visión, **mCode** implementa el visionador sintético (convierte imagen → texto antes de mandarla). El runtime **nunca** hace preprocessing de visión. Esto entra en Fase 3 con soporte multimodal en `MessageContentPart` + provider. |
| **DP-3** | `todo.updated` / `question` tool | OpenCode los emite y Vibes los pinta | **Post-MVP confirmado.** El banner de pregunta y los todos no aparecen con el flag on. Aceptable en pruebas internas. Fase 2. |
| **DP-4** | Historial a inyectar | Hoy Vibes manda los últimos 20 mensajes | **Mantener 20** como default, configurable en `AgentDefinition` más adelante. |

---

## 7. RIESGOS VIVOS

| Riesgo | Prob. | Mitigación |
|---|---|---|
| `better-sqlite3` nativo en Electron — addon C++ requiere recompilación | Media | **Aceptado (opción D confirmada).** `electron-rebuild` en el pipeline de build de Vibes recompila el addon contra el ABI de Electron. El workspace raíz de vibes-core ya lo lista en `pnpm.onlyBuiltDependencies`. El coste: CI necesita targets de Electron por plataforma (mac-arm64, mac-x64, linux, win). Es el mismo coste que cualquier addon nativo en Electron — conocido y documentado. |
| Paridad de timeline — mismo enfoque que OpenCode | Alta | B4 porta código del adaptador, no lo reescribe. **El problema concreto:** el adaptador construye un timeline cronológico con 3 reglas delicadas: (1) **buffer de 20 chars** — el texto no se manda hasta acumular 20 caracteres, para descartar fragmentos que preceden a un tool call (tipo `"```"` o `"Let me"`); (2) **close-before-tool** — si hay un bloque de texto abierto y llega `tool.started`, el texto se cierra antes de abrir la tool card, y se reabre cuando la tool termina; (3) **close-on-idle** — al fin de turno, cualquier bloque abierto se cierra. Un off-by-one en el buffer produce burbujas vacías o texto que aparece/desaparece. El código del adaptador ya está debugueado contra millones de chunks reales — portar, no reinventar. |
| Attachments fuera del MVP — **regresión funcional perceptible** | Media | **El problema concreto:** hoy la gente pega screenshots en el chat y funciona. OpenCode los procesa via `vision_preprocessor.ts` (describe la imagen en texto) o los manda como multimodal. Con el flag on, una imagen se ignora silenciosamente. **Frontera arquitectónica:** el runtime acepta imagen si el modelo la soporta (caso optimista); si no, **mCode** convierte la imagen a texto con su visionador sintético antes de mandarla al runtime. El runtime nunca hace preprocessing de visión. Soporte multimodal = Fase 3 (Post-MVP confirmado). Mitigación MVP: avisar en el toggle del flag. |
| El loop del runtime no tiene retry (OpenCode sí, con `error_classifier`) | Media | **Pendiente explícito.** Aceptado en MVP: error → `chat:response:end` con error visible. Retry/fallback con `error_classifier` = Fase 4 (G9). Iteramos en post-MVP. |
