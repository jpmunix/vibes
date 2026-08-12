# Fase 1: MVP — Sustituir OpenCode

> **Objetivo único:** que el runtime de mcode-core sustituya a OpenCode en mCode Desktop
> sin que los usuarios noten degradación. Nada más.
>
> **Regla de hierro:** cada semana que pasa sin el swap es una semana que OpenCode
> sigue siendo el cuello de botella. El MVP no busca perfección — busca el swap.

---

## 1. LOS 6 BLOQUES DEL MVP

| # | Bloque | Gap | ¿Por qué es MVP? |
|---|---|---|---|
| 1 | **Modular runtime composition** | G6 | Sin Builder no hay runtime. Es la base de todo. |
| 2 | **Provider Registry** | G1 | El runtime necesita resolver qué LLM usar. Hoy solo `openai-completions`, pero el mecanismo debe existir. |
| 3 | **Agent definitions** | G2 | mCode define build/plan/explore con prompts + tools + modelo. El runtime los ejecuta. Sin esto, el runtime no sabe qué agente corre. |
| 4 | **Permission flow** | G4 | `requestPermission` en el loop. mCode muestra banner. Sin esto, el agente tiene barra libre. |
| 5 | **6 tools existentes** | ✅ | `read_file`, `write_file`, `edit_file`, `glob`, `grep`, `shell`. Ya funcionan. Solo empaquetarlas en el ToolRegistry. |
| 6 | **Bridge SDK** | N/A | Traduce `RuntimeEvent` → IPC de mCode. Es el swap. Sustituye `opencode_adapter.ts` (5500 líneas). |

---

## 2. ORDEN DE ATAQUE (6 semanas)

```
Semana 1-2: CIMIENTOS
  Bloque 1: Modular runtime composition
  └─ Builder pattern: createRuntime().withTools().withProvider().build()
  └─ Criterio de salida: runtime arranca con tools + provider, pasa tests de contrato

  Bloque 2: Provider Registry
  └─ ProviderDescriptor → ProviderRegistry.resolve() → ModelProvider
  └─ Implementación: openai-completions (la que ya existe)
  └─ Criterio de salida: runtime completa un turno contra un LLM real

Semana 3-4: CONTRATOS
  Bloque 3: Agent definitions
  └─ AgentDefinition { id, model, systemPrompt, tools, toolOverrides, ... }
  └─ createSession({ agent }) respeta el AgentDefinition
  └─ Criterio de salida: sesión con build agent ejecuta tools correctas

  Bloque 4: Permission flow
  └─ Tool.requiresConsent + ctx.requestPermission(toolId, args)
  └─ Loop emite evento, espera respuesta, ejecuta o rechaza
  └─ Criterio de salida: tool peligrosa pide permiso, tool segura no

Semana 5-6: SWAP
  Bloque 5: 6 tools empaquetadas
  └─ read_file, write_file, edit_file, glob, grep, shell registradas en ToolRegistry
  └─ Criterio de salida: todas las tools pasan tests de integración contra Workspace real

  Bloque 6: Bridge SDK
  └─ Mapeo RuntimeEvent → IPC de mCode (contratos existentes intactos)
  └─ Sustituye opencode_adapter.ts
  └─ Criterio de salida: mCode Desktop funciona con runtime en lugar de OpenCode
  └─ Los usuarios de pruebas no notan diferencia
```

---

## 3. LO QUE NO ENTRA EN EL MVP

| Qué | Por qué NO |
|---|---|
| **Sub-agentes** | mCode hoy no tiene sub-agentes con OpenCode. No es regresión. |
| **MCP Gateway** | mCode ya tiene MCP via OpenCode. El Bridge lo mantiene mientras migramos. |
| **Compactación** | Ni OpenCode lo tiene. No es regresión. |
| **Tools nuevas** (lsp, patch, web_fetch, todowrite, question, etc.) | OpenCode las tiene, pero mCode no depende de ellas para funcionar. Se añaden post-MVP. |
| **Observability** | Nice-to-have. No bloquea. |
| **Browser Controller** | No se usa hoy. |
| **Runtime SDK + Ext SDK** | El Bridge SDK se construye *durante* el MVP porque es el swap. Los otros dos se extraen *después* de que el runtime funcione. |
| **Fork/resume** | No se usa hoy. |
| **Cost Controller avanzado** | Budgets de tokens básicos en `LoopConfig` sí. Facturación/€ no. |
| **Prompt Builder** (composición por secciones) | mCode envía el system prompt como string. El builder es post-MVP. |
| **Tool description override** | Las descriptions por defecto del runtime bastan para el MVP. |
| **Seguridad avanzada** (Docker, seccomp) | Workspace boundary + pills + shell policy básica (P13 del Roadmap). Suficiente para MVP. |
| **Cancelación de agentes** (P12) | El runtime recibe AbortSignal. Cancelación con modos/graceful es post-MVP. |

---

## 4. CRITERIOS DE SALIDA DEL MVP

- [ ] mCode Desktop arranca con mcode-core runtime en lugar de OpenCode
- [ ] Chat completo: prompt → streaming → tools → respuesta. Sin regresiones.
- [ ] Permisos: tools peligrosas piden confirmación. El usuario puede allow/deny.
- [ ] Build agent (el más usado) funciona idéntico al actual.
- [ ] `opencode_adapter.ts` eliminado o desactivado por feature flag.
- [ ] Tests de contrato para los 6 bloques pasan en CI.

---

## 5. RIESGOS DEL MVP

| Riesgo | Mitigación |
|---|---|
| **Bridge SDK no cubre todos los eventos** | Feature flag para volver a OpenCode en caliente. El Bridge se construye con el adapter como referencia. |
| **Provider Registry no escala** | Solo necesita 1 provider (openai-completions). La extensibilidad se prueba en post-MVP. |
| **Permission flow rompe UX** | El contrato `requestPermission` es fire-and-forget desde el runtime. mCode decide UI. Si falla, mCode devuelve `deny` por defecto. |
| **El runtime no rinde como OpenCode** | SLOs básicos (latencia de turno < 500ms extra sobre OpenCode). Si no se cumple, se investiga antes de quitar el feature flag. |

---

> 📄 Documento padre: [Roadmap](file:///home/munix/Desarrollo/GitRepo/Vibes/docs/archive/implementation_plan.md)
