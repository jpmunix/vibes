# Inventario de Tests — Vibes / Vibes

> **Documento vivo.** Se actualiza cuando se añaden, modifican o eliminan tests.
> Última actualización: 2026-08-09.

---

## Frameworks

| Framework | Rol | Versión |
|---|---|---|
| **Vitest** | Unit + integration tests (`src/`) | `^3.1.1` |
| **@playwright/test** | E2E sobre Electron real (`e2e-tests/`) | `^1.52.0` |
| **happy-dom** | DOM emulation para Vitest | `^17.4.4` |

### Configuraciones

| Archivo | Detalle |
|---|---|
| [vitest.config.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/vitest.config.ts) | `include: ["src/**/*.{test,spec}.{ts,tsx}"]`, `environment: "happy-dom"`, `globals: true`. Aliases `@/*` → `src/*` y `@vibes/*` vía `vite.vibes-aliases.mts` con resolución en cascada (`VIBES_CORE_DIR` → `../core/packages` contenedor → `../vibes-core/packages` plano). |
| [playwright.config.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/playwright.config.ts) | `testDir: ./e2e-tests`, `workers: 1`, `retries: CI ? 2 : 0`, `timeout: CI ? 180s : 75s`. Fake LLM server en `:3500` vía `webServer`. Reporter `blob` (CI) / `html+line` (local). Snapshots texto/aria (no screenshots). |

### Scripts disponibles

```bash
npm test            # vitest run (unit + integration)
npm run test:watch  # vitest en watch mode
npm run test:ui     # vitest --ui
npm run e2e         # playwright test (requiere build previo)
npm run pre:e2e     # cross-env E2E_TEST_BUILD=true npm run package
npm run e2e:shard   # playwright test --shard
```

### CI

