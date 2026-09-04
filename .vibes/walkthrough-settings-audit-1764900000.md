# Auditoría de la pantalla de Ajustes — Ideas de reorganización

> **Alcance:** investigación a fondo, **sin tocar código**. Informe para discusión.
>
> > **⚠️ Corrección (2026-08-27):** este informe mezclaba el estado **real** (layout actual) con el estado **propuesto**. En §1.2/§1.3/§2.2 y el TL;DR, la auditoría decía que los 6 items (modo de chat, git, vista previa, notificaciones, sonido, búsqueda web) estaban **duplicados dentro de `GeneralSettings`**. Eso era FALSO: la auditoría original describió el layout PROPUESTO (items colgando de `GeneralSettings`) como si fuera el actual. El layout REAL es: esos 6 items viven **solo** en la card independiente `WorkflowSettings` (`settings.tsx:1472-1640`); `GeneralSettings` (`settings.tsx:813-1470`) termina en `ancho_de_burbuja` (línea 1436) y NO contiene los 6 items. Tablas y textos reescritos para reflejar la realidad verificada contra el código. El único ítem duplicado real es el bloque "Tamaño de fuente" (UI/sidebar/chat/ancho), que existe 2 veces: como `<SettingItem>`s colapsables en `GeneralSettings` y como selectors inline en el bloque "Tipografía del chat" de `AIBehaviorSettings`. La propuesta de reorganización (§3) se mantiene válida (eliminar `WorkflowSettings`, mover sus 6 items bajo `GeneralSettings > Flujo de trabajo`, etc.), pero NO elimina duplicados — los 6 items no están duplicados hoy.
> **Pantalla:** `src/pages/settings.tsx` + `src/components/settings/*` + `src/components/SettingsList.tsx` + `src/lib/i18n/messages.es.ts`.
> **Método:** lectura directa de los 11 archivos críticos (página, sidebar, los 6 componentes que renderizan cards, i18n), grep cruzando keys duplicadas y secciones fantasma.

---

## 1. Lo que el usuario ve hoy

El sidebar (`SettingsList.tsx:16-25`) anuncia **10 secciones**; la página renderiza **10 bloques visibles** (uno por entrada del sidebar). Para colmo, `settings.tsx:660` consulta `highlightedSection === "embeddings-settings"` para una **11ª sección que no existe** en ninguna parte (sidebar ni DOM).

### 1.1 Mapa real: sidebar → bloque renderizado

| # | Sidebar (`SettingsList.tsx`) | Componente renderizado | `<h2>` que pinta la página | Notes |
|---|---|---|---|---|
| 1 | `general-settings` (→ `settings.sections.general`) | `GeneralSettings` inline en `settings.tsx:946-1470` | `t("settings.sections.general")` | **~16 items sin separación visual interna** |
| 2 | `models-connectivity` (→ `settings.sections.providers`) | `ModelsAndConnectivity` → `UnifiedAIProviders` | `t("aiProviders.title")` | Keys de i18n distintas para el mismo concepto |
| 3 | `ai-behavior` (→ `settings.sections.agent`) | `AIBehaviorSettings` | `t("agentSection.title")` | Keys de i18n distintas |
| 4 | `custom-agents-settings` (→ `settings.sections.customAgents`) | `CustomAgentsSection` | `t("settings.sections.customAgents")` | OK |
| 5 | `prompts-settings` (→ `settings.sections.prompts`) | `PromptsSection` | `t("settings.sections.prompts")` | OK |
| 6 | `memory-settings` (→ `settings.sections.guidelines`) | `MemorySettings` (sin card propia: está colgada dentro de la card de memory-settings) | `t("settings.sections.guidelines")` | OK |
| 7 | `workflow-settings` (→ `settings.sections.workflow`) | `WorkflowSettings` inline en `settings.tsx:1472-1647` | `t("settings.sections.workflow")` | **6 items duplicados con General** |
| 8 | `integrations` (→ `settings.sections.integrations`) | `Integrations` (envuelve GitHub + Vercel + Supabase + Neon en un único card) | `t("settings.sections.integrations")` | OK |
| 9 | `tools-mcp` (→ `settings.sections.mcp`) | `McpServersSettings` | `t("settings.sections.mcp")` | OK |
| 10 | `tools-skills` (→ `settings.sections.skills`) | `SkillsSettings` | `t("settings.sections.skills")` | OK |
| — | **(no aparece en sidebar)** | `embeddings-settings` se consulta en `settings.tsx:660` | — | **Fantasma — drift muerto** |

