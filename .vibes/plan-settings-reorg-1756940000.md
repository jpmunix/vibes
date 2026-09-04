# Blueprint de Ejecución — Reorganización layout Ajustes (a pelo, sin Trello)

> Fuente verificada en código (no en memoria): `src/pages/settings.tsx` (1665 líneas), `src/components/SettingsList.tsx`, `src/components/settings/AIBehaviorSettings.tsx`, `src/lib/i18n/settingsSearch.ts`, `src/lib/i18n/messages.es.ts`, `src/lib/i18n/messages.en.ts`.
> Decisión de usuario: trabajo a pelo (sin card). Agrupar entries 4+5+6 en "Prompts y directrices". Borrar componente + entry sidebar de WorkflowSettings.

## 1. Análisis de Impacto

### 1.1 Archivos a modificar (rutas exactas)

- [ ] `src/pages/settings.tsx` — contiene `GeneralSettings` (línea 813), bloque de render principal (líneas 640-790 aprox.), `WorkflowSettings` (líneas 1472-1635 aprox.), `LoaderShowcaseGrid` (después, no tocar).
- [ ] `src/components/SettingsList.tsx` — constante `SETTINGS_SECTIONS` (líneas 14-25). Pasar de 10 a 9 entries (o a 7 si se aplica agrupación 4+5+6, ver §4).
- [ ] `src/components/settings/AIBehaviorSettings.tsx` — lista plana de `SettingRow` + bloque `<div id="agent-permissions">`. Añadir sub-bloques h3.
- [ ] `src/lib/i18n/settingsSearch.ts` — 6 entries con `sectionId: "workflow-settings"` deben pasar a `"general-settings"`.
- [ ] `src/lib/i18n/messages.es.ts` — namespace `settings.sections` (líneas 58-75 aprox.). Reutilizar `workflow: "Flujo de trabajo"` como título de sub-bloque h3. Eliminar o no `workflow`/`workflowDesc` según Slice.
- [ ] `src/lib/i18n/messages.en.ts` — espejo de lo anterior (`workflow: "Workflow Settings"`).

### 1.2 Archivos a consultar antes de tocar (solo lectura)

- [ ] `src/lib/i18n/settingsSearch.test.ts` — contiene lista de sectionIds esperados (líneas 14-15 aprox.). Si se cambia `settingsSearch.ts`, este test obliga a actualizar expectativa.
- [ ] `src/atoms/viewAtoms.ts` — línea 10 aprox. contiene `"general-settings"` en unión de tipos. Verificar si contiene `"workflow-settings"` o `"embeddings-settings"` y actualizar tipo si existe.
- [ ] `src/components/settings/PromptsSection.tsx` — verificar dónde viven "prompts base" vs "system prompts adicionales" antes de agrupar sidebar (no asumir).
- [ ] `src/components/settings/CustomAgentsSection.tsx` — verificar si la entry `custom-agents-settings` entra o no en la fusión "Prompts y directrices".

### 1.3 Archivos a NO tocar

- [ ] `src/components/settings/McpServersSettings.tsx`, `SkillsSettings.tsx` — fuera de scope.
- [ ] `src/components/settings/ModelsAndConnectivity.tsx`, `ModelsSection.tsx` — fuera de scope.
- [ ] Ningún fichero de `vibes-core` (P1 runtime ↔ carcasa).

## 2. Dependencias e Imports

- [ ] No añadir librerías nuevas. No añadir dependencias de `package.json`.
- [ ] En `src/pages/settings.tsx`, el ejecutor debe reutilizar los imports ya existentes: `SettingItem`, `TogglePill`, `DefaultChatModeSelector`, `UnifiedSelector`, `cn`, `useSettings`, `useI18n`. No inventar imports nuevos.
- [ ] Al mover los 6 items de `WorkflowSettings` a `GeneralSettings`, verificar que cada `control` usado (`DefaultChatModeSelector`, `TogglePill`) ya está importado en la cabecera de `settings.tsx`. Si falta alguno, el ejecutor lo añade copiando la línea de import exacta que ya usa `WorkflowSettings` (mismo archivo, no hay que adivinar ruta).
- [ ] En `AIBehaviorSettings.tsx`, reutilizar `SettingRow` existente. No crear un `SettingItem` nuevo ni duplicar estilos.

## 3. Mapa real verificado (corrige al walkthrough)