**No hay CI que ejecute tests.** Los workflows existentes ([.github/workflows/](file:///home/munix/Desarrollo/GitRepo/Vibes/.github/workflows/)) son solo de release (`release.yml`, `release-mac.yml`). Ni Vitest ni Playwright corren automáticamente.

---

## Tests Unitarios / Integration (Vitest) — 33 archivos

### Runtime swap (B6) — Frontera Vibes ↔ vibes-core

| Archivo | Líneas | Qué cubre |
|---|---|---|
| [vibes_aliases.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/runtime/vibes_aliases.test.ts) | ~110 | **Resolución en cascada de @vibes/*.** 6 tests unitarios: valida árbol completo de paquetes requeridos (`isValidVibesCorePackages`), precedencia de `VIBES_CORE_DIR` (soportando tanto raíz como subdirectorio `/packages`), resolución de hermano contenedor `../core/packages`, fallback a plano `../vibes-core/packages`, lanzamiento de error explícito si ningún candidato es válido y consistencia del catálogo de aliases exportado. |
| [runtime_bridge.contract.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/runtime/runtime_bridge.contract.test.ts) | 783 | ★ **Contract test golden del swap B6.** Mock fetch SSE + in-memory storage. Verifica return shape (7 fields: `cachedTokens`, `costUsd`, `fullResponse`, `inputTokens`, `outputTokens`, `reasoningTokens`, `success`). IPC `chat:response:chunk` con `chatId` correcto. Tags `<vibes-write>`, `<vibes-files-changed>`, `<vibes-token-usage>`, `<vibes-cancelled>`. Hidratación DP-4: history se inyecta una vez, sin duplicar prompt, scrubbing de tags previos. Permisos denegados (fail-closed). Cancelación: abort produce markers de cancel. Multi-turn: segunda request hidrata el primer exchange. **B6 hardening (Slice 2.3):** rate-limit 429 del provider → `success=false` sin crashear (timeout 30s por los 3 retries con backoff); provider timeout via AbortSignal → cancelled marker; hidratación con mensajes malformados (`null`, `undefined`, system role, content no-string, vacíos, tags sucios) → salta los garbage y completa el turno. **#179 (guard de prompt vacío):** 3 tests — `req.prompt` vacío o whitespace-only (post-strip de slash commands) → `success:false` con mensaje visible y SIN llamar a `createSession` (0 tokens); `undoRedo:true` con prompt vacío → flujo legítimo, el guard no dispara. **Slice 3.9:** leftover session purge on overwrite — 3 tests que verifican que un segundo turno en el mismo chat purga una sesión huérfana previa antes de crear la nueva. |
| [event_mapper.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/runtime/event_mapper.test.ts) | ~560 | Fuente única de tags (#168): mapeo toolId → `<vibes-*>` tag de TODAS las tools built-in (ninguna cae en el fallback MCP), escape de atributos, extracción de detail, formatters de output por tool (list_dir→listado iconos, glob/grep/git_log/git_diff/write_file/edit_file/shell/question/todowrite → texto legible; JSON crudo solo fallback). **Resiliencia a output string JSON**: si el runtime entrega `output` como string JSON (caso real `git status` → `'{"exitCode":0,...}'`), se parsea y se formatea. **Reformateo retroactivo** (`reformatToolResultContent`): contenido JSON crudo persistido en mensajes viejos se reformatea en render time (mismos formatters). `<vibes-files-changed>`, `<vibes-token-usage>`, `<vibes-cancelled>`, `cleanResponseText`. **BUGFIX #122:** `session.failed` → `getFailedError()`. **Card #172 (razonamiento nativo):** `llm.reasoning_start/delta/end` → una entrada `reasoning` en el timeline coalescida (start abre, delta concatena, end cierra); `buildLiveContent` emite `<vibes-think>` cerrado (badge al terminar) o un opening tag abierto mientras streammea (el parser lo marca inProgress → `LiveThinkingPanel` activo); escape XML de `& < >`; delta huérfano sin start (defensivo). **Card #180 (Slice 2, memoria de turno):** `buildTurnSummaryTag` — formatea `Read:/Listed:/Modified:` en `<vibes-context-summary>`, vacío sin datos, dedupe y caps (30 reads, 20 dirs); el mapper trackea `read_file` → `filesRead` y `list_dir`/`glob` → `dirsListed` solo cuando `ok=true` (reads fallidos no se trackean). **Card #63/#64 (context.compacted):** el evento nuevo de compactación entra por el `default:` del switch — no rompe el timeline, no emite tag (la carcasa decide si pintarlo) y no altera la acumulación de texto entre eventos normales. **Card #238 (tags think/vibes-think huérfanos):** 5 tests nuevos — `cleanResponseText` stripa cierre huérfano `</think>`, apertura huérfana `<think>`, cierre huérfano `</vibes-think>`, y múltiples tags sueltos; `closePendingReasoning` cierra reasoning abierto sin `reasoning_end` (buildLiveContent emite el tag completo en vez de dejar un tag abierto que se renderice como texto). |
| [model_resolver.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/runtime/model_resolver.test.ts) | 19 | Precedencia de providers: customProviders > ollama > lmstudio > openrouter nativo. Gateway prefix `provider/model`. Multi-key OpenRouter. Fallback env var. Custom agent static model. **Card #229:** fallback/compactación parsean el string persistido una sola vez mediante `parseModelReference`; endpoint/credenciales y nombre real permanecen separados. |
| [permission_state.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/runtime/permission_state.test.ts) | — | Fail-closed permission gate: respond, abort, timeout, unknown vocabulary → reject. Session UI context registry. **Slice 3.6:** toolId se trackea por requestId para que el handler pueda persistir "always". |
| [question_state.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/runtime/question_state.test.ts) | ~90 | **DP-3 Question bridge (#VIBES-139).** `waitForRuntimeQuestionResponse`: resolve con answers, reject on abort (antes/durante), rejectAll cancela múltiples pendientes, multi-select answers. Espejo del patrón permission_state. |
| [permission_resolver.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/runtime/permission_resolver.test.ts) | 24 | **Slice 3.3 — Cascada de prioridad.** 24 tests: defaults read_* → allow, mutación → ask, shell → ask. `question` y `todowrite` → allow (non-mutating, hotfix 2026-08-20). Pill global por tool (incluye override question→ask). Sub-pill (rm deny wins over default shell ask). Custom rule (prefix `ls` allow, `rm /etc/` deny). Tool desconocida → ask (fail-closed). Args null → defaults. |
| [AgentPermissionsSettings.test.tsx](file:///home/munix/Desarrollo/GitRepo/Vibes/src/components/settings/AgentPermissionsSettings.test.tsx) | 7 | **Settings de permisos — buildToolList.** Filas desde catálogo vibes-core + i18n. Locked tools (`question`, `todowrite`) filtradas — no se pintan en la UI. Defaults desde `VIBES_PERMISSION_DEFAULTS` (no riskLevel). Labels es/en. |
| [i18n/index.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/lib/i18n/index.test.ts) | 21 | **Sistema i18n (card #106).** Paridad de claves es/en (sin huérfanas), namespace por dominio, `t()` con interpolación, `tPlural` con Intl.PluralRules, formatDate/DateTime/Number con locale, dateLocale, toolLabel/toolDescription con catálogo. Fail-closed: clave desconocida → devuelve la propia clave. |
| [i18n/useI18n.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/lib/i18n/useI18n.test.ts) | 4 | **Hook useI18n** ligado a `chatLanguage` de settings: es/en, fallback a es si falta. |
| [i18n/settingsSearch.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/lib/i18n/settingsSearch.test.ts) | 6 | **Índice de búsqueda de ajustes i18n (card #158).** Ids únicos + sectionIds conocidos, índice es/en del mismo tamaño, label/description/section localizados por idioma, keywords bilingües (matching cross-language), fail-closed (labels/descriptions no vacíos). |
| [formatToolInput.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/lib/formatToolInput.test.ts) | 13 | **Slice 3.5 — UI formatter.** Shell-style tools (`shell`, `bash`, `sh`, `exec`) → `$ ${command}`. File-style → path (+ content si existe). Pattern-style → pattern. Fallback a JSON.stringify. Null/undefined/non-object → string defensivo. |
| [runtime_host.gate.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/runtime/runtime_host.gate.test.ts) | 14 | **`createVibesPermissionGate`:** Slice 3.4 = delega en `permissionResolver`. Defaults Vibes (read → allow, mutación → ask). Pill global `permissions.tools.{toolId}` con allow/deny. Sub-pill `rm: deny` gana a default shell ask. Custom rule `ls: allow` por prefijo. Pill `ask` → UI round-trip. Fail-closed sin session UI. |
| [runtime_host.delegating.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/runtime/runtime_host.delegating.test.ts) | 2 | **Card #123/#229 — observabilidad e identidad unificada.** `delegatingModelProvider.id` es dinámico (getter que resuelve el provider cacheado) y expone exactamente el nombre real del modelo (`id === defaultModel`), sin `vibes-delegating` ni prefijos sintéticos `vibes:*`; el header de `context.snapshot` muestra la misma identidad que viaja al provider. Verifica resolución vía custom provider y cambio de modelo entre turnos. |
| [runtime_host.todo.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/runtime/runtime_host.todo.test.ts) | 2 | **Bug 76 (G18 wiring) — TodoHandler en `getRuntime`.** Regression del fix que cablea `.todoHandler(new SqliteTodoHandler(storage))` + `.storage(storageProvider)` explícito: la runtime construida lleva un `todoHandler` no nulo y, sobre la MISMA instacia de storage, un round-trip real (crear sesión → `handler.update` → leer `record.todos` → `handler.get`) confirma que handler y runtime comparten almacén. Test del singleton idempotente. Electron/settings/model_resolver mockeados; SQLite en un tmpdir real por pid. |
| [runtime_host.looplimits.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/runtime/runtime_host.looplimits.test.ts) | 17 | **Card #165 — límites del loop configurables (hot-reload).** `applyAgentLoopLimits` muta el `LoopConfig` del runtime en caliente (el loop lo lee por referencia por iteración) y `getAgentLoopLimits` expone el estado. Cubre: sin settings/vacía → defaults de vibes-core (1000 / 4h), valores válidos (min→ms), solo un campo, 0/negativos → default (no permite desactivar), NaN/Infinity → default, tipo mal (string) → default sin crash, decimales → floor, y hot-reload (muta el MISMO objeto, la siguiente lectura refleja el cambio). Electron/settings/model_resolver mockeados; no abre SQLite (prueba la mutación, no el runtime). **Card #63/#64/#229 — compaction:** wiring del modelo de compactación y rondas conservadas — sin settings → se conserva el `maxRoundsKept` default del runtime (6) y `summarizerModel` undefined; `compactionMaxRoundsKept` válido → se aplica; decimales → floor; `compactionModel` resoluble → `summarizerModel` con el nombre real del modelo, sin `vibes:compaction:`; no resoluble → undefined (fail-safe). |
| [runtime_bridge.delete.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/runtime/runtime_bridge.delete.test.ts) | — | **B6 hardening (Slice 2.1.1).** `deleteRuntimeSession`: no-op cuando el chatId no tiene sesión activa, no lanza excepciones, deja el map de sesiones activas vacío tras la llamada. |
| [permission_persist.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/runtime/permission_persist.test.ts) | 7 | **Slice 3.8** — Resiliencia ante fallo de BunnyDB. Contrato IPC `permission:persist-failed` (channel + payload Zod). `writeSettings` retorna `Promise<{ok, error?}>` — 4 tests cubren ok=true (DB success), ok=false con error (DB failure), ok=true sin DB call cuando no hay userId, ok=true para runtime-only updates (isRunning). |
| [prompt_attach.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/runtime/prompt_attach.test.ts) | — | System prompt composer: contexto + custom prompt con separador `---`. |
| [attachments_media.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/runtime/attachments_media.test.ts) | 20 | **Card #196 — conversión attachments → media parts.** Helper puro: `attachmentToImagePart` (dataURL base64 → `ImageContentPart`; MIME no soportado y base64 inválido → `null`), `persistedImageToPart` (regresión del 400 de producción: `aiMessagesJson` guarda la URL CDN tras un upload correcto; URL → parte `url`, dataURL/base64 → parte `data`, basura → `null`), `resolvePersistedImage` (re-descarga la URL CDN y la re-inlinea como base64 — representación universal del wire; si el CDN falla → fallback a parte `url`) y `persistedImageToDataUrl` (resuelve cualquier fuente persistida a un dataURL completo para el undo/redo; `null` si no hay bytes). Es la frontera P1 de la carcasa→runtime para imágenes. |
| [prompt_handlers.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/handlers/prompt_handlers.test.ts) | 5 | Función pura `computePromptDefaultStatus`: `hasDefault`/`isModified` (prompt sin systemId, systemId sin default, content == default, content != default, varios en el mismo map). Soporta el botón "Restaurar defaults" de Settings → Prompts. |
| [chat_handlers.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/handlers/chat_handlers.test.ts) | 5 | **Sumarizar a chat nuevo solo con mensajes.** Función pura `mapChatRowToSummary`: `messageCount` (número, 0 cuando vacío, null/string normalizados), normalización `isPlan`/`isRead` a boolean, labels pasan tal cual. Soporta el contrato `getChats`/`getPinnedChats` con `messageCount` que permite ocultar el botón "Resumir" en chats vacíos. |
| [settings-registry.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/main/settings-registry.test.ts) | 4 | **Card #200 — registry de resets obligatorio (requerimiento bloqueante de munix).** Exhaustividad: todo setting con default (`DEFAULT_SETTINGS`) tiene su reset oficial registrado en `SETTINGS_REGISTRY`; no hay claves obsoletas (registradas pero sin default); toda entrada tiene un reset válido (`kv`/`fn`/`skip` con razón); los settings de runtime/sesión (`windowState`, `isRunning`, `hasRunBefore`, `lastKnownPerformance`) están marcados como `skip` (no se tocan en el reset). Complementa el bloqueo de compilación (anotación `Record<keyof typeof DEFAULT_SETTINGS, ...>`). |
| [prompt_utils.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/utils/prompt_utils.test.ts) | 19 | `getSystemPrompt`: override del usuario en DB > default del código (`DEFAULT_PROMPTS`). Sin userId / sin override / fila deshabilitada → default del código; override habilitado → contenido de la DB; systemId inexistente en ambos → `""`. Invariantes: `DEFAULT_PROMPTS` cubre los 8 systemIds que el runtime inyecta (`ctx_*` + `runtime_agent_base`) y ninguna entrada está vacía. **Contrato post-rollback card #92:** los defaults viven en el código; la tabla `prompts` solo guarda overrides. **Nivel 1 (card #117, análisis #108):** `runtime_agent_base` conserva las reglas CRITICAL de tool usage y Professional objectivity; tope de tamaño (~2 800 chars). **Card #182:** el núcleo YA NO contiene Concision, ejemplos `<example>` ni límite numérico — la longitud la inyecta la carcasa desde `verbosity.ts`. `DEFAULT_PROMPT_SCOPES`: `ctx_plan_mode → plan`, `ctx_build_walkthrough → agent`, resto sin scope de fábrica, y solo referencia systemIds existentes. **Card #195:** `vision` es ahora un prompt de sistema más (default en `DEFAULT_PROMPTS.vision` + override en DB): 4 tests nuevos — default sin override, override habilitado, override deshabilitado → `""`, y verificación de que el default conserva el texto histórico (se movió de `vision_constants.ts`, no se reescribió). |
| [prompts/index.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/prompts/index.test.ts) | 6 | **Card #195 — jerarquía a 2 niveles de System prompts.** `SYSTEM_PROMPT_GROUPS` (metadato de código, 5 grupos: `core`/`titles`/`git`/`memory`/`vision`): regla de oro de que CADA `systemId` de `DEFAULT_PROMPTS` aparece EXACTAMENTE una vez en algún grupo (ni huérfanos ni duplicados); orden estable de los 5 grupos; composición canónica de cada grupo; `SYSTEM_PROMPT_GROUP_BY_ID` resuelve cada systemId; cada systemId tiene label + descripción; `DEFAULT_PROMPT_SCOPES` solo referencia systemIds existentes. |
| [verbosity.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/prompts/verbosity.test.ts) | 11 | **Card #182 — verbosidad dinámica.** `normalizeVerbosityLevel` (undefined/null/inválido → `low`, conserva medium/high). `VERBOSITY_BLOCKS`: las 3 variantes (`low`/`medium`/`high`) de `general` y `walkthrough` existen y no están vacías; cada `general` lleva sus 3 `<example>` de calibración; los bloques de cierre van en inglés. `buildVerbosityInstructions`: normaliza a `low`, `includeWalkthrough:false` omite el cierre, `:true` lo añade; `low` conserva el contrato legacy `MUST be 1-3 sentences`, `medium`/`high` especifican rangos propios (3-5 / 5-15). Anti-regresión: `runtime_agent_base` no contiene Concision/ejemplos/límite numérico pero sí tool usage + objectivity. |
| [misc.deleted.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/types/misc.deleted.test.ts) | 9 | **Slice 3.10 — contract `chat:deleted`.** Channel name coincide con el `safeSend` de chat_handlers.ts; payload `{ chatId: number }` parseable por Zod; lógica de prune del renderer descarta permissions/asks/consents/todos pendientes del chatId borrado. |
| [model_selector_status.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/components/settings/model_selector_status.test.ts) | 3 | **Card #115 — deuda visual de selectores de modelo.** Documenta el estado de enchufe al runtime de los 6 selectores por tarea restantes (auditoría 2026-08-12): 4 activos con lectores reales (`strategistModel`, `executorModel`, `visionPreprocessorModel`, `memoriesRouterModelV2`) y 2 inactivos con nota explicativa (`standardModeModel`, `memoriesSynthesisModelV2`). **Card #113:** `agentModels` eliminado — el runtime (vibes-core) no maneja agentes, toda sesión usa el modelo principal del chat; deuda de reintroducir per-agent model en card #211. Los asserts saltarán cuando se enchufe algo nuevo. |
| [prompt_guard.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/components/settings/prompt_guard.test.ts) | 10 | **Card #117 — prompt base no desactivable.** Regla pura `canDisablePrompt`: el `runtime_agent_base` no se puede desactivar (switch bloqueado con candado en Settings → Prompts); los demás prompts de sistema y los custom sí. **Card #183 / #195 — campos del editor (generalizado).** `getPromptEditorLock(systemId)`: para CUALQUIER prompt de sistema (todo systemId presente en `DEFAULT_PROMPTS`) el editor solo deja editable el CONTENIDO → título y descripción en solo lectura, y se ocultan categoría, ámbito (scope) y "Generar con IA"; los prompts custom (sin systemId) conservan todos los campos editables. Antes de #195 solo `runtime_agent_base` quedaba restringido. `isSystemPrompt(systemId)`: detección de prompts de sistema por membership en `DEFAULT_PROMPTS`. **Card #182 — aviso de verbosidad.** `isAgentCorePrompt(systemId)`: solo `runtime_agent_base` es el núcleo (los demás system y custom no); soporta el banner pasivo del editor que remite al selector de Verbosidad. |


**Cuándo usarlos:** Si se toca la capa `src/ipc/runtime/` (el bridge entre Vibes y vibes-core). El contract test golden es **el guard del swap B6**: cualquier cambio en el output que cruza la frontera requiere actualizar este test.

---

### Pro — Turbo edits y search-replace

| Archivo | Líneas | Qué cubre |
|---|---|---|
| [search_replace_dsl.spec.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/pro/main/ipc/processors/search_replace_dsl.spec.ts) | — | ★ **Golden con fixtures.** Lee `search_replace_passes.txt` (19673 bytes) y `search_replace_fails.txt` (4646 bytes), ejecuta `applySearchReplace` con `it.each`. Cambiar fixtures requiere discusión. |
| [search_replace_processor.spec.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/pro/main/ipc/processors/search_replace_processor.spec.ts) | — | Cascading fuzzy matching Pass 1-4 (exact → trailing WS → leading/trailing WS → unicode normalization smart quotes/en-dash/NBSP), CRLF, indent preservation, empty SEARCH block, detailed failure logging con `toMatchInlineSnapshot`. |
| [search_replace_processor.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/pro/main/ipc/processors/search_replace_processor.test.ts) | — | ⚠️ Variante minimal con mismo target: smart quotes, whitespace normalization, ambiguous detection, exact match. **Solapa con el `.spec.ts`** — candidato a consolidar. |
| [visual_editing_utils.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/pro/main/utils/visual_editing_utils.test.ts) | — | `transformContent` y `analyzeComponent`: manipulación de className (Tailwind arbitrary values, font-weight vs font-family prefixes), cambios por línea. |

**Cuándo usarlos:** Si se toca el sistema de search-replace DSL o visual editing.

---

### UI — contrato de iconos y tree-shaking

| Archivo | Líneas | Qué cubre |
|---|---|---|
| [icons.test.tsx](file:///home/munix/Desarrollo/GitRepo/Vibes/src/components/ui/icons.test.tsx) | 28 | **Slice 1 (card #103) — guard de tree-shaking.** Ancla el refactor que bajó el chunk de arranque de 1,291 KB a 323 KB. Verifica a nivel de fuente que `icons.tsx` NO reintroduce `import * as` ni `export * from "lucide-react"` (que metían los ~1570 iconos en el bundle y destrozaban el tree-shaking), y que no reaparece iconoir-react (feature de doble tema eliminada). A nivel runtime comprueba que una muestra de iconos muy usados y los 10 brand SVGs siguen exportados como componentes renderizables. |

**Cuándo usarlos:** Si se toca `src/components/ui/icons.tsx` o el sistema de iconos. **Este test es la barrera contra la regresión de bundle** — si alguien vuelve a meter un namespace-import o un `export *` de lucide-react, el bundle engorda ~967 KB sin que ningún otro test de comportamiento lo detecte (los iconos "funcionan igual"). Cambiar la lista de `REQUIRED_ICONS`/`BRAND_ICONS` requiere discusión.

---

### Catálogo de modelos multi-proveedor (card #87)

| Archivo | Líneas | Qué cubre |
|---|---|---|
| [models_dev_service.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/utils/models_dev_service.test.ts) | 7 | **Slice A — `resolveCatalog`.** Política de fuentes memoria → disco fresco → fetch live → disco stale → snapshot embebido (arranque offline). Fetch inyectado vía el SDK. Mocks: electron (`getPath`→tmpdir), fs/promises (`importOriginal` + store en memoria), electron-log. Verifica persistencia a disco, stale-while-revalidate, y que el snapshot real del paquete (192 providers) es el floor. `clearModelsDevCache` borra memoria+disco. |
| [models_dev_transform.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/utils/models_dev_transform.test.ts) | 24 | **Slice B — transform/lookup.** `pricingFromCost` (USD/M → `$X.XX/M` + escala $), `toModelOption` (mapeo exacto Model→ModelOption, ID compuesto, meta provider-agnóstica, sin cost → sin precio), `isRelevantForCoding` (GA/tools/ctx≥32k, descarta deprecated), `findModel` (exacto/compuesto/global normalizado), `enrichModelOption` (precedencia: el provider gana), `getFallbackModel` (id pelado nativo), `isModelKnown`/`isModelDeprecated`, `getCatalogModels` (fetch inyectado). **Fixture:** `__fixtures__/models-dev-sample.json` (recorte real de 6 providers del snapshot). |
| [models_dev_enrich.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/utils/models_dev_enrich.test.ts) | 5 | **Slice C — `enrichModelOptions` (lote).** Enriquece un `/models` pobre de un proxy con el catálogo; precedencia (no sobreescribe); no rompe el lote si el catálogo no conoce el modelo ni si el fetch falla (offline no rompe); lote vacío sin resolver. |
| [models_dev_pricing.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/utils/models_dev_pricing.test.ts) | 10 | **Slice E — precios con tiers.** `resolveModelCost` (context-size tiers: openai/gpt-5.5 cobra más >272k; multi-tier → umbral más alto cruzado), `pricingFromCost` (formato por-token `0.0000050000`, card #209), y `toModelOption` aplicando el tier según el contexto del modelo. Nunca "gratis" falso. |
| [models_dev_pricing_lookup.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/utils/models_dev_pricing_lookup.test.ts) | 4 | **Card #209 — `getCatalogModelPricing`.** Precio puntual por-token de un modelo vía catálogo (badge `<vibes-token-usage>` cuando el runtime no reporta coste). Precios por-token para un modelo con coste; vacías si no existe o no tiene coste; remoto caído → snapshot embebido (floor offline, nunca lanza). Mocks: electron/fs/electron-log + fixture real. |
| [language_model_handlers.refresh.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/handlers/language_model_handlers.refresh.test.ts) | 2 | **Card #209 — handler de refresh del catálogo.** Registra el canal `refresh-provider-models` (contrato renombrado desde `refresh-openrouter-models`) y el handler ejecuta `refreshCatalog`. |
| [language_model_helpers.catalog.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/shared/language_model_helpers.catalog.test.ts) | 2 | **Card #209 — rama cloud de `getLanguageModels`.** Usa `getCatalogModels(providerId)` (catálogo models.dev) para providers cloud; sin modelos → `[]` sin fallback a `MODEL_OPTIONS` (extirpado). |
| [model_reference.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/utils/model_reference.test.ts) | 18 | **Card #229 — codec único de referencias multi-provider.** Parse/serialize de `vendor/model`, `openrouter::model`, `ollama::model`, `lmstudio::model`, `custom::id::model` y forma legacy `custom::model`; conserva `/` y `:` dentro del nombre, soporta provider custom anidado, round-trip compatible con settings y rechaza referencias vacías/incompletas. El resultado canónico es siempre `{ provider, model }`. |
| [model_completion.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/utils/model_completion.test.ts) | 6 | **Card #229 — completion auxiliar provider-agnóstica.** `ModelReference` llega a `getModelClient` como `{provider, name:model}` sin string compuesto y con tools propias del provider desactivadas para conservar completions planas; propaga `temperature`, `maxOutputTokens` y `abortSignal` con los nombres actuales del AI SDK; normaliza texto/usage; `Output.json()` conserva structured output para el router de memoria; streaming usa la misma frontera; errores HTTP/configuración se propagan sin fallback silencioso y sin invocar el SDK si el provider no se resuelve. |
| [lightweight_model_routing.contract.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/utils/lightweight_model_routing.contract.test.ts) | 17 | **Card #229 — contract anti-regresión de routing lightweight.** Audita los 7 módulos/8 invocaciones de título, resumen, nombres de app, GitHub, auto-commit, memoria, diseño y playground: prohíbe `openRouterCompletion`, `openRouterStreamCompletion` y `hasOpenRouterApiKey`; exige `modelCompletion`/`modelStreamCompletion`, structured output JSON de memoria y el contrato IPC de diseño con `provider` y `model` separados. Fija la extirpación de `openrouter.ts` y que `chat_stream_handlers`, `vision_preprocessor` y `useSelectedModelSupportsImages` no vuelvan al parser legacy `parseModelString`. Guard de wire: ni `selectedModel` (settings, ids pelados) ni las referencias persistidas `custom::`/`ollama::`/`lmstudio::`/`vibes:` producen un `defaultModel` con prefijo interno. |
| [model_validator.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/utils/model_validator.test.ts) | 23 | **Slice D — validator multi-proveedor (función pura `validateModelReferences`).** selectedModel: openrouter/nativo (name pelado)/custom; modelo muerto → fallback del MISMO provider (nativo) o universal de OpenRouter (cambia provider); deprecated → solo aviso. Referencias de string (executor/strategist/memories) pasan por el codec único `parseModelReference`/`serializeModelReference`: formato `custom::id::nombre`, `ollama::modelo`, `vendor/model`. Customs de la DB cuentan para cualquier provider. Guard: catálogo vacío → no valida nada. Invariancia: no muta el original. **Card #160 T7:** migración legacy `enabledOpenRouterModels` → `enabledModels` + prune conserva `::` (Bug 3). |
| [CustomProviderSection.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/components/settings/providers/CustomProviderSection.test.ts) | 5 | **Card #160 T5 — guard D5 (no borrar último provider).** `isLastConfiguredProvider(settings)`: cuenta OpenRouter (keys\|apiKey) + `customProviders.length` + `ollamaEnabled !== false`. Bloquea `handleDelete` y deshabilita botón si `activeCount <= 1`. Tests: 1 custom+Ollama (no último), 1 custom+ollama off (sí último), OR+custom (no último), null/undefined (defensivo → último), cero providers (último). |

**Cuándo usarlos:** Si se toca `models_dev_service.ts` (catálogo/caché/transform), `model_validator.ts` (validación en boot), el enriquecimiento en `openai_compatible_models_service.ts`, o la lógica de modelos de `language_model_helpers.ts` / el handler de refresh de `language_model_handlers.ts`. **Card #209 (deuda cerrada):** `openrouter_models_service.ts` fue **extirpado** (models.dev única fuente de verdad); no tenía tests históricos, y la cobertura de la migración está en los 3 tests nuevos de esta card. **Nota de contract golden:** la lógica del validator (la que realmente cambió) está cubierta de forma determinista por los 16 tests puros de la Slice D contra el fixture real; no se creó un golden de `getModels(openrouter)` porque ese servicio **no se modificó** y su `fetch` no es inyectable — forzarlo exigiría refactorizar OpenRouter (scope creep). Si se cambia el contrato del output de `getModels` o del broadcast `models:migrated`, añadir entonces un golden con fetch inyectado.

---

### Context gauge (card #207) — tokens de sesión y umbrales

| Archivo | Líneas | Qué cubre |
|---|---|---|
| [useSessionTokens.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/hooks/useSessionTokens.test.ts) | 22 | **Funciones puras del context gauge (patrón del repo: sin montar React).** `extractMessageTokenUsage` (parseo de tags `<vibes-token-usage>`: input/output/cached, suma multi-tag, tag-less → sin usage), `computeSessionTokens` (solo assistant, salta legacy sin tag, empty summary), `computeGauge` (pct usado/restante, niveles ok/warn/critical, aviso al 15% restante, compactar al 70% consumido, clamp 100%, inerte sin ventana o sin datos), `formatTokenCount` ("12.4k"/"1.2M"/números), helpers de donut (`DONUT_CIRCUMFERENCE`, `computeDonutDashOffset`: arco 100%→0, 0%→circunferencia, 50%→media, clamps). |
| [token_utils.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/utils/token_utils.test.ts) | 5 | **Card #223 — `getContextWindow`.** Resolución del contextWindow real: modelo resuelto con contextWindow → lo devuelve; modelo no resuelto → fallback directo al catálogo models.dev vía `findModel` (fixture real: deepseek-v4-flash → 1M); provider openrouter con `vendor/model` → fallback catálogo; modelo resuelto sin contextWindow → fallback catálogo; modelo desconocido → `null` (NUNCA 128k falso). Mocks: electron/fs/electron-log/settings/findLanguageModel + `resolveCatalog` con fixture. |
| [findLanguageModel.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/utils/findLanguageModel.test.ts) | 6 | **Card #223 — matching tolerante multi-proveedor.** Match exacto composite (openrouter gateway); nombre pelado → suffix match contra apiName compuesto (deepseek nativo); custom con `::` pelado; normalización case/puntuación (`DEEPSEEK_V4.FLASH` == `deepseek-v4-flash`, comparando la parte pelada del apiName); customModelId gana; inexistente → undefined sin lanzar. Mock: `getLanguageModels` con lista controlable. |

**Cuándo usarlos:** Si se toca `src/hooks/useSessionTokens.ts`, `src/components/chat/InputContextGauge.tsx` (o `ContextGauge.tsx`) o los umbrales del gauge (constantes `GAUGE_WARN_PCT_REMAINING` / `GAUGE_COMPACT_PCT_USED`). Si se toca la resolución del contextWindow del modelo activo (`token_utils.getContextWindow`, `findLanguageModel`, o la precedencia catálogo/models.dev), correr token_utils.test.ts y findLanguageModel.test.ts. Cambiar los umbrales o el parseo de tags requiere actualizar estos tests.

### Estadísticas del mensaje (card #221) — modal stats al click del nombre del modelo

| Archivo | Líneas | Qué cubre |
|---|---|---|
| [messageStats.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/components/chat/messageStats.test.ts) | 10 | **Helpers puros de `messageStats.ts`** (patrón del repo: sin montar React). `extractMessageTokenBreakdown` (parseo de tag `<vibes-token-usage>`: input/output/cached/web-searches/cost directo, fallback price-input/output, uso de `msg.totalTokens` sin tag, estimación chars/4 como último recurso, suma multi-tag), `computeMessageCost` (coste directo manda, cálculo por precios de catálogo, null sin datos), `computeSessionTokens` (suma entre assistant messages, ignora user), `computeSessionCost` (suma coste entre messages, null sin pricing), `buildMessageStats` (derivación de `startedAtMs = createdAt - durationMs`, null si falta durationMs). |

**Cuándo usarlos:** Si se toca `src/components/chat/messageStats.ts`, `src/components/chat/MessageStatsModal.tsx` o se cambia el trigger del nombre del modelo en `ChatMessage.tsx`. Cambiar el parseo del tag `<vibes-token-usage>` o el cálculo de coste requiere actualizar estos tests.

---

### Settings del workspace (card #234) — página /app-settings con AGENTS.md detectados

| Archivo | Líneas | Qué cubre |
|---|---|---|
| [agents_md_context.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/handlers/agents_md_context.test.ts) | 13 | **Existente, sigue siendo la base.** `findAgentsMdFiles(rootDir)` (depth 2, case-insensitive, ignora `node_modules`/`.git`/`dist`/`build`/etc., tolera dirs inexistentes) y `buildAgentsMdBlock` (concatena con header `## /relative/path`, salta vacíos/whitespace, vacío→""). Sin esto la página #234 no podría mostrar nada fiable. |
| [agents_md_files_handlers.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/handlers/agents_md_files_handlers.test.ts) | 6 | **Card #234 — handler `list-agents-md-files`.** Verifica el agrupamiento por carpeta (`folderId`/`folderLabel`/`folderPath`/`isPrimary` correctos), traducción de paths absolutos a relativos a la carpeta (un `AGENTS.md` raíz → `"AGENTS.md"`; anidado → `"packages/AGENTS.md"`), carpeta sin archivos → `files: []`, y exactamente un `isPrimary=true` cuando hay 3 carpetas. Schema contract: rechaza `{appId}` ausente, acepta numérico. Smoke: el módulo carga y exporta `registerAgentsMdFilesHandlers`. **Mock-heavy a propósito:** el handler real depende de `ipcMain` y Drizzle (mismo precedente que `app_folders_handlers.ts`, sin unit test por la misma razón); aquí se ejercita la lógica de agregación directamente. |

**Cuándo usarlos:** Si se toca `src/ipc/handlers/agents_md_context.ts` (cambia la lógica de escación que consume el system prompt) o `src/ipc/handlers/agents_md_files_handlers.ts` (cambia el agrupamiento por carpeta de la página de settings). Cambiar la profundidad de `findAgentsMdFiles` o las carpetas ignoradas requiere actualizar los dos tests; romper `buildAgentsMdBlock` (consumidor preexistente en `chat_stream_handlers`) rompe `agents_md_context.test.ts` antes de romper producción. Si la página /app-settings pasa a leer de un snapshot cacheado o de un builder reactivo, sustituir el segundo test por uno que ejercite el wrapper (mismo patrón que el resto del repo).

---

## Tests E2E (Playwright) — 103 specs + 244 snapshots

### Infraestructura

| Componente | Descripción |
|---|---|
| [test_helper.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/e2e-tests/helpers/test_helper.ts) | Helper principal (1659 líneas). Extiende `test()` con fixtures `electronApp`, `po` (page object), `testSkipIfWindows`. Normalizadores de IDs no deterministas (`[[TOOL_CALL_N]]`, `[[ITEM_REF_N]]`, `[[FILE_ID_N]]`) para snapshots estables. Timeouts `EXTRA_LONG/LONG/MEDIUM` según CI. |
| [codegen.js](file:///home/munix/Desarrollo/GitRepo/Vibes/e2e-tests/helpers/codegen.js) | Script para abrir Playwright Inspector contra la app empaquetada (debug manual). |
| `e2e-tests/fixtures/` | Markdown con prompts canónicos (`write-index.md`, `add-supabase.md`, `engine/*.md`, `security-review/*.md`, etc.) que los specs invocan con `tc=<nombre>`. |
| `e2e-tests/snapshots/` | **254 archivos golden** (`.aria.yml` accesibilidad tree + `.txt` output textual). Plataforma-agnósticos, solo diffs textuales. |
| [testing/fake-llm-server/](file:///home/munix/Desarrollo/GitRepo/Vibes/testing/fake-llm-server/) | Node/TS server en `:3500`. Handlers: `chatCompletionHandler.ts`, `githubHandler.ts`, `localAgentHandler.ts`, `responsesHandler.ts`. Es el `webServer` que Playwright arranca antes de los E2E. |
| [testing/fake-stdio-mcp-server.mjs](file:///home/munix/Desarrollo/GitRepo/Vibes/testing/fake-stdio-mcp-server.mjs) | MCP server stdio fake (`calculator_add`, `print_envs`) para E2E de MCP. |
| [testing/fake-http-mcp-server.mjs](file:///home/munix/Desarrollo/GitRepo/Vibes/testing/fake-http-mcp-server.mjs) | MCP server HTTP fake (puerto 3002) para E2E de MCP. |

### Familias principales de specs E2E

| Familia | Nº specs | Qué cubre |
|---|---|---|
| `local_agent_*` | 16 | **La más densa.** Modo local agent: tool calls multi-turn, permisos consent, mention apps/files, code search, grep, summarize, run type checks, MCP integration. |
| `engine`, `lm_studio`, `ollama`, `azure_*` | ~8 | Routing de mensajes a engines (OpenRouter/Anthropic/OpenAI/Claude/LM Studio/Ollama/Azure). |
| `context_*`, `smart_context_*`, `context_gauge` | ~7 | Context management, exclude paths, smart context deep/balanced, context window, **context gauge** (card #207: rueda donut de tokens + resumir a chat nuevo; renombrado desde `context_limit_banner`, banner jubilado). |
| `theme_selection`, `themes_management`, `toggle_screen_sizes` | ~3 | UI de temas y viewport. |
| `git_collaboration`, `github*` | ~5 | Git branches, GitHub repo create/sync/import/disconnect. |
| `mcp` | 1+ | MCP servers (HTTP transport, calculator tool, auth headers). |
| `supabase_*` | ~4 | Supabase branches, migrations, client generation, stale UI. |
| `problems`, `fix_error` | ~3 | Panel de errores TS, auto-fix con AI (2-attempt give-up), manual edit. |
| `select_component`, `visual_editing`, `attach_image`, `annotator` | ~4 | Selección visual de componentes, edición CSS in-place, attach de imágenes. |
| `security_review`, `free_agent_quota`, `telemetry`, `release_channel` | ~4 | Features Pro. |
| `uncommitted_files_banner` | ~1 | Banner de archivos sin commitear. |
| `version_integrity`, `select_component` | ~2 | Versionado de archivos, upgrade flows. |
| `backup`, `chat_search`, `app_search`, `file_tree_search` | ~4 | Búsqueda y backup. |
| `setup_flow`, `setup`, `main` | ~3 | Setup inicial. |
| `approve`, `reject`, `auto_approve` | ~3 | Flujo de aprobación de propuestas. |
| `partial_response`, `concurrent_chat`, `retry`, `restart` | ~4 | Lifecycle del chat. |
| `rebuild`, `refresh`, `switch_apps`, `switch_versions` | ~4 | Operaciones sobre apps. |
| `chat_input`, `chat_mode`, `default_chat_mode`, `new_chat` | ~4 | Input/mode de chat. |
| `prompt_library`, `add_prompt_deep_link` | ~2 | Librería de prompts. |
| CRUD apps/providers | ~10 | `rename_app`, `rename_edit`, `copy_app`, `copy_chat`, `delete_app`, `delete_provider`, `edit_code`, `edit_provider`, `edit_custom_models`, `app_storage_path`. |
| `mention_*` | ~3 | @-mentions de apps y files. |
| `dyad_tags_parsing` | 1 | Parser de `<dyad-write>` / `<dyad-*>` tags. |
| `env_var`, `nodejs_path_configuration` | ~2 | Config de entorno. |
| `capacitor`, `astro`, `hmr_path`, `thinking_budget` | ~4 | Frameworks/integraciones varias. |
| `undo`, `import*` | ~3 | Undo, imports. |
| `1.spec.ts` | 1 | Sanity: la app renderiza un `h1` con `vibes.start()`. |

---

## Contract tests / Golden tests — Resumen

| Tipo | Dónde | Qué es |
|---|---|---|
| ★ **Contract golden swap B6** | [runtime_bridge.contract.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/runtime/runtime_bridge.contract.test.ts) | El guard del swap a vibes-core. Verifica que `handleRuntimeStream` cumple el contrato que `chat_stream_handlers.ts` espera. Mock fetch SSE + fixtures sintéticos. **Card #196:** casos aditivos de turno solo-imagen (prompt vacío aceptado, `media` con base64 crudo), rehidratación desde `aiMessagesJson` en base64, y los goldens del 400 de producción (imagen persistida como URL CDN → se re-descarga y re-inlinea como base64 en el wire; si el CDN no responde → fallback a parte `url`, sin romper el turno); fixtures históricas intactas. |
| **Golden fixtures search-replace** | [search_replace_dsl.spec.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/pro/main/ipc/processors/search_replace_dsl.spec.ts) | `it.each` con fixtures `.txt`. Cambiar fixtures requiere discusión. |
| **Inline snapshots** | [search_replace_processor.spec.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/pro/main/ipc/processors/search_replace_processor.spec.ts) | `toMatchInlineSnapshot` para validar failure logging. |
| **E2E snapshots** | `e2e-tests/snapshots/` (254 archivos) | Accesibilidad tree (YAML) + output textual. Plataforma-agnósticos. |

> **Recordatorio AGENTS.md §1.1:** Los contract tests se graban UNA vez y son **gold-master**. Cambiar una fixture requiere discusión explícita.

---

### Integración Dock Todos ↔ vibes-core (G18)

| Archivo | Qué cubre |
|---|---|
| [event_mapper.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/runtime/event_mapper.ts) | Case `todo.updated` en el mapper: delega a callback `onTodoUpdated` inyectado por el bridge. El mapper permanece agnóstico del transporte IPC. |
| [runtime_bridge.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/runtime/runtime_bridge.ts) | Callback `onTodoUpdated` emite `agent-tool:todos-update` con `chatId`. Hidratación post-creación de sesión: lee `todos_json` via `runtime.deps.todoHandler.get()` y emite al renderer. |
| [TodoList.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/components/chat/TodoList.test.ts) | 5 | **Blindaje G18 (UI coherencia) — función pura `isTodoSpinning`.** Una tarea `in_progress` solo "gira" mientras `isStreaming` (chat en activo); con la conversación detenida el spinner se congela (no miente al usuario: el LLM no puede cambiar nada hasta la siguiente ronda). `completed`/`pending`/`cancelled` nunca giran. Prueba la lógica exportada sin montar el componente (patrón del repo). |
| [TodoList.tsx](file:///home/munix/Desarrollo/GitRepo/Vibes/src/components/chat/TodoList.tsx) | Render de status `cancelled` (icono X + tachado + atenuado). Indicador visual de `priority` (punto de color: rojo=high, amarillo=medium, azul=low). Key estable via `todo.id`. |
| [agent.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/types/agent.ts) | `AgentTodoSchema` alineado con `@vibes/shared Todo`: `id` obligatorio, `status` incluye `cancelled`, `priority` opcional. |

**Legacy retirada:** `update_todos.ts` renombrado a `.deprecated`, import y referencia eliminados de `tool_definitions.ts`. La vía legacy (`onUpdateTodos` → canal `agent-tool:todos-update`) ya no existe como emisor activo.

**Verificación manual requerida:** Abrir sesión con todos persistidos → dock muestra lista inmediatamente. Agente llama a `todowrite` → dock actualiza en tiempo real. Cerrar y reabrir sesión → dock persiste estado.

---

## Reglas de mantenimiento

> [!IMPORTANT]
> **Este documento es la fuente de verdad del inventario de tests.** Si añades, modificas o eliminas un test, **actualizas este documento en el mismo cambio.** No es opcional.

1. **Toda nueva feature lleva test** (AGENTS.md §1.1). Si añades código, añades test.
2. **Si modificas un test existente**, actualiza la descripción en este documento.
3. **Si eliminas un test**, elimina su entrada aquí y documenta por qué en el PR.
4. **Contract tests golden son gold-master**: cambiar fixtures requiere discusión explícita (AGENTS.md §1.1).
5. **E2E snapshots**: si un snapshot cambia, investiga por qué antes de aceptarlo. No hagas `--update-snapshots` a lo bruto.
6. **Si tocas output visible** que cruza la frontera Vibes ↔ runtime, actualiza el [contract test golden B6](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/runtime/runtime_bridge.contract.test.ts).
7. **Antes de declarar una tarea completada**: `npm test` debe pasar verde (ejecutar cuando munix lo autorice).
8. **Documentación cruzada**: este documento referencia los tests de vibes-core en [../vibes-core/docs/TESTING.md](file:///home/munix/Desarrollo/GitRepo/vibes-core/docs/TESTING.md).
