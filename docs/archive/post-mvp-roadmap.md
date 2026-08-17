# Post-MVP: Roadmap

> **Precondición:** el MVP está vivo en producción. El runtime sustituye a OpenCode.
> A partir de aquí, todo es mejora incremental. Nada bloquea.

## Deuda del swap B6 (Slice 2.1.4 — pendiente migración)

**Estado:** código comentado, no borrado. Funcionalidad degradada hasta que se migre al runtime.

| Feature | Dónde vivía | Por qué se comenta | Cuándo migrar |
|---|---|---|---|
| **Visual edit subagent** (`handleVisualQuickEdit`) | `src/pro/main/ipc/handlers/visual_editing_handlers.ts:269` — comentario + throw "Visual edit no migrado al runtime todavía" | El runtime no soporta sub-agentes aún (Fase 2 los introduce). Visual edit es un sub-agente especializado de OpenCode que no tiene equivalente en vibes-core v1. | Fase 5 (SDKs) — cuando el runtime exponga un mecanismo de sub-agentes reutilizable. |
| **Question tool** (`registerQuestionHandler`) | `src/ipc/ipc_host.ts:56,120` — imports + llamada comentados | DP-3 (todos/question tool) está programado para Fase 2 original. El runtime no soporta `ask_user` todavía. | Fase 2 (AGENTES) — alineado con DP-3. |

**Cómo se reactiva:**
1. Implementar el equivalente en vibes-core (visual-edit como tool/sub-agent, ask_user como tool con su `PermissionGate` paralelo).
2. Restaurar las llamadas en los archivos listados, sustituyendo el `throw` por el `await` correspondiente.
3. Borrar las definiciones de `opencode_adapter.ts` (Slice 2.1.7 — siguiente paso).

---

## FASE 2: AGENTES — El runtime se vuelve inteligente

**Objetivo:** sub-agentes y cancelación. El runtime pasa de ejecutar 1 agente a orquestar N.

| # | Qué | Gap | Notas |
|---|---|---|---|
| 2.1 | **Sub-agent infrastructure** | G3 | `spawn_agent` tool. Sesión hija como rama de la padre. `maxDepth`, budget, timeout. |
| 2.2 | **Cancelación de agentes** | P12 | `AgentHandle.cancel(mode, { graceful? })`. Cascade + individual. `child_cancelled` con `affectedFiles`. |
| 2.3 | **Prompt Builder** | G14 | Composición por secciones. Cache boundaries via `providerMeta.cacheControl`. Agnóstico al provider. |

**Criterio de salida:** build agent puede lanzar un sub-agente de exploración y cancelarlo a mitad.

---

## FASE 3: TOOLS — El runtime se vuelve capaz

**Objetivo:** completar la oferta de tools. El runtime iguala y supera a OpenCode en capacidades.

| # | Qué | Gap | Notas |
|---|---|---|---|
| 3.1 | **Tools esenciales** | G15, G16, G20 | `list_dir`, `patch`, `git_diff`, `git_log`. Bajo coste, alto valor. |
| 3.2 | **Tools de productividad** | G17, G18, G19 | `lsp`, `todowrite`, `question`. Elevan la experiencia del desarrollador. |
| 3.3 | **Web tools** | G13 | `web_fetch`, `web_search`. Decidir backend (Exa, Serper, etc.). |
| 3.4 | **Browser Controller** | G12 | Tool que controla navegador. Menor prioridad. |
| 3.5 | **MCP Gateway nativo** | G5 | Descubrimiento + registro de tools MCP en el runtime. Ambos transports (stdio + SSE). |
| 3.6 | **Tool description override** | G8 | Vibes puede sobrescribir descriptions por sesión. `createSession({ toolOverrides })`. |

**Criterio de salida:** el runtime tiene paridad de tools con OpenCode + MCP nativo.

---

## FASE 4: ROBUSTEZ — El runtime se vuelve fiable

**Objetivo:** el runtime no se cae, no se come el presupuesto, y sabe lo que cuesta.

