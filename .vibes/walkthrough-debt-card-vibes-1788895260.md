# Change Summary: Card "Deuda" como card principal en Proveedores de IA

## Qué se ha hecho (para el usuario)

En Ajustes → **Proveedores de IA**, las opciones aparcadas de OpenRouter (mostrar gasto, modelo personalizado, modelos habilitados y playground) ya **no** cuelgan de un desplegable dentro de OpenRouter: ahora viven en una **card principal "Deuda"**, sin colapsible, al mismo nivel que el resto de cards de la sección, con cada opción como una fila funcional (mantienen su comportamiento original).

## Detalles técnicos

### Archivos

| Archivo | Cambio |
|---|---|
| `src/components/settings/providers/ProvidersDebtSection.tsx` | **Nuevo.** Card principal "Deuda" (título literal, sin diccionario, como pediste) con 4 filas: toggle "Mostrar gasto en chats" (`showCostDisplay`), "Modelo personalizado" (abre `CreateCustomModelDialog`), "Modelos habilitados" (acordeón interno con `ModelsSection` + botón Añadir) y "Playground" (abre ventana de playground). Es el código de las filas originales del antiguo `OpenRouterProviderSection`, extraído tal cual. |
| `src/components/settings/UnifiedAIProviders.tsx` | Importa y renderiza `<ProvidersDebtSection />` después de `AddCustomProviderButton`. |
| `src/components/settings/providers/OpenRouterProviderSection.tsx` | Eliminado el `DropdownMenu` "Deuda" y sus imports (`ChevronDown`, dropdown-menu). El docstring apunta a `ProvidersDebtSection`. |
| `src/lib/i18n/messages.es.ts` / `messages.en.ts` | Borrada la key `aiProviders.debt` (ya no se usaba). |

### Notas

- El título "Deuda" está hardcodeado a propósito (instrucción explícita: "sin diccionarios ni mierdas").
- Los textos de las filas sí usan las keys i18n existentes (`aiProviders.costDisplay`, `openRouter.customModel`, etc.), que ya estaban en ambos diccionarios.

## Verificación

- `pnpm ts:main` → **0 errores** (esta vez limpio completo, sin el fallo ajeno anterior de `FlowActivityStream`).
- `vitest run` (CustomProviderSection.test.ts + i18n/index.test.ts) → **26 tests en verde** (incluye paridad es/en de diccionarios, que valida que quitar `debt` no rompe nada).
