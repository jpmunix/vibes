# Blueprint de Implementación — Compactación de Contexto en vibes-core

> Estado: PROPUESTA para revisión de funes/munix. Aún NO implementada.
> Fecha: 2026-08-08
> Principio rector: **Vibes decide cómo/cuándo, el runtime ejecuta y persiste.**

---

## 0. Resumen ejecutivo

Se añade al runtime la capacidad de compactar el contexto de una sesión.
Dos modos independientes y configurables:

- **Modo A — Presupuesto (survival)**: evita quedarnos sin ventana. Reactivo.
- **Modo B — Ahorro (proactivo)**: la JOYA. Reduce tokens de verdad
  colapsando rondas banales, recortando salidas de tools largas y
  reteniendo solo lo nutritivo. Habilita el caso "gracias después de 200K".

Ambos persisten en la DB del runtime (vía `patchSession`) y sobreviven
a la sesión (recuperables por `sessionId`).

---

## 1. Dónde se encaja hoy (estado actual del core, verificado)

### `packages/runtime/src/loop.ts` (interfaz abstracta)
- `LoopConfig` ya tiene: `maxIterations`, `maxWallClockMs`, `inputTokenBudget`,
  `totalTokenBudget`, `stopConditions`.
- NO existe nada de compactación. Terreno virgen. ✅

### `packages/runtime/src/config.ts`
- `RuntimeConfig = { id, loop: LoopConfig, logger?, workspaceRoot }`.
- `DEFAULT_RUNTIME_CONFIG.loop = { maxIterations:30, maxWallClockMs:5min,
  inputTokenBudget:32_000, totalTokenBudget:500_000 }`.

### `packages/runtime/src/storage-types.ts`
- `SessionRecord` tiene `messages: Message[]`, `summary?: string`,
  `tokenUsage`, `parentSessionId`, `systemPrompt`, `enabledTools`.
- `SessionRecordPatch` permite `patchSession`.

### `packages/runtime-impl/src/loop.ts` (implementación concreta, 538 líneas)
- Bucle `while (true)`, en cada iteración:
  1. `context.build({ history: messages, budget:{input:loopConfig.inputTokenBudget} })` (L111)
  2. plan opcional (L141)
  3. `model.stream(...)` (L161)
  4. dispatch tools (L243/L256) → `messages.push({role:'tool',...})`
  5. persist (L285)
- El punto de inyección natural de compactación es **justo ANTES de `context.build`**
  (L111), tras cargar el estado y dentro del bucle.

### `packages/runtime-impl/src/context-engine.ts` (NaiveContextEngine)
- `build()` recibe `{ history, hints, budget, prompt }`.
- Trunca `history.slice(-historyTail)` (L51, default 20).
- Si excede `budget.input`, descarta mensajes desde el más viejo (L82-95).
  **Esto es el "corta y pierde" actual** — pierde información sin resumir.
- `estimateMessagesTokens()` = chars/4 (heuristic).

---

## 2. Contrato de configuración (cómo Vibes se lo manda al runtime)

### Extensión de `LoopConfig` (`packages/runtime/src/loop.ts`)
```ts
export type CompactionConfig = {
  /** Modo A — supervivencia por presupuesto */
  budget?: {
    /** Cuándo disparar la compactación de supervivencia */
    trigger: { kind: 'tokens'; threshold: number }   // input estimado >= threshold
           | { kind: 'iterations'; every: number };  // cada N iteraciones
    /** Buffer de SALIDA garantizado (no dejar que el contexto consuma los últimos Y) */
    reserved?: number;        // default 15_000
  };
  /** Modo B — ahorro proactivo (la joya) */
  savings?: {
    enabled: boolean;
    /** Solo compactar por ahorro si el contexto supera este mínimo */
    minContext: number;       // default 80_000
    /** Compactar el historial tras terminar la respuesta si el siguiente turno
     *  sería banal (caso "gracias tras 200K") */
    idleAfterReply?: boolean; // default false
    /** Colapsar salidas de tools largas en un resumen */
    collapseTools?: boolean;  // default true
    /** Máx rondas (user+assistant) recientes que se conservan intactas */
    maxRoundsKept?: number;   // default 6
  };
  /** Modelo de compactación (si != modelo principal). Lo decide Vibes. */
  model?: string;
  /** Prompt de compactación que Vibes quiere usar. Si no, runtime usa default. */
  prompt?: string;
};
```

Se expone como campo opcional en `LoopConfig`:
```ts
export type LoopConfig = {
  /* ...existentes... */
  compaction?: CompactionConfig;
};
```