```mermaid
flowchart TB
  Sidebar[SettingsList.tsx<br/>SETTINGS_SECTIONS 10 entries] --> R1[general-settings<br/>GeneralSettings l.813]
  Sidebar --> R2[models-connectivity]
  Sidebar --> R3[ai-behavior<br/>AIBehaviorSettings.tsx]
  Sidebar --> R4[custom-agents-settings]
  Sidebar --> R5[prompts-settings]
  Sidebar --> R6[memory-settings<br/>h2 = guidelines Directrices]
  Sidebar --> R7[workflow-settings<br/>WorkflowSettings l.1472<br/>6 items - A ELIMINAR]
  Sidebar --> R8[integrations]
  Sidebar --> R9[tools-mcp]
  Sidebar --> R10[tools-skills]
  R7 -. mover 6 items .-> R1
  R4 + R5 + R6 -. fusionar .-> R456[Prompts y directrices<br/>1 entry sidebar]
  Ghost[embeddings-settings<br/>solo l.660 isHighlighted<br/>sin div, sin sidebar] -. borrar referencia .-> R3
```

- [ ] Hechos en piedra: `WorkflowSettings` y `GeneralSettings` NO son ficheros separados. Viven en `src/pages/settings.tsx`. El plan opera sobre un solo fichero de 1665 líneas.
- [ ] Hecho en piedra: el sidebar real tiene 10 entries (líneas 14-25 de `SettingsList.tsx`), no las del walkthrough.
- [ ] Hecho en piedra: `embeddings-settings` es código muerto. Una sola aparición en `settings.tsx` línea 660 dentro de la prop `isHighlighted` de `<AIBehaviorSettings>`. No hay `<div id="embeddings-settings">`, no hay entry en sidebar, no hay entry en search index.
- [ ] Hecho en piedra: label i18n real es `workflow: "Flujo de trabajo"` (es) / `"Workflow Settings"` (en). El walkthrough decía "Configuración del flujo de trabajo": ignorar, usar el valor del diccionario.

## 4. Paso a Paso Granular (por archivo)

### Slice 0 — Pre-requisito: fijar alcance de fusión 4+5+6 (solo lectura, sin código)

- [ ] Abrir `src/components/settings/PromptsSection.tsx` y anotar: ¿dónde se renderizan "prompts base" y "system prompts adicionales"? ¿Son dos componentes, dos pestañas, o dos categorías del mismo listado? Anotar nombres exactos de componentes/variables.
- [ ] Abrir `src/components/settings/CustomAgentsSection.tsx` (cabecera, primeras 60 líneas) y anotar: ¿la entry `custom-agents-settings` es "prompts" a efectos de la fusión, o es gestión de agentes y queda fuera?
- [ ] Decisión resultante que el ejecutor debe dejar escrita como comentario en el plan antes de tocar sidebar:
  - Opción A: fusionar `custom-agents-settings` + `prompts-settings` + `memory-settings` en una sola entry sidebar.
  - Opción B: fusionar solo `prompts-settings` + `memory-settings`, dejar `custom-agents-settings` fuera.
- [ ] No avanzar a Slice 3 sin esta nota. Es la única ambigüedad real que queda.

### Slice 1 — Vaciar y borrar `WorkflowSettings` hacia `GeneralSettings`

Archivo: `src/pages/settings.tsx`.

- [ ] Paso 1. Localizar función `export function WorkflowSettings` (línea 1472 aprox.) y listar sus 6 bloques `SettingItem` en orden:
  1. variable lógica `modo_chat_predeterminado`, control `DefaultChatModeSelector`.
  2. variable lógica `confirmar_cambios_git`, control `TogglePill` sobre `settings.autoApproveChanges`.
  3. variable lógica `expandir_vista_previa`, control segmentado de 3 botones (`off` / `right` / `left`) sobre `settings.autoExpandPreviewPanel` + `settings.previewPosition`.
  4. variable lógica `notificaciones_respuesta`, control `TogglePill` sobre `settings.enableChatCompletionNotifications`.
  5. variable lógica `reproducir_sonido`, control `TogglePill` sobre `settings.enableNotificationSound` (ojo: lógica invertida, `!== false`).
  6. variable lógica `busqueda_web`, control `TogglePill` sobre `settings.enableWebSearch` (lógica `!== false`).
- [ ] Paso 2. Localizar el final de `export function GeneralSettings` (el `return` que cierra con `</div></div></div>` justo antes de línea 1472). Identificar el último bloque hijo dentro de `<div className="space-y-4">`: es el bloque colapsable de font-scale (`fontScaleExpanded`).
- [ ] Paso 3. Después del bloque colapsable de font-scale y ANTES de los cierres `</div>` de `GeneralSettings`, insertar nuevo sub-bloque con esta estructura lógica (pseudocódigo, no código final):
  1. Crear contenedor `div` con clase de separación vertical amplia (misma que usa `WorkflowSettings`: contenedor exterior `space-y-12` + interior `space-y-4`; copiar clases literales del bloque origen).
  2. Crear encabezado `h3` cuyo texto es `t("settings.sections.workflow")`. No hardcodear "Flujo de trabajo".
  3. Pegar dentro, en el mismo orden 1-6, los 6 `SettingItem` movidos sin alterar ni `label`, ni `description`, ni `control`, ni `onClick`.
