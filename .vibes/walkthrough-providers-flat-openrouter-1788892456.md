# Change Summary: Proveedores de IA al mismo nivel (OpenRouter sin sub-elementos, opciones aparcadas en "Deuda")

## Qué se ha hecho (para el usuario)

En Ajustes → **Proveedores de IA**, OpenRouter ahora se muestra **en el mismo nivel y con el mismo formato** que los proveedores custom y Ollama:

- **Una única API key** (campo de texto + botón Guardar), sin gestión de múltiples claves, sin aliases, sin selector de clave activa.
- **Sin sub-elementos**: se han quitado del cuerpo de la sección "Mostrar gasto en chats", "Modelo personalizado", "Modelos habilitados" y "Playground".
- Esas cuatro opciones ahora viven en un **desplegable "Deuda (opciones aparcadas)"** en el mismo sitio: las cuatro entradas aparecen deshabilitadas (solo visibles, no accionables) hasta replantear el diseño de la sección.
- El toggle Activado/Desactivado y el botón de eliminar proveedor se mantienen como estaban.

## Detalles técnicos

### Archivos modificados

| Archivo | Cambio |
|---|---|
| `src/components/settings/providers/OpenRouterProviderSection.tsx` | **Reescrito** (~450 → ~250 líneas). Quitados: multi-key (añadir/eliminar/selección de claves, dialogs), toggle de gasto, botón de modelo personalizado (`CreateCustomModelDialog`), acordeón de `ModelsSection`, entrada de Playground. Añadidos: campo único de API key con estado "dirty" (botón Guardar activo solo si cambió), y desplegable DropdownMenu "Deuda" con 4 items `disabled`. El subtítulo del header pasa de "N claves" a la clave enmascarada (`sk-or...abcd`) o "Sin configurar". |
| `src/components/settings/providers/CustomProviderSection.test.ts` | Caso de test "OpenRouter con keys" → "OpenRouter con apiKey" (ahora usa el campo `apiKey`, que ya estaba contemplado en `isLastConfiguredProvider`). |
| `src/components/onboarding/OpenRouterSetupWizard.tsx` | Guarda la clave del wizard con `openrouter: { apiKey: { value } }` en vez del formato multi-key. |
| `src/components/onboarding/SetupWizard.tsx` | Igual que arriba (el wizard también tenía su propio guard de OpenRouter). |
| `src/lib/i18n/messages.es.ts` / `messages.en.ts` | Nueva keys en ambos diccionarios: `openRouter.apiKey` ("API Key") y `aiProviders.debt` ("Deuda (opciones aparcadas)" / "Debt (shelved options)"). |

### Decisiones de datos

- **Modelo de clave única:** se usa `providerSettings.openrouter.apiKey` (era el campo "legacy/fallback" del schema y es el que tiene **precedencia 1** en `model_resolver.ts` y `get_model_client.ts`), por lo que no se tocó ningún código de resolución de claves — los resolvers siguen funcionando exactamente igual.
- **Migración en caliente:** al montar la sección, si existen claves en el formato antiguo `keys[]/selectedKeyId` (y no hay `apiKey`), se migra en un solo `updateSettings` a `apiKey` (la clave seleccionada, o la primera si no había selección) y se limpia `keys`/`selectedKeyId`. El guard de "último provider configurado" ya reconocía `apiKey` desde antes.
- **Opciones aparcadas:** los 4 items del desplegable Deuda son `disabled` (se ven, no se ejecutan). El state de `showCostDisplay` y el resto de datos no se tocan — solo se ocultó la UI, listo para replantear.

### Lo que NO se ha tocado

- `UnifiedAIProviders.tsx` (OpenRouter sigue apareciendo solo si tiene clave configurada).
- Resolvers de clave (`model_resolver.ts`, `get_model_client.ts`), schema de settings, `ProviderHeader`, Ollama y Custom providers.

## Verificación

- `pnpm ts:main` → **0 errores en los archivos de este cambio** (quedan 5 errores pre-existentes en `src/components/chat/FlowActivityStream.tsx` — `Cannot find name 'collapsed'` — de otro trabajo ajeno ya en el working tree, no tocado en esta tarea).
- `vitest run` sobre `CustomProviderSection.test.ts` + `src/lib/i18n/index.test.ts` (incluye el test de paridad de keys es/en) → **26 tests en verde**.

## Consideraciones / próximos pasos

- **Card de Deuda pendiente:** cuando decidas replantear la sección, la "deuda" son esas 4 opciones: mostrar gasto, modelo personalizado, modelos habilitados y playground (todo del antiguo OpenRouterProviderSection, que estaba probado y se puede recuperar del git history).
- El multi-key de OpenRouter queda **muerto en la UI** pero el código de resolvers lo soporta aún (por compatibilidad con settings antiguas que no hayan pasado por la migración).