| # | Qué | Gap | Notas |
|---|---|---|---|
| 4.1 | **Compactación Modo A** | G7 | Disparo por presupuesto. Estruja lo viejo para que el modelo tenga espacio para responder. |
| 4.2 | **Compactación Modo B** | G7 | Ahorro proactivo. Colapsa irrelevante, recorta tools largos, retiene lo nutritivo. |
| 4.3 | **Retry/fallback en loop** | G9 | `maxRetries`, backoff exponencial, `fallbackModel`. Dos capas: transporte (provider) + semántica (loop). |
| 4.4 | **Fork/resume** | G10 | `parentId` en `SessionRecord`. Fork hereda contexto. Resume rehidrata desde storage. |
| 4.5 | **Límites físicos** | P14 | Tool output cap, `context_overflow`, locks de escritura por fichero. |
| 4.6 | **Seguridad completa** | P13 | Workspace boundary + shell policy + denylist. Sandbox Docker/seccomp como implementación intercambiable. |
| 4.7 | **Observability** | G11 | Módulo opcional. Conecta al Event Bus. Traces, logs estructurados, OpenTelemetry. |

**Criterio de salida:** el runtime sobrevive a sesiones largas, herramientas ruidosas y errores de red sin perder el hilo.

---

## FASE 5: ECOSISTEMA — El runtime se vuelve plataforma

**Objetivo:** SDKs, Private Editions, y todo lo que convierte el runtime en un producto que otros pueden usar.

| # | Qué | Gap | Notas |
|---|---|---|---|
| 5.1 | **Runtime SDK** (`@vibes/sdk`) | — | `createRuntime()` Builder, `RuntimeEvent` tipados, helpers. Se extrae del código que ya funciona. |
| 5.2 | **Extensions SDK** (`@vibes/ext`) | — | `defineTool`, `defineProvider`, `definePermissionPolicy`. Validación de contratos versionados. |
| 5.3 | **Client Manifest** | G8 (prod) | Feature flags declarativos. Brand, policies, integraciones. |
| 5.4 | **Private Edition deployment** | D10 | Proceso separado, servidor HTTP, on-prem. |
| 5.5 | **SLOs y rendimiento** | D10 | Latencia, tokens/seg, sesiones concurrentes. Validar worker thread vs proceso. |
| 5.6 | **Permission DSL** | P10 | Reglas con patrones (`shell: git *` allow, `shell: *rm*` ask). |
| 5.7 | **Browser Controller** | — | Si no se hizo en Fase 3. |
| 5.8 | **Catálogo de modelos multi-proveedor** | G8 | Integrar **models.dev** como fuente complementaria de metadatos (`models.json` → metadatos ricos por ID `provider/model`; `api.json` → precios de proveedor directo). Rellena description/context/output/modalities/capabilities cuando el `/models` de un proveedor custom devuelve datos pobres. Vive en la carcasa (no toca el runtime → respeta P1). Detalle: [`implementation_plan.md`](file:///home/munix/Desarrollo/GitRepo/Vibes/../.gemini/antigravity/brain/53ad0389-55ce-4b45-9efe-daa2c1d4fd9a/implementation_plan.md). |

**Criterio de salida:** un Private Edition puede arrancar con su propio manifest, sin modificar el core.

---

## RESUMEN VISUAL

```
FASE 1 (MVP):     ████████████████████████████████████████ 100%  ← Swap OpenCode
FASE 2 (Agentes): ████████████████████ 50%                       ← Sub-agentes + cancelación
FASE 3 (Tools):   ██████████████████████████████████ 80%         ← Paridad + MCP nativo
FASE 4 (Robustez):████████████████████████████████████ 85%       ← No se cae
FASE 5 (Ecosist.):████████████████ 35%                           ← SDKs + Private Editions
```

> 📄 Documento padre: [Roadmap](file:///home/munix/Desarrollo/GitRepo/Vibes/docs/archive/implementation_plan.md)
> 📄 Fase 1: [MVP](file:///home/munix/Desarrollo/GitRepo/Vibes/docs/archive/phase1-mvp.md)