- [ ] Paso 4. En la zona de render principal (líneas 744-748 aprox.), localizar el bloque `<DeferredSection><WorkflowSettings isHighlighted={...} /></DeferredSection>` y eliminarlo completo.
- [ ] Paso 5. Eliminar la definición `export function WorkflowSettings` completa (desde su línea `export` hasta su `}` de cierre, justo antes del comentario de `LoaderShowcaseGrid`). No dejar la función vacía: borrarla entera.
- [ ] Paso 6. Verificar que no queda ninguna referencia a `WorkflowSettings` en el fichero (búsqueda literal). Solo debe quedar el key i18n `settings.sections.workflow` usado por el nuevo h3.

### Slice 2 — Sub-headers h3 en `GeneralSettings` y `AIBehaviorSettings`

- [ ] Archivo `src/pages/settings.tsx`, dentro de `GeneralSettings`:
  1. El sub-bloque "Flujo de trabajo" creado en Slice 1 YA es el h3 requerido. No duplicarlo.
  2. NO añadir h3 a apariencia/tema/fuentes en esta slice (fuera del alcance confirmado).
- [ ] Archivo `src/components/settings/AIBehaviorSettings.tsx`:
  1. Localizar `<div className="space-y-4">` que envuelve la lista de `SettingRow`.
  2. Insertar 3 encabezados `h3` (texto vía `t()`, nunca hardcodeado; si no existe key, reutilizar keys existentes de `agentSection.*` o `settingsItems.*`, no inventar keys nuevas sin añadirlas a ambos diccionarios):
     - h3 "Comportamiento" antes del primer `SettingRow` de esfuerzo de razonamiento. Agrupa: esfuerzo razonamiento, verbosidad, max iteraciones, tiempo máximo tarea.
     - h3 "Modelos" antes del `SettingRow` de modelo estratega. Agrupa: estratega, respaldo, compactación, rondas conservadas, ejecutor, preprocesador visión + modelo visión condicional.
     - h3 "Permisos" antes de `<div id="agent-permissions">`.
  3. Respetar el bloque condicional del modelo de visión (`settings.visionPreprocessorEnabled !== false`): debe quedar DENTRO del grupo "Modelos", justo después del preprocesador.
  4. Respetar comentarios existentes (`#165`, `#215`, bloques hidden comentados). No borrarlos.

### Slice 3 — Sidebar: 10 → 9 (y luego fusión 4+5+6)

- [ ] Archivo `src/components/SettingsList.tsx`, constante `SETTINGS_SECTIONS`:
  1. Eliminar la línea `{ id: "workflow-settings", labelKey: "settings.sections.workflow" }`.
  2. No reordenar las restantes en esta slice.
- [ ] Fusión "Prompts y directrices" (depende de Slice 0):
  1. Si Opción A: dejar una sola entry que apunte al primer `id` superviviente del grupo y eliminar las otras dos del array. Anotar qué `id` se conserva (el ejecutor debe elegir el que ya exista como `<div id="...">` en `settings.tsx` para no romper scroll-spy).
  2. Si Opción B: idem pero solo con dos entries.
  3. En ambos casos, el contenido renderizado en `settings.tsx` (los `<div id="custom-agents-settings">`, `<div id="prompts-settings">`, `<div id="memory-settings">`) NO se elimina en esta slice: solo se oculta del sidebar. Mover divs es otra slice futura.
- [ ] Verificar `src/atoms/viewAtoms.ts`: si el tipo unión incluye `"workflow-settings"`, eliminarlo. Si incluye `"embeddings-settings"`, eliminarlo también.

### Slice 4 — Limpieza `embeddings-settings` + search index + i18n

- [ ] Archivo `src/pages/settings.tsx`, líneas 658-662 aprox. (props de `<AIBehaviorSettings>`):
  1. Reducir la expresión `isHighlighted={highlightedSection === "ai-behavior" || highlightedSection === "embeddings-settings"}` a solo la primera condición.