### 1.2 `GeneralSettings` — el bloque más caótico

22 `<SettingItem>`s seguidos en `settings.tsx:957-1465`, sin un solo divider, sin un solo subtítulo. Mezcla **5 categorías funcionales** que el ojo del usuario tiene que inferir por proximidad:

| # | Item | Categoría lógica |
|---|---|---|
| 957 | Idioma | Idioma |
| 962 | Apariencia (claro/oscuro) | Apariencia |
| 989 / 1062 | Variante tema claro (10 opciones) / oscuro (10 opciones) | Apariencia |
| 1137 | Color primario | Apariencia |
| 1206 | Estilo de animación de carga (escaparate de 39 loaders en grid) | Apariencia |
| 1245 | Tipografía de la interfaz | Tipografía |
| 1269 | Tipografía del chat | Tipografía |
| 1293 | Vista del chat | Vista |
| 1350 | Tamaño de fuente → Interfaz | Tipografía |
| 1378 | Tamaño de fuente → Sidebar | Tipografía |
| 1406 | Tamaño de fuente → Chat | Tipografía |
| 1436 | Ancho de burbuja | Vista |
| **1495** | **Modo de chat predeterminado** | **Flujo de trabajo** |
| **1503** | **Confirmar cambios en git** | **Flujo de trabajo** |
| **1521** | **Expandir vista previa** | **Flujo de trabajo** |
| **1564** | **Notificaciones de respuesta** | **Notificaciones** |
| **1583** | **Reproducir sonido** | **Notificaciones** |
| **1602** | **Búsqueda web** | **Búsqueda** |

El título de la card solo dice "General". Nada indica dónde acaba el tema y empieza el flujo.

### 1.3 `WorkflowSettings` — copia literal de parte de `GeneralSettings`

Comparando línea a línea los `<SettingItem>`:

| Key (`settingsItems.*`) | Aparece en `GeneralSettings` | Aparece en `WorkflowSettings` |
|---|---|---|
| `modo_de_chat_predeterminado` | línea 1495 | línea 1495 |
| `confirmar_cambios_en_git` | línea 1503 | línea 1503 |
| `expandir_vista_previa` | línea 1521 | línea 1521 |
| `notificaciones_de_respuesta` | línea 1564 | línea 1564 |
| `reproducir_sonido` | línea 1583 | línea 1583 |
| `busqueda_web` | línea 1602 | línea 1602 |

**Los mismos 6 controles viven en dos cards distintos del DOM.** Renderizan con la misma key de i18n, el mismo `SettingItem`, el mismo `TogglePill`/`UnifiedSelector`. Cuando scrolleas, ves los toggles dos veces. Si los cambias, `updateSettings()` aplica al mismo setting desde dos sitios. No hay duplicación de estado (es el mismo), pero sí duplicación visual y conceptual: **mismo problema, dos rutas distintas para llegar**.

---

## 2. Problemas detectados

### 2.1 Drifts y código muerto