> Nota: `createSession` ya acepta override de systemPrompt/enabledTools.
> La compactación viaja por el MISMO camino: config de sesión o de runtime.

---

## 5bis. REQUISITO BASE: Configuración mutable EN CALIENTE

### Por qué (decisión de munix, 2026-08-08)
> "Requerimiento base: escapar de la lógica de opencode de que hay que hacer
>  malabares para cambiar preferencias en runtime. Quiero poder establecer al
>  iniciar el core, la sesión, o CAMBIARLO A MITAD DE PARTIDA."

La config debe poder cambiarse en 3 momentos:
1. **Al iniciar el core** (default de runtime en `RuntimeConfig.loop`).
2. **Al crear la sesión** (`createSession` — override por sesión).
3. **A mitad de partida** (sesión en curso — cambio en caliente).

### Hallazgo clave en el código actual (verificado)
En `runtime-impl/runtime.ts`, `createDefaultLoop` recibe `deps.loopConfig`
como REFERENCIA, no una copia congelada (L20-21). El loop lee
`loopConfig.inputTokenBudget`, `loopConfig.maxIterations`, etc. **en cada
iteración y en cada chequeo** (`loop.ts` L84-98, L116).

→ Por tanto, SI el objeto `loopConfig` muta sus propiedades, el loop en curso
YA las vería. **La infraestructura de "leer en caliente" YA EXISTE**.
Solo falta exponer el mecanismo público para ESCRIBIR en caliente.

### Contrato PÚBLICO nuevo en `Runtime` (`runtime.ts`)
```ts
export interface Runtime {
  // ...existentes...
  /** Actualizar la config del loop en caliente. Aplica de inmediato a
   *  todas las sesiones activas que lean loopConfig (incl. compactación). */
  updateLoopConfig(patch: Partial<LoopConfig>): void;
}

export type SessionHandle = {
  // ...existentes...
  /** Override de config para ESTA sesión (en caliente). */
  updateConfig?(patch: Partial<LoopConfig>): void;
};
```

### Implementación en `runtime-impl/runtime.ts`
- `deps.loopConfig` se sustituye por una **referencia mutable compartida**
  (p. ej. `loopConfigRef: { current: LoopConfig }`).
- `createDefaultLoop` recibe `loopConfigRef` y lee `loopConfigRef.current` en
  cada lectura (o el ref directamente).
- `updateLoopConfig(patch)` hace merge sobre `loopConfigRef.current`.
- `SessionHandle.updateConfig` hace merge sobre un override PER-SESION que el
  loop consulta con prioridad sobre el default global.

### Prioridad de resolución (menos a más específico)
```
RuntimeConfig.loop.compaction  (default global)
  < SessionRecord.compact       (override por sesión, persistido)
    < SessionHandle.updateConfig (cambio en caliente de la sesión)
```
- Modo A/B, modelo y prompt de compactación resuelven con esta prioridad.
- El cambio en caliente NO requiere reiniciar la sesión ni el loop.

### Persistencia del cambio en caliente (sesión)
Si se quiere que el override de la sesión sobreviva a un `resumeSession`,
`SessionHandle.updateConfig` escribe además en `SessionRecord` un campo
`loopOverrides?: Partial<LoopConfig>`. En el `resume`, se re-hidrata.

### Nada de "malabares" (el anti-pattern de opencode)
- Un único método público para escribir config: `updateLoopConfig` / `updateConfig`.
- Aplica de inmediato, sin recrear runtime ni sesión.
- Se puede cambiar de budget → apertura, de modo A a modo B, de modelo de
  compactación, etc., TODO en caliente.

---

## 3. Componentes nuevos del runtime

### 3.1 `packages/runtime-impl/src/compaction/estimator.ts`
Estimar tokens de `Message[]` con precisión razonable (hoy `chars/4`).
Suficiente para decidir triggers. Se reutiliza la heurística existente.

### 3.2 `packages/runtime-impl/src/compaction/summarizer.ts`
Dado un bloque de `Message[]`, un `prompt` y un `model`, devuelve un resumen
denso (`Message` sintético con `role:'system'` o un bloque de texto).

### 3.3 `packages/runtime-impl/src/compaction/tool-collapser.ts`
Recorta salidas de tools:
- Detecta `tool_result` con `result` grande (> umbral de chars).
- Lo reemplaza por un resumen conservando: tool, ok/error, longitud, y primeros
  N caracteres relevantes (o un resumen LLM si `collapseTools:true` y model).

