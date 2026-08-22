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
| [vitest.config.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/vitest.config.ts) | `include: ["src/**/*.{test,spec}.{ts,tsx}"]`, `environment: "happy-dom"`, `globals: true`. Aliases `@/*` → `src/*` y `@vibes/*` → `../vibes-core/packages/*/src/index.ts` (workspace hermano). |
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

## Tests Unitarios / Integration (Vitest) — 30 archivos

### Runtime swap (B6) — Frontera Vibes ↔ vibes-core

| Archivo | Líneas | Qué cubre |
|---|---|---|
| [runtime_bridge.contract.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/runtime/runtime_bridge.contract.test.ts) | 783 | ★ **Contract test golden del swap B6.** Mock fetch SSE + in-memory storage. Verifica return shape (7 fields: `cachedTokens`, `costUsd`, `fullResponse`, `inputTokens`, `outputTokens`, `reasoningTokens`, `success`). IPC `chat:response:chunk` con `chatId` correcto. Tags `<vibes-write>`, `<vibes-files-changed>`, `<vibes-token-usage>`, `<vibes-cancelled>`. Hidratación DP-4: history se inyecta una vez, sin duplicar prompt, scrubbing de tags previos. Permisos denegados (fail-closed). Cancelación: abort produce markers de cancel. Multi-turn: segunda request hidrata el primer exchange. **B6 hardening (Slice 2.3):** rate-limit 429 del provider → `success=false` sin crashear (timeout 30s por los 3 retries con backoff); provider timeout via AbortSignal → cancelled marker; hidratación con mensajes malformados (`null`, `undefined`, system role, content no-string, vacíos, tags sucios) → salta los garbage y completa el turno. **Slice 3.9:** leftover session purge on overwrite — 3 tests que verifican que un segundo turno en el mismo chat purga una sesión huérfana previa antes de crear la nueva. |
| [event_mapper.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/runtime/event_mapper.test.ts) | 223 | Fuente única de tags (#168): mapeo toolId → `<vibes-*>` tag de TODAS las tools built-in (ninguna cae en el fallback MCP), escape de atributos, extracción de detail, formatters de output por tool (list_dir→listado iconos, glob/grep/git_log/git_diff/write_file/edit_file/shell/question/todowrite → texto legible; JSON crudo solo fallback). **Resiliencia a output string JSON**: si el runtime entrega `output` como string JSON (caso real `git status` → `'{"exitCode":0,...}'`), se parsea y se formatea. **Reformateo retroactivo** (`reformatToolResultContent`): contenido JSON crudo persistido en mensajes viejos se reformatea en render time (mismos formatters). `<vibes-files-changed>`, `<vibes-token-usage>`, `<vibes-cancelled>`, `cleanResponseText`. **BUGFIX #122:** `session.failed` → `getFailedError()`. |
| [model_resolver.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/runtime/model_resolver.test.ts) | — | Precedencia de providers: customProviders > ollama > lmstudio > openrouter nativo. Gateway prefix `provider/model`. Multi-key OpenRouter. Fallback env var. Custom agent static model. |
| [permission_state.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/runtime/permission_state.test.ts) | — | Fail-closed permission gate: respond, abort, timeout, unknown vocabulary → reject. Session UI context registry. **Slice 3.6:** toolId se trackea por requestId para que el handler pueda persistir "always". |
| [question_state.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/runtime/question_state.test.ts) | ~90 | **DP-3 Question bridge (#VIBES-139).** `waitForRuntimeQuestionResponse`: resolve con answers, reject on abort (antes/durante), rejectAll cancela múltiples pendientes, multi-select answers. Espejo del patrón permission_state. |
| [permission_resolver.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/runtime/permission_resolver.test.ts) | 24 | **Slice 3.3 — Cascada de prioridad.** 24 tests: defaults read_* → allow, mutación → ask, shell → ask. `question` y `todowrite` → allow (non-mutating, hotfix 2026-08-20). Pill global por tool (incluye override question→ask). Sub-pill (rm deny wins over default shell ask). Custom rule (prefix `ls` allow, `rm /etc/` deny). Tool desconocida → ask (fail-closed). Args null → defaults. |
| [AgentPermissionsSettings.test.tsx](file:///home/munix/Desarrollo/GitRepo/Vibes/src/components/settings/AgentPermissionsSettings.test.tsx) | 7 | **Settings de permisos — buildToolList.** Filas desde catálogo vibes-core + i18n. Locked tools (`question`, `todowrite`) filtradas — no se pintan en la UI. Defaults desde `VIBES_PERMISSION_DEFAULTS` (no riskLevel). Labels es/en. |
| [formatToolInput.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/lib/formatToolInput.test.ts) | 13 | **Slice 3.5 — UI formatter.** Shell-style tools (`shell`, `bash`, `sh`, `exec`) → `$ ${command}`. File-style → path (+ content si existe). Pattern-style → pattern. Fallback a JSON.stringify. Null/undefined/non-object → string defensivo. |
| [runtime_host.gate.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/runtime/runtime_host.gate.test.ts) | 14 | **`createVibesPermissionGate`:** Slice 3.4 = delega en `permissionResolver`. Defaults Vibes (read → allow, mutación → ask). Pill global `permissions.tools.{toolId}` con allow/deny. Sub-pill `rm: deny` gana a default shell ask. Custom rule `ls: allow` por prefijo. Pill `ask` → UI round-trip. Fail-closed sin session UI. |
| [runtime_host.delegating.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/runtime/runtime_host.delegating.test.ts) | 2 | **Card #123 — observabilidad del snapshot.** `delegatingModelProvider.id` es dinámico (getter que resuelve el provider cacheado) y expone `vibes:<defaultModel>` en vez del id fijo `vibes-delegating`, de modo que el header de `context.snapshot` muestra el modelo real. Verifica resolución vía custom provider y cambio de modelo entre turnos. |
| [runtime_host.todo.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/runtime/runtime_host.todo.test.ts) | 2 | **Bug 76 (G18 wiring) — TodoHandler en `getRuntime`.** Regression del fix que cablea `.todoHandler(new SqliteTodoHandler(storage))` + `.storage(storageProvider)` explícito: la runtime construida lleva un `todoHandler` no nulo y, sobre la MISMA instacia de storage, un round-trip real (crear sesión → `handler.update` → leer `record.todos` → `handler.get`) confirma que handler y runtime comparten almacén. Test del singleton idempotente. Electron/settings/model_resolver mockeados; SQLite en un tmpdir real por pid. |
| [runtime_host.looplimits.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/runtime/runtime_host.looplimits.test.ts) | 9 | **Card #165 — límites del loop configurables (hot-reload).** `applyAgentLoopLimits` muta el `LoopConfig` del runtime en caliente (el loop lo lee por referencia por iteración) y `getAgentLoopLimits` expone el estado. Cubre: sin settings/vacía → defaults de vibes-core (1000 / 4h), valores válidos (min→ms), solo un campo, 0/negativos → default (no permite desactivar), NaN/Infinity → default, tipo mal (string) → default sin crash, decimales → floor, y hot-reload (muta el MISMO objeto, la siguiente lectura refleja el cambio). Electron/settings/model_resolver mockeados; no abre SQLite (prueba la mutación, no el runtime). |
| [runtime_bridge.delete.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/runtime/runtime_bridge.delete.test.ts) | — | **B6 hardening (Slice 2.1.1).** `deleteRuntimeSession`: no-op cuando el chatId no tiene sesión activa, no lanza excepciones, deja el map de sesiones activas vacío tras la llamada. |
| [permission_persist.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/runtime/permission_persist.test.ts) | 7 | **Slice 3.8** — Resiliencia ante fallo de BunnyDB. Contrato IPC `permission:persist-failed` (channel + payload Zod). `writeSettings` retorna `Promise<{ok, error?}>` — 4 tests cubren ok=true (DB success), ok=false con error (DB failure), ok=true sin DB call cuando no hay userId, ok=true para runtime-only updates (isRunning). |
| [prompt_attach.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/runtime/prompt_attach.test.ts) | — | System prompt composer: contexto + custom prompt con separador `---`. |
| [prompt_handlers.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/handlers/prompt_handlers.test.ts) | 5 | Función pura `computePromptDefaultStatus`: `hasDefault`/`isModified` (prompt sin systemId, systemId sin default, content == default, content != default, varios en el mismo map). Soporta el botón "Restaurar defaults" de Settings → Prompts. |
| [prompt_utils.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/utils/prompt_utils.test.ts) | 16 | `getSystemPrompt`: override del usuario en DB > default del código (`DEFAULT_PROMPTS`). Sin userId / sin override / fila deshabilitada → default del código; override habilitado → contenido de la DB; systemId inexistente en ambos → `""`. Invariantes: `DEFAULT_PROMPTS` cubre los 8 systemIds que el runtime inyecta (`ctx_*` + `runtime_agent_base`) y ninguna entrada está vacía. **Contrato post-rollback card #92:** los defaults viven en el código; la tabla `prompts` solo guarda overrides. **Nivel 1 (card #117, análisis #108):** `runtime_agent_base` conserva las reglas CRITICAL de tool usage y añade Concision (1-3 sentencias), Professional objectivity y 3 ejemplos `<example>` de calibración; tope de tamaño (~2 800 chars). `DEFAULT_PROMPT_SCOPES`: `ctx_plan_mode → plan`, `ctx_build_walkthrough → agent`, resto sin scope de fábrica, y solo referencia systemIds existentes. |
| [misc.deleted.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/types/misc.deleted.test.ts) | 9 | **Slice 3.10 — contract `chat:deleted`.** Channel name coincide con el `safeSend` de chat_handlers.ts; payload `{ chatId: number }` parseable por Zod; lógica de prune del renderer descarta permissions/asks/consents/todos pendientes del chatId borrado. |
| [model_selector_status.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/components/settings/model_selector_status.test.ts) | 4 | **Card #115 — deuda visual de selectores de modelo.** Documenta el estado de enchufe al runtime de los 7 selectores por tarea (auditoría 2026-08-12): 4 activos con lectores reales (`strategistModel`, `executorModel`, `visionPreprocessorModel`, `memoriesRouterModelV2`) y 3 inactivos con nota explicativa (`agentModels` → ref card #113, `standardModeModel`, `memoriesSynthesisModelV2`). Los asserts saltarán cuando se enchufe algo nuevo. |
| [prompt_guard.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/components/settings/prompt_guard.test.ts) | 3 | **Card #117 follow-up — prompt base no desactivable.** Regla pura `canDisablePrompt`: el `runtime_agent_base` no se puede desactivar (switch bloqueado con candado en Settings → Prompts); los `ctx_*` y los prompts custom sí. Protege el contrato de que el agente siempre tenga instrucciones base. |


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
| [models_dev_pricing.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/utils/models_dev_pricing.test.ts) | 10 | **Slice E — precios con tiers.** `resolveModelCost` (context-size tiers: openai/gpt-5.5 cobra más >272k; multi-tier → umbral más alto cruzado), `pricingFromCost`, y `toModelOption` aplicando el tier según el contexto del modelo. Nunca "gratis" falso. |
| [model_validator.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/utils/model_validator.test.ts) | 20 | **Slice D — validator multi-proveedor (función pura `validateModelReferences`).** selectedModel: openrouter/nativo (name pelado)/custom; modelo muerto → fallback del MISMO provider (nativo) o universal de OpenRouter (cambia provider); deprecated → solo aviso. Referencias de string (executor/strategist/memories): formato `custom::id::nombre` (doble separador), `ollama::modelo` (primera `::`), `vendor/model`. Customs de la DB cuentan para cualquier provider. Guard: catálogo vacío → no valida nada. Invariancia: no muta el original. |

**Cuándo usarlos:** Si se toca `models_dev_service.ts` (catálogo/caché/transform), `model_validator.ts` (validación en boot) o el enriquecimiento en `openai_compatible_models_service.ts`. **Nota de contract golden:** la lógica del validator (la que realmente cambió) está cubierta de forma determinista por los 16 tests puros de la Slice D contra el fixture real; no se creó un golden de `getModels(openrouter)` porque ese servicio **no se modificó** y su `fetch` no es inyectable — forzarlo exigiría refactorizar OpenRouter (scope creep). Si se cambia el contrato del output de `getModels` o del broadcast `models:migrated`, añadir entonces un golden con fetch inyectado.

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
| `context_*`, `smart_context_*` | ~6 | Context management, exclude paths, smart context deep/balanced, context window. |
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
| ★ **Contract golden swap B6** | [runtime_bridge.contract.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/runtime/runtime_bridge.contract.test.ts) | El guard del swap OpenCode → vibes-core. Verifica que `handleRuntimeStream` cumple el contrato que `chat_stream_handlers.ts` espera. Mock fetch SSE + fixtures sintéticos. |
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
