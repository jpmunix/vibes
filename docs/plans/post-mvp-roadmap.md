# Post-MVP: Roadmap

> **Precondición:** el MVP está vivo en producción. El runtime sustituye a OpenCode.
> A partir de aquí, todo es mejora incremental. Nada bloquea.

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
| 3.6 | **Tool description override** | G8 | mCode puede sobrescribir descriptions por sesión. `createSession({ toolOverrides })`. |

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
| 5.1 | **Runtime SDK** (`@mcode/core/sdk`) | — | `createRuntime()` Builder, `RuntimeEvent` tipados, helpers. Se extrae del código que ya funciona. |
| 5.2 | **Extensions SDK** (`@mcode/core/ext`) | — | `defineTool`, `defineProvider`, `definePermissionPolicy`. Validación de contratos versionados. |
| 5.3 | **Client Manifest** | G8 (prod) | Feature flags declarativos. Brand, policies, integraciones. |
| 5.4 | **Private Edition deployment** | D10 | Proceso separado, servidor HTTP, on-prem. |
| 5.5 | **SLOs y rendimiento** | D10 | Latencia, tokens/seg, sesiones concurrentes. Validar worker thread vs proceso. |
| 5.6 | **Permission DSL** | P10 | Reglas con patrones (`shell: git *` allow, `shell: *rm*` ask). |
| 5.7 | **Browser Controller** | — | Si no se hizo en Fase 3. |

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

> 📄 Documento padre: [Roadmap](file:///home/munix/Desarrollo/GitRepo/Vibes/docs/plans/implementation_plan.md)
> 📄 Fase 1: [MVP](file:///home/munix/Desarrollo/GitRepo/Vibes/docs/plans/phase1-mvp.md)