- [ ] Archivo `src/lib/i18n/settingsSearch.ts`:
  1. Localizar las 6 entries con `sectionId: "workflow-settings"` (ids lógicos: `chat-mode`, `auto-approve`, `auto-expand-preview`, `chat-completion-notification`, `notification-sound`, `web-search`).
  2. Cambiar en cada una `sectionId` a `"general-settings"`.
  3. Cambiar en cada una `sectionKey` de `"workflow"` a `"general"` SOLO si el namespace `search.sections.general` existe en ambos diccionarios; si no, mantener `sectionKey: "workflow"` (el `sectionKey` es etiqueta visible, el `sectionId` es navegación; lo crítico es el `sectionId`).
- [ ] Archivos `messages.es.ts` / `messages.en.ts`:
  1. NO borrar `sections.workflow` / `sections.workflowDesc` en esta slice: el nuevo h3 de Slice 1 los sigue usando. Borrarlos rompería el h3.
  2. Solo si el sidebar deja de referenciar `settings.sections.workflow` como `labelKey` (Slice 3), la key pasa a ser "título de sub-bloque". Dejarla viva.

## 5. Manejo de Errores y Casos Límite (obligatorio para el ejecutor)

- [ ] Early return: si `settings` es `null`/`undefined` al mover los 6 items, los controles deben comportarse igual que hoy (los `TogglePill` usan `!!settings?.x` o `!== false`). No cambiar ni una condición.
- [ ] Lógica invertida: `reproducir_sonido` y `busqueda_web` usan `!== false` (defecto true). Al mover, copiar el bloque entero; no "simplificar" a `!!`.
- [ ] `expandir_vista_previa`: son 3 botones con estado derivado (`autoExpandPreviewPanel` + `previewPosition ?? "right"`). Mover el bloque entero con su `.map`. No reescribir.
- [ ] Scroll-spy: `SettingsList.tsx` calcula la sección activa por `document.getElementById(section.id)`. Cada `id` restante en `SETTINGS_SECTIONS` debe seguir existiendo como `<div id="...">` en `settings.tsx`. Tras borrar `workflow-settings`, verificar que no queda ningún `id` huérfano en el array.
- [ ] Búsqueda: tras cambiar `sectionId` en `settingsSearch.ts`, el highlight de resultados (`highlightedSection`) debe apuntar a un `id` existente. Probar búsqueda de "sonido", "vista previa", "modo chat" y confirmar que el highlight cae en `general-settings`.
- [ ] Tests: `settingsSearch.test.ts` lista sectionIds esperados. Actualizar la expectativa que contenga `"workflow-settings"` si existe. No comentar el test.
- [ ] Typecheck real: ejecutar `pnpm ts:main` y leer el output completo (nunca `npx tsc --noEmit` contra el solution file, nunca truncar con `head`). Cero errores antes de dar por hecha la slice.
- [ ] i18n: todo texto visible nuevo (los 3 h3 de AIBehaviorSettings) vía `t()`. Si se crea una key nueva, crearla en AMBOS diccionarios (es + en). Criterio de aceptación innegociable.

## 6. Nomenclatura exacta

- [ ] No renombrar componentes. `GeneralSettings`, `AIBehaviorSettings`, `SettingItem`, `SettingRow`, `TogglePill`, `DefaultChatModeSelector` conservan su nombre.
- [ ] No renombrar settings persistidas: `autoApproveChanges`, `autoExpandPreviewPanel`, `previewPosition`, `enableChatCompletionNotifications`, `enableNotificationSound`, `enableWebSearch`. Son contrato con el store.
- [ ] No renombrar `id` de divs supervivientes: `general-settings`, `ai-behavior`, `custom-agents-settings`, `prompts-settings`, `memory-settings`, `integrations`, `tools-mcp`, `tools-skills`, `models-connectivity`, `agent-permissions`.
- [ ] Key i18n del sub-bloque: `settings.sections.workflow` (existente). No crear `settings.sections.flujoTrabajo` ni similar.
- [ ] Id eliminado: `workflow-settings`. Tras la slice, cero apariciones en `src/` salvo histórico en tests si se documenta.

## 7. Criterio de aceptación (verificación manual)

- [ ] Ajustes abre sin errores de consola por keys i18n faltantes.
- [ ] Sidebar muestra 9 entries (o 7 si se aplicó fusión), sin "Flujo de trabajo" como entry.
- [ ] Dentro de "General", al final, sub-bloque "Flujo de trabajo" con los 6 items funcionales (toggles persisten tras recargar).
- [ ] "Agente" muestra 3 sub-grupos (Comportamiento / Modelos / Permisos).
- [ ] Buscar "sonido" lleva a General y resalta General.
- [ ] `pnpm ts:main` en verde. Suite de tests tocada en verde.
