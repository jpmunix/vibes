# 🧠 Memorias v2 — Plan de Implementación

De notas atómicas a memorias compactadas.

> [!IMPORTANT]
> ✅ **IMPLEMENTACIÓN COMPLETADA** — 2026-05-06
> Todas las fases (P0-P4) han sido implementadas y verificadas con `npx tsc --noEmit`.

---

## Estado Final

| Aspecto | Antes | Después |
|---|---|---|
| Tipos | 5 (`fact`, `preference`, `issue`, `episode`, `decision`) | ✅ 3 (`session`, `preference`, `issue`) + legacy compat |
| Síntesis | Cada mensaje → LLM | ✅ Cada 3 rondas → LLM (batching) |
| Bootstrap | 10 facts atómicos | ✅ 3 memorias densas tipo `session` |
| Compactación | ❌ No existía | ✅ Automática: fusionar sessions >30 días |
| Prompt synthesis | ✅ Ya migrado a v2 | ✅ Ya migrado |
| Prompt onboarding | Usaba `fact`/`decision` | ✅ Migrado a `session` |
| Migración DB | ❌ No existía | ✅ Auto-migración legacy→session al startup |
| UI Labels | Solo legacy types | ✅ `session` como tipo principal en filtros y selector |

---

## ~~P0: Migrar Tipos en Código~~ ✅

> Completado el 2026-05-06.

- `memory_extractor.ts`: `session` añadido a `SynthesisOperation.type` + `VALID_TYPES` + filtro longitud
- `memory_bootstrap.ts`: `session` añadido a ambos `VALID_TYPES` + prompt Phase 2 actualizado
- `memory_context_builder.ts`: Label `session` añadido a `TYPE_LABELS`
- `prompts/index.ts`: Prompt `memory_onboarding` migrado de `fact`/`decision` → `session`
- `memory_lifecycle.ts`: Nueva función `migrateLegacyTypesToSession()` — auto-run al startup
- `memory_handlers.ts`: Wire-up de la migración fire-and-forget al registrar handlers

---

## ~~P1: Batching cada 3 Rondas~~ ✅

> Completado el 2026-05-06.

### Diseño implementado
```
Ronda 1: usuario pide → IA responde     → bufferChatRound() → buffer
Ronda 2: usuario ajusta → IA corrige    → bufferChatRound() → buffer  
Ronda 3: usuario confirma → IA entrega  → bufferChatRound() → ✅ SYNTHESIS (batch de 3)
```

### Cambios
- `memory_extractor.ts`: Nuevo sistema `bufferChatRound()` + `flushChatBuffer()` + `extractMemoriesFromBatch()`
  - Buffer in-memory por chatId (`Map<string, ChatBuffer>`)
  - El batch construye un user message con todas las rondas y el presupuesto de tokens distribuido
  - `compactOldSessions()` se dispara fire-and-forget tras cada synthesis exitoso (P2)
- `chat_stream_handlers.ts`: Ambas llamadas a `extractMemoriesFromChatCycle` → `bufferChatRound`
  - Cancelled responses con contenido parcial también buffered

---

## ~~P2: Compactación Automática~~ ✅

> Completado el 2026-05-06.

### Diseño implementado
- Trigger: tras cada batch synthesis exitoso (fire-and-forget)
- Condición: >20 sessions activas Y ≥5 con `updatedAt` > 30 días
- LLM genera 1 párrafo denso (100-300 palabras) con las decisiones clave
- Originales desactivadas (`enabled = 0`), compactada insertada como nueva

### Cambios
- `memory_lifecycle.ts`: Nueva función `compactOldSessions(appId, userId)`
  - Prompt de compactación dedicado (fusionar, eliminar redundancias, priorizar lo reciente)
  - Key auto-generada: `compacted_sessions_YYYYMMDD`

---

## ~~P3: Bootstrap Denso~~ ✅

> Completado el 2026-05-06.

### Cambios
- `memory_bootstrap.ts`: Cap reducido de `operations.slice(0, 10)` → `operations.slice(0, 3)`
- `prompts/index.ts`: Prompt `memory_onboarding` migrado a tipos v2 (`session`)

---

## ~~P4: Actualizar UI Labels~~ ✅

> Completado el 2026-05-06 (integrado en P0).

### Cambios
- `MemoryPanel.tsx`:
  - `TYPE_LABELS`: `session: "Sesión"` como primer tipo
  - `TYPE_WEIGHTS`: `session: 1.0`
  - Filtros: `session` como primera opción (antes de legacy)
  - Selector de crear: solo `session`, `preference`, `issue`
  - Default type cambiado de `fact` → `session`

---

## Plan de Verificación

1. ✅ **P0**: `npx tsc --noEmit` — zero errores
2. **P1**: Enviar 4 mensajes en un chat → verificar que synthesis corre solo en el 3ro (logs de pipeline)
3. **P2**: Crear >20 memorias `session` con createdAt >30 días → verificar que se compactan automáticamente
4. **P3**: Crear nuevo proyecto → verificar que bootstrap genera ≤3 memorias densas (no 10 atómicas)
5. **Build**: `npm run build` — zero errores
