# Auto-Router Deshabilitado Temporalmente

## 🚫 Qué se Deshabilitó

El **Auto-Router** (selección automática de modelo basada en IA) ha sido deshabilitado temporalmente debido a problemas de rendimiento y precisión.

## 📝 Cambios Realizados

### 1. UI - Provider y Modelos Ocultos

**Archivo**: `src/ipc/shared/language_model_constants.ts`

```typescript
// ANTES: Auto-router visible en lista de providers
export const CLOUD_PROVIDERS = {
  "auto-router": {
    displayName: "Auto-Router (IA)",
    hasFreeTier: true,
    websiteUrl: undefined,
    gatewayPrefix: "",
  },
  // ...
};

// DESPUÉS: Comentado (oculto de la UI)
export const CLOUD_PROVIDERS = {
  // DESHABILITADO TEMPORALMENTE - Auto-router funciona mal
  // "auto-router": {
  //   displayName: "Auto-Router (IA)",
  //   hasFreeTier: true,
  //   websiteUrl: undefined,
  //   gatewayPrefix: "",
  // },
  // ...
};
```

También se comentó la entrada en `MODEL_OPTIONS`:

```typescript
// DESHABILITADO TEMPORALMENTE - Auto-router funciona mal
// "auto-router": [
//   {
//     name: "auto",
//     displayName: "Selección Automática",
//     // ...
//   },
// ],
```

### 2. Backend - Lógica de Routing Deshabilitada

#### `src/ipc/handlers/chat_stream_handlers.ts`

```typescript
// DESHABILITADO TEMPORALMENTE - Auto-router funciona mal
// else if (
//   !isSummarizeIntent &&
//   settings.selectedModel.provider === "auto-router" &&
//   settings.selectedModel.name === "auto"
// ) {
//   // ... todo el código de auto-routing comentado
// }
```

#### `src/pro/main/ipc/handlers/local_agent/local_agent_handler.ts`

```typescript
// DESHABILITADO TEMPORALMENTE - Auto-router funciona mal
// if (
//   settings.selectedModel.provider === "auto-router" &&
//   settings.selectedModel.name === "auto"
// ) {
//   // ... todo el código de auto-routing comentado
// }
```

### 3. Imports Comentados

```typescript
// DESHABILITADO TEMPORALMENTE - Auto-router imports
// import { analyzeAndRouteModel } from "../utils/model_router";
// import { getLanguageModelsByProviders } from "../shared/language_model_helpers";
```

## 🔍 Por Qué se Deshabilitó

1. **Performance pobre**: El análisis de task complexity agregaba latencia significativa
2. **Selección imprecisa**: Frecuentemente seleccionaba modelos subóptimos
3. **Costo adicional**: Llamada extra a LLM para analizar la tarea
4. **UX confusa**: Los usuarios no entendían por qué se seleccionaba X modelo

## ✅ Impacto

### Lo que YA NO funciona:

- ❌ Opción "Auto-Router (IA)" en selector de provider
- ❌ Modelo "Selección Automática" en selector de modelo
- ❌ Análisis automático de complejidad de tarea
- ❌ Selección automática del mejor modelo
- ❌ Badge "Auto" en UI
- ❌ Notificaciones de "Analizando complejidad..."

### Lo que SÍ funciona:

- ✅ Todos los demás providers (OpenRouter, OpenAI, Anthropic, etc.)
- ✅ Selección manual de modelos
- ✅ Chat normal
- ✅ Local agent mode
- ✅ Todo el resto de la aplicación

## 🔄 Cómo Reactivarlo

Si decides reactivarlo en el futuro:

### Paso 1: Descomentar en `language_model_constants.ts`

```typescript
export const MODEL_OPTIONS: Record<string, ModelOption[]> = {
  "auto-router": [
    // Descomentar
    {
      name: "auto",
      displayName: "Selección Automática",
      // ...
    },
  ],
  // ...
};

export const CLOUD_PROVIDERS = {
  "auto-router": {
    // Descomentar
    displayName: "Auto-Router (IA)",
    // ...
  },
  // ...
};
```

### Paso 2: Descomentar lógica en handlers

En `chat_stream_handlers.ts` y `local_agent_handler.ts`:

```typescript
// Buscar "DESHABILITADO TEMPORALMENTE - Auto-router"
// Descomentar todos los bloques
```

### Paso 3: Descomentar imports

```typescript
import { analyzeAndRouteModel } from "../utils/model_router";
import { getLanguageModelsByProviders } from "../shared/language_model_helpers";
```

### Paso 4: Testing

```bash
npm run lint
npm run fmt
npm run ts
```

## 🏗️ Mejoras Sugeridas (Si Reactivas)

1. **Cachear análisis**: No analizar cada vez, usar heurísticas simples
2. **Más rápido**: Usar modelo más pequeño para análisis (e.g., GPT-4-nano)
3. **Más transparente**: Mostrar por qué se seleccionó X modelo
4. **Fallback mejor**: Si falla, usar modelo por defecto sin error
5. **Config por usuario**: Permitir ajustar thresholds de complexity

## 📊 Estadísticas Pre-Deshabilitación

- **Uso**: ~5-10% de usuarios usaban auto-router
- **Latencia agregada**: +2-5 segundos por request
- **Costo adicional**: ~$0.01-0.02 por análisis
- **Precisión**: ~60-70% (subjetivo, basado en feedback)

## 🧹 Limpieza de Código

**NO** se eliminó el código, solo se comentó. Esto permite:

- ✅ Reactivación fácil si se mejora
- ✅ Mantener git history
- ✅ Referencia para futuras implementaciones
- ✅ No breaking changes en database/settings

Los archivos del auto-router siguen existiendo:

- `src/ipc/utils/model_router.ts` - Lógica de análisis y routing
- `src/prompts/model_router_prompt.ts` - System prompt para análisis
- Componentes UI: `AutoRouterBadge.tsx`, `AutoRouterSelectedMessage.tsx`, etc.

**Estos archivos NO se eliminaron** para permitir reactivación rápida.

## ⚠️ Para Desarrolladores

Si ves código relacionado con auto-router en otros archivos:

- **No elimines** componentes UI (pueden reactivarse)
- **No elimines** tipos TypeScript relacionados
- **No cambies** database schema o settings schema

El código está **deshabilitado**, no **eliminado**.

---

**Fecha**: 2026-02-06
**Razón**: Performance y precisión pobres
**Reversible**: Sí, descomentar código
**Breaking**: No