### 3.4 `packages/runtime-impl/src/compaction/compactor.ts` (orquestador)
```
compact(
  { messages, config, model, storage, sessionId }
): Promise<{ messages: Message[]; summary: string; didCompact: boolean }>
```
Lógica:
1. Estimar tokens actuales.
2. **Modo A**: si `trigger.tokens && est >= threshold` → resumir la cola vieja.
3. **Modo B**: si `savings.enabled && est >= minContext` → decidir colapso.
4. Conservar `maxRoundsKept` rondas recientes intactas.
5. Persistir resumen en `session.summary` + el historial compactado en `messages`.

### 3.5 `packages/runtime-impl/src/compaction/index.ts` (exposición)

---

## 4. Modificaciones en `loop.ts` (runtime-impl)

1. **Cargar config de compactación** (de `loopConfig.compaction` o de la sesión).
2. **Insertar hook ANTES de `context.build`** (L111):
   ```ts
   if (loopConfig.compaction) {
     const compacted = await compactor.shouldCompact({ messages, state, config });
     if (compacted.didCompact) {
       messages = compacted.messages;
       await persist(...); // guardar EN LA DB → sobrevive
       onEvent({ type: 'context.compacted', sessionId, iteration: state.iteration,
                 summary: compacted.summary });
     }
   }
   ```
3. **Nuevo RuntimeEvent** `context.compacted` (en `@vibes/shared`) para que la
   carcasa sepa que se compactó y pueda pintar "contexto compactado" si quiere.

---

## 5. Cambios en `context-engine.ts` (si se quiere mejorar el truncado)

Opcional y recomendado: cuando `build()` trunca por presupuesto (L82-95),
en vez de "cortar y perder", que el **compactador haya actuado antes**.
Si la compactación está desactivada, mantener el comportamiento actual (cortar).

---

## 6. Tipos compartidos en `@vibes/shared`

- `RuntimeEvent` nueva variante:
  ```ts
  { type: 'context.compacted'; sessionId: string; iteration: number;
    summary: string; compactedMessages: number }
  ```
- Reutilizar `SessionRecord.summary` ya existente para persistencia.

---

## 7. Orden de implementación sugerido

### Fase 1 — Modo A (survival). Desbloquea que el loop no muera.
- [ ] Contrato `CompactionConfig.budget` en `LoopConfig`.
- [ ] `estimator.ts` + `summarizer.ts`.
- [ ] `compactor.ts` con lógica de Modo A.
- [ ] Hook en `loop.ts` antes de `context.build`.
- [ ] `RuntimeEvent.context.compacted`.
- [ ] Persistencia (summary + messages) en DB del runtime.

### Fase 2 — Modo B (ahorro). La joya.
- [ ] `CompactionConfig.savings`.
- [ ] `tool-collapser.ts` (recortar tools).
- [ ] `idleAfterReply` (detección de turno banal tras respuesta).
- [ ] Heurística de "banalidad" del siguiente turno.

### Fase 3 — Pulido
- [ ] Evals para medir cuánto reduce tokens sin perder fidelidad.
- [ ] Tuning de defaults (`minContext`, `maxRoundsKept`, `reserved`).

---

## 8. Abierto / a validar por munix

1. **Vibes manda la config por `createSession`** (config de sesión) o por
   `RuntimeConfig.loop.compaction` (default de runtime)? Recomiendo: BOTH —
   el default en runtime, override por sesión desde Vibes.
2. **El resumen de compactación**: ¿se guarda SOLO en `summary` + historial
   colapsado, o también como `Message` sintético visible en el historial?
   Recomiendo: guardar `summary` + dejar el historial con un mensaje marcador
   de rol `system` indicando "resumen de rondas anteriores".
3. **`idleAfterReply`**: ¿lo decide Vibes explícitamente (cada turno) o el
   runtime lo infiere? Recomiendo: runtime infiere con heurística simple,
   Vibes puede forzarlo con config.
4. **Colapso de tools**: ¿resumen LLM (cuesta tokens) o recorte mecánico
   (gratis, menos elegante)? Recomiendo: recorte mecánico por defecto +
   opción LLM si la carcasa lo quiere.

---

## 9. Files tocados (resumen)

- `packages/runtime/src/loop.ts` — interfaz `LoopConfig` + `CompactionConfig`.
- `packages/runtime/src/config.ts` — defaults opcionales.
- `packages/runtime-impl/src/loop.ts` — hook de compactación + persistencia + evento.
- `packages/runtime-impl/src/context-engine.ts` — (opcional) mejora de truncado.
- `packages/runtime-impl/src/compaction/*` — NUEVOS componentes.
- `packages/shared/...` — tipo `RuntimeEvent.context.compacted`.
