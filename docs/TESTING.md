# Inventario de Tests — Vibes / mCode

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

## Tests Unitarios / Integration (Vitest) — 12 archivos

### Runtime swap (B6) — Frontera Vibes ↔ vibes-core

| Archivo | Líneas | Qué cubre |
|---|---|---|
| [runtime_bridge.contract.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/runtime/runtime_bridge.contract.test.ts) | 565 | ★ **Contract test golden del swap B6.** Mock fetch SSE + in-memory storage. Verifica return shape (7 fields: `cachedTokens`, `costUsd`, `fullResponse`, `inputTokens`, `outputTokens`, `reasoningTokens`, `success`). IPC `chat:response:chunk` con `chatId` correcto. Tags `<vibes-write>`, `<vibes-files-changed>`, `<vibes-token-usage>`, `<vibes-cancelled>`. Hidratación DP-4: history se inyecta una vez, sin duplicar prompt, scrubbing de tags previos. Permisos denegados (fail-closed). Cancelación: abort produce markers de cancel. Multi-turn: segunda request hidrata el primer exchange. |
| [event_mapper.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/runtime/event_mapper.test.ts) | — | Parity con OpenCode adapter: mapeo toolId → `<vibes-*>` tag, escape de atributos, extracción de detail/content, `<vibes-files-changed>`, `<vibes-token-usage>`, `<vibes-cancelled>`, `cleanResponseText` (REDACTED/thinking/think/assistant_response). |
| [model_resolver.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/runtime/model_resolver.test.ts) | — | Precedencia de providers: customProviders > ollama > lmstudio > openrouter nativo. Gateway prefix `provider/model`. Multi-key OpenRouter. Fallback env var. Custom agent static model. |
| [permission_state.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/runtime/permission_state.test.ts) | — | Fail-closed permission gate: respond, abort, timeout, unknown vocabulary → reject. Session UI context registry. |
| [prompt_attach.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/runtime/prompt_attach.test.ts) | — | System prompt composer: contexto + custom prompt con separador `---`. |
| [runtime_host.gate.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/ipc/runtime/runtime_host.gate.test.ts) | — | `createVibesPermissionGate`: read-only fast path (read_file/glob/grep), pills allow/deny/ask, fail-closed sin UI, ask round-trip emitiendo `opencode-permission:request`. |

**Cuándo usarlos:** Si se toca la capa `src/ipc/runtime/` (el bridge entre Vibes y vibes-core). El contract test golden es **el guard del swap B6**: cualquier cambio en el output que cruza la frontera requiere actualizar este test.

---

### Pro — Turbo edits y search-replace

| Archivo | Líneas | Qué cubre |
|---|---|---|
| [engine_fetch.spec.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/pro/main/ipc/handlers/agent/tools/engine_fetch.spec.ts) | — | Routing de turbo file edits vía OpenRouter con `proModeModel`. Verifica URL, headers, body. |
| [search_replace.spec.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/pro/main/ipc/handlers/agent/tools/search_replace.spec.ts) | — | Tool `search_replace`: schema, validación, exact match, fuzzy match (whitespace/indent/tabs), escape de merge conflict markers, buildXml streaming, `getConsentPreview`. |
| [search_replace_dsl.spec.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/pro/main/ipc/processors/search_replace_dsl.spec.ts) | — | ★ **Golden con fixtures.** Lee `search_replace_passes.txt` (19673 bytes) y `search_replace_fails.txt` (4646 bytes), ejecuta `applySearchReplace` con `it.each`. Cambiar fixtures requiere discusión. |
| [search_replace_processor.spec.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/pro/main/ipc/processors/search_replace_processor.spec.ts) | — | Cascading fuzzy matching Pass 1-4 (exact → trailing WS → leading/trailing WS → unicode normalization smart quotes/en-dash/NBSP), CRLF, indent preservation, empty SEARCH block, detailed failure logging con `toMatchInlineSnapshot`. |
| [search_replace_processor.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/pro/main/ipc/processors/search_replace_processor.test.ts) | — | ⚠️ Variante minimal con mismo target: smart quotes, whitespace normalization, ambiguous detection, exact match. **Solapa con el `.spec.ts`** — candidato a consolidar. |
| [visual_editing_utils.test.ts](file:///home/munix/Desarrollo/GitRepo/Vibes/src/pro/main/utils/visual_editing_utils.test.ts) | — | `transformContent` y `analyzeComponent`: manipulación de className (Tailwind arbitrary values, font-weight vs font-family prefixes), cambios por línea. |

**Cuándo usarlos:** Si se toca el sistema de turbo edits, search-replace DSL, o visual editing.

---

## Tests E2E (Playwright) — 105 specs + 254 snapshots

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
| `turbo_edits_v2`, `uncommitted_files_banner` | ~2 | Turbo edits v2 con search-replace fallback. |
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