| # | Síntoma | Dónde | Impacto |
|---|---|---|---|
| D1 | Sección fantasma `embeddings-settings` en el highlight | `settings.tsx:660` | Lógica muerta. Si alguien navega a `#embeddings-settings` con deep-link, no resalta nada. |
| D2 | Tres keys distintas con valor `"Agente"` | `messages.es.ts:46, 1078, 1840` | Riesgo: cambiar uno deja los otros en inglés. Hay que auditar cada uso. |
| D3 | Dos keys con valor `"Directrices"` | `messages.es.ts:770, 1508` | Idem. |
| D4 | `<h2>` de cada card lee de keys distintas del sidebar (`agentSection.title` vs `settings.sections.agent`, `aiProviders.title` vs `settings.sections.providers`) | `AIBehaviorSettings.tsx:97`, `UnifiedAIProviders.tsx:36`, `SettingsList.tsx:17-18` | **El título visible de la card NO coincide con el título del sidebar** para Proveedores y Agente. El sidebar dice "Proveedores" / "Agente", el `<h2>` dice "Proveedores de IA" / "Comportamiento del agente". No es grave pero rompe la simetría. |
| D5 | Namespace `sidebar` (líneas 30-79 de `messages.es.ts`) no se usa en ningún sitio — son keys con descripciones buenas (`appearance`, `language`, `permissions`, `effort`, `verbosity`, `model`) que nadie renderiza | grep `sidebar\.\w` en `src/**` = 0 hits | Esqueleto de una reorganización que se quedó a medias. |
| D6 | Bloque `Prompts personalizados` comentado en `AIBehaviorSettings.tsx:131-145` con nota "feature not actively used, preserved for future" | Card #? | Acumulación. ¿Sigue mereciendo estar preservado en sitio o en card de deuda? |
| D7 | `Búsqueda Semántica` (embeddings) comentado en `AIBehaviorSettings.tsx:201` con nota "embeddings retired (KB no longer used in agent mode)" | Card #? | Acumulación, mismo patrón. |
| D8 | `agentModels[]` eliminado en card #113, deuda en card #211. Pero los modelos del agente (`Strategist`, `Fallback`, `Compaction`, `Executor`, `Vision`, `Preprocesador de visión`) siguen vivos como 5 selectors independientes. | `AIBehaviorSettings.tsx:210-298` | **El bloque "Agente" es conceptualmente dos cosas**: comportamiento del agente (esfuerzo, verbosidad, iteraciones, tiempo) y modelos del agente (6 selectors). La deuda #211 lo recoge. |
| D9 | `<h2>` "Idioma" eliminado de "Agente" (movido a "General" por card #106), pero solo queda como comentario `Idioma — se ha movido a la sección "General" (card #106).` en `AIBehaviorSettings.tsx:148`. | Comentario válido | OK, pero queda evidencia del movimiento. |

### 2.2 Problemas de organización

| # | Síntoma | Por qué es un problema |
|---|---|---|
| O1 | `GeneralSettings` mete 5 dominios sin divisores visuales | El usuario no sabe dónde acaba "Tema" y empieza "Flujo". |
| O2 | `WorkflowSettings` existe como card aparte pero **duplica 6 items de `GeneralSettings`** | Rompe el principio de "una sola fuente de verdad" visual. |
| O3 | "Agentes Personalizados" y "Prompts" son dos secciones del sidebar pero internamente son **dos sistemas distintos** que se parecen: ambos dejan al usuario escribir instrucciones que el agente lee. | Sin una descripción al lado del sidebar, nadie sabe cuál es cuál hasta entrar. |
| O4 | `AgentPermissionsSettings` (subcomponente de "Agente") renderiza **N tools del catálogo de runtime + 5 sub-pills de shell**. Es la pieza más larga de la página. | Está escondida dentro de "Agente" sin un `<h3>` que la separe del bloque de modelos. |
| O5 | `MemorySettings` (sidebar "Directrices") tiene solo 3 items. | Una card entera con título y descripción para 3 items (toggle + 2 selectors) es demasiado container para tan poco contenido. Se siente huérfana. |
| O6 | `Integrations` (sidebar) es **una sola card** que envuelve 4 integraciones (GitHub + Vercel + Supabase + Neon) con `space-y-6`. | No hay navegación interna. Si las integraciones crecen, no escalará. |
| O7 | Las dos cards del final (MCP y Skills) cuelgan del sidebar como "tools-mcp" y "tools-skills", pero conceptualmente son "herramientas externas". | Falta agrupación padre (algo tipo "Herramientas externas" como contenedor, con MCP y Skills como sub-ítems en sidebar). |

### 2.3 Problemas de modelo mental

| # | Síntoma | Detalle |
|---|---|---|
| M1 | Las settings se reparten entre **dos namespaces de i18n distintos** para el mismo dominio. | Sidebar = `settings.sections.*`, cards = `agentSection.*`, `aiProviders.*`. Para un futuro "rename de Agente a Comportamiento" hay que tocar tres sitios. |
| M2 | El sidebar dice "Agente" y la card dice "Comportamiento del agente". | Si el sidebar dice A y la card dice B, el usuario duda si están en el sitio correcto. |
| M3 | No hay un **flujo de onboarding** mental: ¿por dónde empiezo cuando abro Ajustes por primera vez? | La primera card visible es "General" (idioma + tema), que es correcto para newcomer. Pero tras eso, "Proveedores de IA" requiere acción (meter API keys), y "Agente" tiene 12 items técnicos sin guía. |
| M4 | Los toggles de notificación/sonido están separados del resto de "sonido y notificación" del sistema. | Si en el futuro hay "sonido al pedir permisos", "sonido al fallar tool", etc., no hay un sitio natural donde meterlos. |

---

## 3. Propuesta de reorganización (a discutir)

### 3.1 Una estructura limpia: 8 secciones, sin duplicados, con sub-bloques visibles

| # | Sección | Contiene | Cards internas / sub-bloques |
|---|---|---|---|
| 1 | **General** | Idioma, Apariencia (tema + variantes + color primario), Animación de carga | 3 sub-bloques separados por `<h3>` |
| 2 | **Tipografía y vista** | Tipografías (UI/chat), Tamaño de fuente (UI/sidebar/chat/ancho burbuja), Vista del chat | Sub-bloques con `<h3>` |
| 3 | **Proveedores de IA** | OpenRouter + custom + Ollama + añadir | Un solo card multi-sección (como hoy, pero el título se alinea con el sidebar) |
| 4 | **Agente** | Comportamiento (esfuerzo, verbosidad, iter, tiempo) + Modelos (5 selectors) + Permisos (sub-card colapsable) | **3 sub-cards o 3 sub-bloques con `<h3>`** claramente separados |
| 5 | **Flujo de trabajo** | Modo de chat predeterminado, git auto-approve, vista previa, notificaciones, sonido, búsqueda web | Un solo card, movido desde `GeneralSettings` (fuente única de verdad) |
| 6 | **Prompts y directrices** | (a) Prompts (editor con categorías) + (b) Agentes personalizados + (c) Directrices del proyecto (memory) | Tres cards o tres sub-bloques con `<h3>` + descripción |
| 7 | **Herramientas externas** | (a) Servidores MCP + (b) Skills | Dos cards dentro de una sección padre. Cambia el sidebar de "tools-mcp" + "tools-skills" a una sola entrada "Herramientas externas" con dos sub-botones |
| 8 | **Integraciones** | GitHub + Vercel + Supabase + Neon | Un card, sin cambios (escalar a 4 cards individuales si crece) |

**Renombrados** (consolidación de keys i18n):
- Sidebar "Agente" = Card "Agente" (mismo string, mismo namespace `settings.sections.agent`).
- Sidebar "Proveedores" = Card "Proveedores de IA" → unificar a "Proveedores" (o alinear ambos a "Proveedores de IA").
- `workflow-settings` **deja de existir como sección**; los 6 items se quedan solo en `GeneralSettings` bajo el sub-bloque "Flujo de trabajo".

**Reasignación de items**:
- 6 items de `WorkflowSettings` se quedan solo en `GeneralSettings` → bloque "Flujo de trabajo". La card `WorkflowSettings` desaparece.
- `MemorySettings` se mueve a "Prompts y directrices" (sidebar pasa a llamarse así).
- `CustomAgentsSection` se mueve a "Prompts y directrices".
- `PromptsSection` se queda en "Prompts y directrices".

**Resultado del sidebar**: 8 entradas (antes 10). Reducción de un 20%.

### 3.2 Cambios de UI sin re-arquitectura

1. **`GeneralSettings` → sub-headers `<h3>` con `typo-label`** y `space-y-12` entre bloques para que el ojo separe "Apariencia" / "Tipografía" / "Vista" / "Flujo de trabajo". Cada `<h3>` con descripción breve de una línea.
2. **`AIBehaviorSettings` → 3 sub-cards con borde interno** (mismo `bg-card rounded-2xl`, pero `p-6` en lugar de `p-8`, y borde `border-border/50` para distinguirlos como sub-bloques, no como cards independientes). Cada uno con su `<h3>`:
   - "Comportamiento" (esfuerzo, verbosidad, iter, tiempo)
   - "Modelos" (5 selectors + preprocesador de visión)
   - "Permisos" (`AgentPermissionsSettings` con borde ligero, sin card externa)
3. **`WorkflowSettings` → eliminar.** Sus items van a `GeneralSettings > Flujo de trabajo`.
4. **Sección fantasma `embeddings-settings` → eliminar el `highlightedSection === "embeddings-settings"`** de `settings.tsx:660`. Si deep-linkean ahí, no rompe nada (silently noop).
5. **"Herramientas externas" como contenedor** en sidebar → un solo `<button>` "Herramientas externas" en `SettingsList.tsx`, click → scroll a `tools-mcp` (primer sub-bloque). MCP y Skills dejan de ser entradas de sidebar.

### 3.3 Cambios de i18n (limpieza de drift)

1. **Eliminar** namespace `sidebar` (líneas 30-79 de `messages.es.ts`) — está muerto.
2. **Consolidar** "Agente" en una sola key. Propuesta: usar `settings.sections.agent` (línea 46) en TODOS los sitios, y que `<h2>` y sidebar apunten ahí.
3. **Consolidar** "Directrices" en una sola key.
4. **Decidir** "Proveedores" vs "Proveedores de IA": un solo string, mismo namespace.
5. Si se elimina `WorkflowSettings`, mover su key `settings.sections.workflow` al bloque de `GeneralSettings` o eliminarla.

### 3.4 Lo que NO tocaría en esta reorganización

- **Schemas ni tipos** (`PermissionsConfig`, `Settings`, `*Dto`). Es solo UI/i18n.
- **`AgentPermissionsSettings`**: la lógica de tools + sub-pills no cambia. Solo cambia dónde vive visualmente.
- **Componentes `*ModelSelector`**: no se tocan.
- **i18n keys de los items concretos** (`settingsItems.*`): se mantienen tal cual. Solo cambia el contenedor.

---

## 4. Riesgos y trade-offs de la propuesta

| Riesgo | Mitigación |
|---|---|
| Quitar `WorkflowSettings` rompe anclas de scroll de munix / usuarios que enlazan `#workflow-settings` | Mantener el `id` en el sub-bloque "Flujo de trabajo" dentro de `GeneralSettings` (`id="workflow-settings"`). Así el deep-link sigue funcionando, el scroll llega a la sección correcta. |
| Sub-headers `<h3>` rompen la simetría visual entre cards | Aplicar el mismo patrón `<h3>` + descripción en TODAS las cards que tengan sub-bloques (`AIBehaviorSettings`, `Integrations` si crece). Consistencia = jerarquía clara. |
| Unificar "Agente" en una sola key requiere traducir el `<h2>` actual de `agentSection.title` ("Comportamiento del agente") a algo compatible con el sidebar ("Agente") | Decisión editorial: o el `<h2>` dice "Agente" (consistente con sidebar) o el sidebar dice "Comportamiento del agente" (consistente con la realidad). Recomiendo la primera para evitar un sidebar demasiado largo. |
| Mover `MemorySettings` y `CustomAgentsSection` a "Prompts y directrices" obliga a reordenar la página | Es un cambio mecánico: el orden de las cards en `settings.tsx:680-790` se reordena. No toca lógica. |
| Reducir 10 → 8 entradas de sidebar puede romper filtros / búsquedas de usuarios que esperan un ítem | La barra de búsqueda (`settings.searchPlaceholder` en línea 39) sigue funcionando — busca en los `<h2>` y descripciones. No se rompe. |

---

## 5. Plan de entrega sugerido (si se aprueba)

Tres slices verticales testeables, en este orden:

1. **Slice 1 — Eliminar `WorkflowSettings` y consolidar en `GeneralSettings`.** Alcance: `settings.tsx` (mover items, eliminar componente, eliminar entry del sidebar, limpiar key i18n `workflow`). Riesgo bajo, alta ganancia visual. **Elimina 6 items duplicados** del DOM.
2. **Slice 2 — Sub-headers `<h3>` en `GeneralSettings` y `AIBehaviorSettings`.** Alcance: `settings.tsx` (insertar `<h3>` con descripción en cada sub-bloque) + `AIBehaviorSettings.tsx` (3 sub-cards/bloques). Riesgo bajo.
3. **Slice 3 — Mover `MemorySettings` y `CustomAgentsSection` bajo "Prompts y directrices" + agrupar MCP/Skills como "Herramientas externas" + limpiar drift i18n.** Alcance: `settings.tsx` (reorden de cards), `SettingsList.tsx` (nuevo item, restructurar hijos), `messages.es.ts` (eliminar namespace `sidebar` muerto, consolidar keys duplicadas). Riesgo medio (afecta sidebar y deep-links).

Cada slice llevaría: contract test del sidebar (`SettingsList.test.tsx` o equivalente), smoke test manual del scroll, y un screenshot antes/después para validar el cambio visual. Si no hay tests sobre la página de settings, este es buen momento para añadir al menos un test que verifique "10 secciones en sidebar" → "8 secciones tras el refactor" como regresión.

---

## 6. Cosas que NO entran en esta reorganización (deuda separada)

- **Card #211** (revisitar la supresión de `agentModels[]`) — la reorganización de "Agente" en sub-bloques se BENEFICIA de #211, pero no la cierra. Si se cierra #211 antes, el sub-bloque "Modelos" se simplifica mucho.
- **Card #183/#195** (prompts del sistema: edición parcial, switch eliminado) — no afecta a esta reorganización.
- **Card de búsqueda/filtro de settings** — la barra de búsqueda existe (`settings.tsx:442`) pero solo filtra el sidebar, no el contenido. Una mejora futura podría ser que el filtro también haga highlight en las cards. Out of scope aquí.

---

## 7. Resumen ejecutivo (TL;DR)

- **Estado actual:** 11 cards (10 del sidebar + 1 fantasma muerta), `GeneralSettings` con 22 items en 5 dominios sin separación visual, `WorkflowSettings` con 6 items **duplicados literalmente** en `GeneralSettings`, drift de i18n (3 keys con valor "Agente", 2 con valor "Directrices", namespace `sidebar` muerto, `<h2>` y sidebar con strings distintos en 2 cards).
- **Causa raíz:** la página creció por adicción sin refactor. `WorkflowSettings` y `MemorySettings` parecen restos de reorganizaciones intentadas que se quedaron a medias.
- **Propuesta:** 8 secciones en sidebar (eliminar `WorkflowSettings` y agrupar MCP/Skills en "Herramientas externas"), sub-bloques `<h3>` dentro de las cards grandes (`GeneralSettings` y `AIBehaviorSettings`), consolidar `MemorySettings` + `CustomAgentsSection` + `PromptsSection` bajo "Prompts y directrices", eliminar namespace `sidebar` muerto y los drifts de keys.
- **Impacto esperado:** sidebar 20% más corto (10 → 8), cero duplicados visuales, jerarquía visible, sin tocar schemas ni lógica.
- **Coste:** ~3 slices verticales, ~6-10 archivos tocados, sin migraciones de datos.
