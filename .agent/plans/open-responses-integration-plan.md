# Plan de Integración: Open Responses → Vibes

> **Fecha:** 2026-02-18
> **Estado:** 📋 Pendiente de revisión
> **Objetivo:** Mejorar el agentic loop, manejo de errores y flujos de chat aplicando conceptos de la spec Open Responses

---

## Índice

1. [Errores Estructurados](#1-errores-estructurados)
2. [`previous_response_id` para el Agente](#2-previous_response_id-para-el-agente)
3. [`tool_choice` y `allowed_tools` en Auto-Fix Loops](#3-tool_choice-y-allowed_tools-en-auto-fix-loops)
4. [Recuperación de Stream Roto](#4-recuperación-de-stream-roto)
5. [`service_tier` para Priorización](#5-service_tier-para-priorización)
6. [Truncation Declarativa](#6-truncation-declarativa)
7. [Simplificación de `fallback_ai_model.ts`](#7-simplificación-de-fallback_ai_modelts)

---

## 1. Errores Estructurados

**Fase:** 1 (Quick Win)
**Esfuerzo:** 🟢 Bajo (1 día)
**Impacto:** 🔥🔥 Alto en UX

### 1.1 Problema Actual

Los errores del LLM se manejan como strings crudos con pattern matching frágil:

**Backend** (`chat_stream_handlers.ts` línea 1481-1512):
```typescript
onError: (error: any) => {
  let errorMessage = (error as any)?.error?.message;
  const responseBody = error?.error?.responseBody;
  if (errorMessage && responseBody) {
    errorMessage += "\n\nDetails: " + responseBody;
  }
  const message = errorMessage || JSON.stringify(error);
  // Se envía como string plano al frontend
  event.sender.send("chat:response:error", {
    chatId: req.chatId,
    error: `${AI_STREAMING_ERROR_MESSAGE_PREFIX}${message}`,
  });
};
```

**Frontend** (`ChatErrorBox.tsx` y handlers similares):
```typescript
// Parsing ad-hoc de strings para detectar tipos de error
if (error.includes("Resource has been exhausted")) { ... }
if (error.includes("Provider returned error")) { ... }
```

### 1.2 Solución Propuesta

Definir una interfaz de error estructurada basada en Open Responses:

```typescript
// src/ipc/types/errors.ts (nuevo archivo)
interface StructuredError {
  type: "server_error" | "invalid_request" | "model_error" | "too_many_requests" | "not_found";
  code?: string; // e.g. "rate_limited", "model_not_found", "context_length_exceeded"
  message: string;
  param?: string; // El parámetro que causó el error
  retryable: boolean;
  retryAfterMs?: number; // Basado en header Retry-After de OpenRouter
}
```

### 1.3 Cambios Requeridos

| Archivo | Cambio |
|---|---|
| `src/ipc/types/errors.ts` | **Nuevo:** Definir `StructuredError` interface y función `parseProviderError()` |
| `src/ipc/types/chat.ts` | Cambiar tipo de `error` en `chat:response:error` de `string` a `StructuredError \| string` (backward compatible) |
| `src/ipc/handlers/chat_stream_handlers.ts` | En `onError`: parsear error del provider a `StructuredError` antes de enviarlo |
| `src/pro/main/ipc/handlers/local_agent/local_agent_handler.ts` | Mismo cambio en sus `onError` handlers |
| `src/components/ChatErrorBox.tsx` | Renderizar errores con switch sobre `error.type` en lugar de `error.includes()` |
| `src/ipc/utils/fallback_ai_model.ts` | Usar `StructuredError.type` para decidir si hacer retry vs fallback |

### 1.4 Ejemplo de Implementación

```typescript
// parseProviderError.ts
function parseProviderError(rawError: any): StructuredError {
  const statusCode = rawError?.statusCode || rawError?.error?.statusCode;
  const message = rawError?.error?.message || rawError?.message || String(rawError);

  // Mapear status codes a tipos Open Responses
  if (statusCode === 429) {
    return {
      type: "too_many_requests",
      code: "rate_limited",
      message,
      retryable: true,
      retryAfterMs: parseRetryAfter(rawError),
    };
  }
  if (statusCode === 400) {
    // Detectar sub-tipos comunes
    const code = message.includes("context_length") ? "context_length_exceeded"
               : message.includes("invalid") ? "invalid_parameter"
               : undefined;
    return { type: "invalid_request", code, message, param: rawError?.param, retryable: false };
  }
  if (statusCode >= 500) {
    return { type: "server_error", message, retryable: true };
  }
  // Default: model error
  return { type: "model_error", message, retryable: false };
}
```

### 1.5 Beneficios Concretos

- **UX:** El `ChatErrorBox` puede mostrar acciones contextuales ("Reintentar" solo si `retryable: true`, "Cambiar modelo" si `model_error`)
- **Fallback:** `fallback_ai_model.ts` puede decidir mejor: rate limit → esperar, model error → cambiar modelo, server error → reintentar
- **Debugging:** Logs estructurados en lugar de strings sueltos
- **Mantenimiento:** Elimina ~15 bloques de `if (error.includes(...))` dispersos

### 1.6 ¿Aprobado?

- [ ] Sí, implementar como está descrito
- [ ] Sí, con modificaciones: ___
- [ ] No, razón: ___
- [ ] Posponer

---

## 2. `previous_response_id` para el Agente

**Fase:** 2 (Impacto Grande)
**Esfuerzo:** 🟡 Medio (3-4 días)
**Impacto:** 🔥🔥🔥 Máximo (ahorro de tokens/latencia/costes)

### 2.1 Problema Actual

En `local_agent_handler.ts`, el agente usa `streamText` con `maxSteps: 25`. Cada step del agentic loop reenvía **TODO el historial de mensajes** al provider:

```
Step 1: [system + history + prompt]                    → ~50K tokens input
Step 2: [system + history + prompt + step1_output]     → ~55K tokens input
Step 3: [system + history + prompt + step1 + step2]    → ~60K tokens input
...
Step 10: [system + history + prompt + step1..step9]    → ~95K tokens input
```

**Total enviado en 10 steps:** ~725K tokens de input (acumulativo).

Además en `chat_stream_handlers.ts` (build mode), la continuation de vibes-write sin cerrar (líneas 1896-1904) reenvía todo el historial + la respuesta parcial:

```typescript
chatMessages: [
  ...chatMessages,                           // Todo el historial
  { role: "assistant", content: fullResponse }, // Respuesta hasta ahora
],
```

### 2.2 Solución Propuesta

Usar `previous_response_id` de Open Responses para que el provider mantenga el contexto server-side:

```
Step 1: [system + history + prompt]                    → ~50K tokens input → response_id: "resp_abc"
Step 2: previous_response_id: "resp_abc" + [tool_result] → ~1K tokens input
Step 3: previous_response_id: "resp_def" + [tool_result] → ~1K tokens input
...
Step 10: previous_response_id: "resp_xyz" + [tool_result] → ~1K tokens input
```

**Total enviado en 10 steps:** ~59K tokens de input. **Ahorro: ~92%**.

### 2.3 Dependencia Crítica: Soporte de OpenRouter

> ⚠️ **IMPORTANTE:** Antes de implementar esto, necesitamos verificar si OpenRouter soporta `previous_response_id`.
> - Si OpenRouter lo soporta nativamente → implementación directa.
> - Si no → podemos implementar un cache server-side local como alternativa (menor ahorro pero sigue siendo beneficioso).
> - Si solo algunos providers detrás de OpenRouter lo soportan → implementar con fallback.

### 2.4 Cambios Requeridos (si OpenRouter soporta)

| Archivo | Cambio |
|---|---|
| **DB Schema** (`schema.ts`) | Añadir campo `responseId: text` a tabla `messages` |
| **DB Migration** | Nueva migración para añadir columna `response_id` |
| `local_agent_handler.ts` | Capturar `response_id` del primer step, enviar `previous_response_id` en steps siguientes |
| `chat_stream_handlers.ts` | En continuation loops (vibes-write, auto-fix), usar `previous_response_id` en lugar de re-enviar todo |
| Nuevo: `src/ipc/utils/response_id_cache.ts` | Cache en memoria de response_ids con TTL (por si el provider los expira) |

### 2.5 Cambios Requeridos (alternativa: cache local)

Si OpenRouter no soporta `previous_response_id`:

| Archivo | Cambio |
|---|---|
| Nuevo: `src/ipc/utils/context_cache.ts` | Cache local de contextos por `chatId`. Guarda el contexto enviado; en el siguiente step envía solo el diff |
| `local_agent_handler.ts` | En vez de `previous_response_id`, implementar "delta messages" enviando solo mensajes nuevos + un resumen comprimido del historial |
| `chat_stream_handlers.ts` | Misma estrategia para continuation loops |

### 2.6 Flujo del Agente con `previous_response_id`

```
┌─────────────────────────────────────────────────────┐
│ Step 1: Request inicial                              │
│   input: [system, history, user_prompt]              │
│   → response_id: "resp_001"                          │
│   → output: [thinking, tool_call(list_files)]        │
│   → Guardar resp_001 en DB                           │
├─────────────────────────────────────────────────────┤
│ Step 2: Tool result                                  │
│   previous_response_id: "resp_001"                   │
│   input: [tool_result(list_files)]                   │
│   → response_id: "resp_002"                          │
│   → output: [thinking, tool_call(read_file)]         │
├─────────────────────────────────────────────────────┤
│ Step 3: Tool result                                  │
│   previous_response_id: "resp_002"                   │
│   input: [tool_result(read_file)]                    │
│   → response_id: "resp_003"                          │
│   → output: [message("Aquí está el cambio...")]      │
│   → FIN (no más tool_calls)                          │
└─────────────────────────────────────────────────────┘
```

### 2.7 Manejo de Errores / Edge Cases

- **`response_id` expirado:** Fallback a enviar historial completo (como funciona hoy)  
- **Provider no soporta:** Detectar y caer en modo legacy automáticamente
- **Undo/Redo:** El `response_id` se invalida; enviar contexto completo
- **Cambio de modelo mid-chat:** El `response_id` es del modelo anterior; enviar contexto completo

### 2.8 Beneficios Concretos

- **Costes:** ~90% menos tokens de input en sesiones de agente multi-step
- **Latencia:** Menos datos por request = respuestas más rápidas
- **Context window:** Menos riesgo de exceder el límite de contexto en sesiones largas
- **El dynamic token capping** (líneas 1346-1371) casi nunca se activaría

### 2.9 ¿Aprobado?

- [ ] Sí, implementar (verificar soporte OpenRouter primero)
- [ ] Sí, pero solo la alternativa de cache local
- [ ] Sí, con modificaciones: ___
- [ ] No, razón: ___
- [ ] Posponer hasta que OpenRouter confirme soporte

---

## 3. `tool_choice` y `allowed_tools` en Auto-Fix Loops

**Fase:** 1 (Quick Win)
**Esfuerzo:** 🟢 Bajo (0.5 días)
**Impacto:** 🔥🔥 Medio-Alto (loops de reparación más predecibles)

### 3.1 Problema Actual

En `chat_stream_handlers.ts`, los loops de auto-fix envían requests sin controlar qué tools el modelo puede usar:

**Loop de search-replace fix** (líneas 1819-1830):
```typescript
const { fullStream: fixSearchReplaceStream } = await simpleStreamText({
  chatMessages: [...chatMessages, ...previousAttempts, userPrompt],
  modelClient: autoFixModelClient,
  files: files,
  // ❌ Sin tool_choice → el modelo puede decidir no usar herramientas
  // ❌ Sin allowed_tools → el modelo puede usar cualquier herramienta
});
```

**Loop de problem fix** (líneas 1997-2022):
```typescript
const { fullStream } = await simpleStreamText({
  modelClient: problemFixModelClient,
  files: files,
  chatMessages: [...],
  // ❌ Mismo problema: sin restricción de herramientas
});
```

Esto causa que a veces el modelo:
- Responde con texto en lugar de generar code edits
- Usa `vibes-write` cuando debería usar `vibes-search-replace` (o viceversa)
- Ignora las herramientas y da una explicación textual

### 3.2 Solución Propuesta

Usar `tool_choice` para forzar el comportamiento deseado en cada loop:

```typescript
// Loop de search-replace fix
await simpleStreamText({
  chatMessages: [...],
  modelClient: autoFixModelClient,
  // Forzar que el modelo genere código, no texto libre
  tool_choice: "required", // DEBE usar alguna herramienta
});

// O más específico si tenemos tools definidos:
await simpleStreamText({
  chatMessages: [...],
  modelClient: autoFixModelClient,
  tool_choice: { type: "function", name: "edit_code" },
});
```

Para el agente (línea 380-384 de `local_agent_handler.ts`):
```typescript
// Primer step: forzar exploración antes de editar
await streamText({
  ...options,
  // Step 1: solo herramientas de lectura
  allowed_tools: ["list_files", "read_file", "code_search", "grep"],
  // Steps 2+: todas las herramientas disponibles
});
```

### 3.3 Cambios Requeridos

| Archivo | Cambio |
|---|---|
| `src/ipc/handlers/chat_stream_handlers.ts` | En `simpleStreamText`: aceptar parámetro opcional `toolChoice` y `allowedTools`, pasarlos a `streamText` |
| `src/ipc/handlers/chat_stream_handlers.ts` | En loops de auto-fix (search-replace y problem-fix): pasar `tool_choice: "required"` |
| `src/pro/main/ipc/handlers/local_agent/local_agent_handler.ts` | Opcional: pasar `allowed_tools` restrictivo en el primer step para forzar exploración |

### 3.4 Consideraciones

- **Compatibilidad con AI SDK:** Verificar que `streamText` de Vercel AI SDK pasa correctamente `toolChoice` al provider via OpenRouter.
- **Modelos que no soportan `tool_choice`:** Algunos modelos detrás de OpenRouter pueden ignorar este parámetro; en ese caso, el comportamiento es el mismo que hoy (no rompe nada).
- **`allowed_tools` y cache:** La ventaja principal de `allowed_tools` vs cambiar `tools` es que preserva el caché de prompts. Esto importa sobre todo si usamos prompt caching de Anthropic/OpenAI.

### 3.5 ¿Aprobado?

- [ ] Sí, implementar `tool_choice: "required"` en auto-fix loops
- [ ] Sí, implementar también `allowed_tools` en el agente
- [ ] Sí, con modificaciones: ___
- [ ] No, razón: ___
- [ ] Posponer

---

## 4. Recuperación de Stream Roto

**Fase:** 2 (Impacto Grande)
**Esfuerzo:** 🟡 Medio (2-3 días)
**Impacto:** 🔥🔥 Alto en estabilidad/UX

### 4.1 Problema Actual

En `useStreamChat.ts`, cuando el stream se rompe (red inestable, timeout de OpenRouter, error del provider):

```typescript
onError: ({ error: errorMessage }) => {
  pendingStreamChatIds.delete(chatId);
  updateMapAtom(setErrorById, chatId, errorMessage);
  updateMapAtom(setIsStreamingById, chatId, false);
  // FIN. No hay intento de recuperación.
  // El usuario ve un error y tiene que re-enviar manualmente.
};
```

En el backend (`chat_stream_handlers.ts`), el `onError` de `streamText` (línea 1481) también solo logea y envía el error, sin intentar recuperar el stream parcial.

**Consecuencia:** Si OpenRouter tiene un timeout después de 30 segundos de streaming (el modelo ya generó 2000 tokens de respuesta), el usuario pierde TODO. Tiene que re-enviar el prompt y esperar de nuevo.

### 4.2 Solución Propuesta

Implementar recuperación en tres niveles:

#### Nivel 1: Preservar respuesta parcial (backend)
Ya tienes `partialResponses.set(req.chatId, fullResponse)` en `processResponseChunkUpdate`. El cambio es:

```typescript
onError: (error) => {
  const partialResponse = partialResponses.get(req.chatId);
  if (partialResponse && partialResponse.length > 100) {
    // Guardar la respuesta parcial en DB con marca de incompleta
    await db.update(messages).set({
      content: partialResponse + "\n\n[⚠️ Respuesta interrumpida por error]",
      status: "incomplete", // Nuevo campo
    }).where(eq(messages.id, placeholderAssistantMessage.id));
  }
  // Enviar error estructurado con info de recuperación
  event.sender.send("chat:response:error", {
    chatId: req.chatId,
    error: parseProviderError(error),
    hasPartialResponse: !!partialResponse,
    canRetry: isRetryableError(error),
  });
};
```

#### Nivel 2: Auto-retry en errores transitorios (backend)
Para errores de red/timeout, reintentar automáticamente el stream:

```typescript
// En simpleStreamText, envolver streamText con retry
let streamAttempt = 0;
const maxStreamRetries = 2;

while (streamAttempt <= maxStreamRetries) {
  try {
    const streamResult = streamText({ ... });
    return streamResult;
  } catch (error) {
    const structured = parseProviderError(error);
    if (structured.retryable && streamAttempt < maxStreamRetries) {
      streamAttempt++;
      const delay = structured.retryAfterMs || (1000 * streamAttempt);
      await new Promise(r => setTimeout(r, delay));
      continue;
    }
    throw error;
  }
}
```

#### Nivel 3: "Continuar respuesta" en el frontend (frontend)
En `ChatErrorBox`, si hay respuesta parcial + error retryable:

```tsx
{error.canRetry && error.hasPartialResponse && (
  <Button onClick={() => streamMessage({
    prompt: "__continue__",  // Señal especial para el backend
    chatId,
  })}>
    Continuar respuesta
  </Button>
)}
```

### 4.3 Cambios Requeridos

| Archivo | Cambio |
|---|---|
| **DB Schema** (`schema.ts`) | Añadir campo `status: text` a tabla `messages` (valores: `completed`, `incomplete`, `failed`) |
| `src/ipc/handlers/chat_stream_handlers.ts` | En `onError`: guardar respuesta parcial en DB con status `incomplete` |
| `src/ipc/handlers/chat_stream_handlers.ts` | En `simpleStreamText`: wrapper de retry para errores transitorios |
| `src/ipc/types/chat.ts` | Expandir tipo de `chat:response:error` para incluir `hasPartialResponse`, `canRetry` |
| `src/hooks/useStreamChat.ts` | En `onError`: manejar la info extra de recuperación |
| `src/components/ChatErrorBox.tsx` | Mostrar botón "Continuar" si es posible |
| `src/ipc/handlers/chat_stream_handlers.ts` | Manejar `prompt: "__continue__"` para reanudar desde respuesta parcial |

### 4.4 Edge Cases

- **Respuesta parcial con `vibes-write` abierto:** Ya tienes lógica para esto (continuation de vibes-write sin cerrar). Se puede reusar.
- **Respuesta parcial con tool_call incompleto:** Descartar el tool_call parcial, reintentar solo el texto.
- **Múltiples errores seguidos:** Después de 3 retries, mostrar error final con opción de "Enviar de nuevo".

### 4.5 ¿Aprobado?

- [ ] Sí, implementar los 3 niveles
- [ ] Sí, solo Nivel 1 (preservar parcial) + Nivel 2 (auto-retry)
- [ ] Sí, solo Nivel 1 (preservar parcial)
- [ ] Sí, con modificaciones: ___
- [ ] No, razón: ___
- [ ] Posponer

---

## 5. `service_tier` para Priorización

**Fase:** 1 (Quick Win)
**Esfuerzo:** 🟢 Muy bajo (0.5 días)
**Impacto:** 🔥 Medio (mejor latencia percibida)

### 5.1 Problema Actual

Todas las requests a OpenRouter tienen la misma prioridad:
- Generación de título de chat → misma prioridad que edición de código
- Summarize de chat → misma prioridad que respuesta del agente
- Auto-fix de problemas → misma prioridad que interacción directa del usuario

### 5.2 Solución Propuesta

Mapear cada tipo de request a un `service_tier` apropiado:

| Tipo de Request | Archivo | `service_tier` |
|---|---|---|
| Chat directo del usuario (build/ask/agent) | `chat_stream_handlers.ts`, `local_agent_handler.ts` | `"default"` o `"priority"` |
| Generación de título | `generateChatTitle` handler | `"batch"` |
| Summarize chat | Cuando `isSummarizeIntent = true` | `"batch"` |
| Auto-fix problems | Loops de auto-fix | `"default"` |
| Help bot | `help_bot_handlers.ts` | `"batch"` |
| Theme generation | `themes_handlers.ts` | `"batch"` |

### 5.3 Cambios Requeridos

| Archivo | Cambio |
|---|---|
| `src/ipc/handlers/chat_stream_handlers.ts` | En `simpleStreamText`: aceptar `serviceTier` param, pasarlo en `providerOptions` |
| `src/ipc/handlers/chat_stream_handlers.ts` | Pasar `serviceTier: "batch"` para summarize, `"default"` para lo demás |
| `src/ipc/handlers/help_bot_handlers.ts` | Pasar `serviceTier: "batch"` |
| `src/pro/main/ipc/handlers/themes_handlers.ts` | Pasar `serviceTier: "batch"` |

### 5.4 Consideraciones

- **Soporte OpenRouter:** Verificar si OpenRouter pasa `service_tier` al provider subyacente. Si no lo soporta, el parámetro simplemente se ignora (no rompe nada).
- **Costes:** `"batch"` puede tener precios distintos en algunos providers. Verificar tarifas.

### 5.5 ¿Aprobado?

- [ ] Sí, implementar
- [ ] Sí, con modificaciones: ___
- [ ] No, razón: ___
- [ ] Posponer

---

## 6. Truncation Declarativa

**Fase:** 3 (Limpieza)
**Esfuerzo:** 🟢 Bajo (0.5 días)
**Impacto:** 🔥 Bajo-Medio (eliminación de código manual)

### 6.1 Problema Actual

`chat_stream_handlers.ts` líneas 955-990: ~35 líneas de lógica manual para truncar el historial de chat:

```typescript
const maxChatTurns = isDeepContextEnabled ? 51 : (settings.maxChatTurnsInContext || MAX_CHAT_TURNS_IN_CONTEXT) + 1;
if (messageHistory.length > maxChatTurns * 2) {
  let recentMessages = messageHistory.filter(msg => msg.role !== "system").slice(-maxChatTurns * 2);
  if (recentMessages.length > 0 && recentMessages[0].role !== "user") {
    const firstUserIndex = recentMessages.findIndex(msg => msg.role === "user");
    if (firstUserIndex > 0) recentMessages = recentMessages.slice(firstUserIndex);
    else if (firstUserIndex === -1) recentMessages = [];
  }
  limitedMessageHistory = [...recentMessages];
}
```

Además, el dynamic token capping (líneas 1346-1371) hace estimación manual de tokens para no exceder el context window.

### 6.2 Solución Propuesta

Usar `truncation: "auto"` para delegar al provider:

```typescript
const streamResult = streamText({
  ...options,
  truncation: "auto", // El provider trunca inteligentemente
  // Mantener maxChatTurns como pre-filtro básico para no enviar demasiado
});
```

**NOTA:** No eliminar completamente la lógica de pre-filtro. La truncation del provider se aplica DESPUÉS de recibir los datos. Seguimos queriendo evitar enviar 200 mensajes si solo necesitamos 50. La truncation declarativa es una **red de seguridad**, no un reemplazo del pre-filtro.

### 6.3 Lo que SÍ se puede simplificar

- **Dynamic token capping** (líneas 1346-1371): Con `truncation: "auto"`, no necesitamos estimar tokens manualmente. El provider se encarga de no exceder el context window.
- **Lógica de "primer mensaje debe ser user"** (líneas 969-983): Esto es un workaround para providers que no aceptan assistant como primer mensaje. Con Open Responses, el provider maneja esto internamente.

### 6.4 Cambios Requeridos

| Archivo | Cambio |
|---|---|
| `src/ipc/handlers/chat_stream_handlers.ts` | Añadir `truncation: "auto"` a `streamText` calls |
| `src/ipc/handlers/chat_stream_handlers.ts` | Simplificar (no eliminar) lógica de pre-filtro de historial |
| `src/ipc/handlers/chat_stream_handlers.ts` | Eliminar o simplificar dynamic token capping si `truncation: "auto"` funciona |

### 6.5 Riesgos

- **Provider que no soporta `truncation`:** Si OpenRouter no lo pasa, mantenemos la lógica actual como fallback.
- **Truncación agresiva por el provider:** Podríamos perder contexto importante. Monitorear los logs de tokens después de implementar.

### 6.6 ¿Aprobado?

- [ ] Sí, implementar (con fallback a lógica actual)
- [ ] Sí, solo para dynamic token capping
- [ ] No, la lógica actual funciona suficientemente bien
- [ ] Posponer

---

## 7. Simplificación de `fallback_ai_model.ts`

**Fase:** 3 (Limpieza)
**Esfuerzo:** 🟡 Medio (1-2 días)
**Impacto:** 🔥 Medio (mantenibilidad)

### 7.1 Problema Actual

`fallback_ai_model.ts` (377 líneas) implementa su propia clasificación de errores:

```typescript
const RETRYABLE_STATUS_CODES = new Set([401, 403, 408, 409, 413, 429, 500, 502, 503, 504]);
const RETRYABLE_ERROR_MESSAGES = [
  "too many requests", "internal server error", "gateway timeout",
  "rate_limit", "wrong-key", "unexpected", "capacity", "timeout",
  "server_error", "econnrefused", "enotfound", "econnreset", "epipe", "etimedout"
];

function defaultShouldRetryThisError(error: any): boolean {
  // ~30 líneas de pattern matching sobre status codes y strings
}
```

Esto se duplica parcialmente con `retryWithRateLimit.ts` (otra implementación de retry).

### 7.2 Solución Propuesta

Si implementamos el punto 1 (Errores Estructurados), podemos simplificar drásticamente:

```typescript
function shouldRetry(error: StructuredError): boolean {
  return error.retryable;
}

function shouldSwitchModel(error: StructuredError): boolean {
  return error.type === "model_error" 
      || error.code === "model_not_found"
      || error.code === "context_length_exceeded";
}

function getRetryDelay(error: StructuredError, attempt: number): number {
  if (error.retryAfterMs) return error.retryAfterMs;
  return Math.min(1000 * Math.pow(2, attempt), 30000); // Exponential backoff, max 30s
}
```

**Esto reemplaza:** `defaultShouldRetryThisError` (30 líneas), `RETRYABLE_STATUS_CODES`, `RETRYABLE_ERROR_MESSAGES`, y la lógica duplicada en `retryWithRateLimit.ts`.

### 7.3 Cambios Requeridos

| Archivo | Cambio |
|---|---|
| `src/ipc/utils/fallback_ai_model.ts` | Reemplazar clasificación de errores manual con `StructuredError` |
| `src/ipc/utils/retryWithRateLimit.ts` | Unificar con la lógica de retry de `fallback_ai_model.ts` o al menos compartir `parseProviderError` |
| `src/ipc/utils/fallback_ai_model.ts` | Simplificar `createWrappedStream` usando la nueva clasificación |

### 7.4 Dependencia

> ⚠️ Este punto **depende** del Punto 1 (Errores Estructurados). Debe implementarse después.

### 7.5 ¿Aprobado?

- [ ] Sí, implementar después del Punto 1
- [ ] Sí, pero mantener `retryWithRateLimit.ts` separado
- [ ] No, la implementación actual funciona bien
- [ ] Posponer

---

## Resumen de Prioridades

| # | Mejora | Fase | Esfuerzo | Impacto | Dependencias |
|---|---|---|---|---|---|
| 1 | Errores Estructurados | 1 | 🟢 1d | 🔥🔥 | Ninguna |
| 2 | `previous_response_id` | 2 | 🟡 3-4d | 🔥🔥🔥 | Verificar OpenRouter |
| 3 | `tool_choice` / `allowed_tools` | 1 | 🟢 0.5d | 🔥🔥 | Ninguna |
| 4 | Recuperación de Stream | 2 | 🟡 2-3d | 🔥🔥 | Punto 1 |
| 5 | `service_tier` | 1 | 🟢 0.5d | 🔥 | Ninguna |
| 6 | Truncation Declarativa | 3 | 🟢 0.5d | 🔥 | Ninguna |
| 7 | Simplificar Fallback | 3 | 🟡 1-2d | 🔥 | Punto 1 |

**Orden de implementación recomendado:**

```
Fase 1 (paralelo):  [1] Errores Estructurados + [3] tool_choice + [5] service_tier
                                ↓
Fase 2:             [4] Recuperación de Stream + [2] previous_response_id
                                ↓
Fase 3:             [6] Truncation + [7] Simplificar Fallback
```

**Tiempo total estimado:** 8-11 días de desarrollo.

---

## Notas Adicionales

### Compatibilidad con AI SDK (Vercel)

La app usa el AI SDK de Vercel (`ai` package) con `streamText`. Algunos parámetros de Open Responses se pasan a través de `providerOptions`:

```typescript
streamText({
  // Parámetros nativos del AI SDK
  model, messages, tools, maxRetries, maxOutputTokens,
  // Parámetros extra via providerOptions
  providerOptions: {
    openrouter: {
      service_tier: "batch",
      truncation: "auto",
      previous_response_id: "resp_abc",
    }
  }
});
```

Verificar la documentación del AI SDK para confirar qué parámetros pasan transparentemente al provider.

### Testing

Cada punto debería incluir:
- Tests unitarios para `parseProviderError` (Punto 1)
- Test de integración para retry con error simulado (Punto 4)
- Test de carga comparativo pre/post para `previous_response_id` (Punto 2)
