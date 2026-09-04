# Auditoría de la pantalla de Ajustes — Ideas de reorganización

> **Alcance:** investigación a fondo, **sin tocar código**. Informe para discusión.
>
> > **⚠️ Corrección (2026-08-27):** la versión original de esta auditoría describió el layout PROPUESTO (items de flujo colgando de `GeneralSettings`) como si fuera el actual. Error grueso. El layout REAL verificado contra el código es:
>
> - `GeneralSettings` (`settings.tsx:813-1470`) arranca en línea 946 con `<div id="general-settings">` y termina en `ancho_de_burbuja` (línea 1436). NO contiene los 6 items de flujo.
> - `WorkflowSettings` (`settings.tsx:1472-1647`) arranca inmediatamente después (`<div id="workflow-settings">`) y SÍ contiene los 6 items: modo de chat predeterminado (l. 1496), confirmar cambios en git (l. 1504), expandir vista previa (l. 1522), notificaciones de respuesta (l. 1565), reproducir sonido (l. 1584), búsqueda web (l. 1603).
>
> Confusión adicional que hubo que deshacer: el enunciado "desde modo de chat predeterminado en adelante está en una card llamada flujo de trabajo" es la **realidad del layout**. La auditoría previa los había sacado de `WorkflowSettings` para meterlos en `GeneralSettings` como si ya estuvieran allí — no es así. La **propuesta** sí los mueve a `GeneralSettings > Flujo de trabajo` (§3), pero el **estado actual** es que viven solo en `WorkflowSettings`. El único ítem duplicado real es el bloque "Tamaño de fuente" (UI/sidebar/chat/ancho), que existe 2 veces: como `<SettingItem>`s colapsables en `GeneralSettings` y como selectors inline en el bloque "Tipografía del chat" de `AIBehaviorSettings`.
> **Pantalla:** `src/pages/settings.tsx` + `src/components/settings/*` + `src/components/SettingsList.tsx` + `src/lib/i18n/messages.es.ts`.
> **Método:** lectura directa de los 11 archivos críticos (página, sidebar, los 6 componentes que renderizan cards, i18n), grep cruzando keys duplicadas y secciones fantasma.
>
> **Nota de revisión (2026-09-04):** verificado contra el código a petición de munix — desde "modo de chat predeterminado" en adelante SÍ está en una card independiente llamada "Flujo de trabajo" (`WorkflowSettings`, `settings.tsx:1472`, `id="workflow-settings"`). No cuelga de `GeneralSettings`. El §1.3 ya lo describe así; esta nota confirma que el layout del informe coincide con el DOM real.

---

## 1. Lo que el usuario ve hoy

El sidebar (`SettingsList.tsx:16-25`) anuncia **10 secciones**; la página renderiza **10 bloques visibles** (uno por entrada del sidebar). Para colmo, `settings.tsx:660` consulta `highlightedSection === "embeddings-settings"` para una **11ª sección que no existe** en ninguna parte (sidebar ni DOM).

### 1.1 Mapa real: sidebar → bloque renderizado

| # | Sidebar (`SettingsList.tsx`) | Componente renderizado | `<h2>` que pinta la página | Notes |
|---|---|---|---|---|
| 1 | `general-settings` (→ `settings.sections.general`) | `GeneralSettings` inline en `settings.tsx:946-1470` | `t("settings.sections.general")` | **~10 items sin separación visual interna** |
| 2 | `models-connectivity` (→ `settings.sections.providers`) | `ModelsAndConnectivity` → `UnifiedAIProviders` | `t("settings.sections.providers")` | Sidebar y `<h2>` leen la **misma** key (`settings.sections.providers` = "Proveedores de IA" en ambos diccionarios, `messages.es.ts:60`, `messages.en.ts:41`) |
| 3 | `ai-behavior` (→ `settings.sections.agent`) | `AIBehaviorSettings` | `t("agentSection.title")` | Sidebar y `<h2>` leen keys **distintas con el mismo valor** (`settings.sections.agent` vs `agentSection.title`, ambas "Agente" en es / "Agent" en en). Drift latente: si se cambia una sin la otra, divergen |
| 4 | `custom-agents-settings` (→ `settings.sections.customAgents`) | `CustomAgentsSection` | `t("settings.sections.customAgents")` | OK |
| 5 | `prompts-settings` (→ `settings.sections.prompts`) | `PromptsSection` | `t("settings.sections.prompts")` | OK |
| 6 | `memory-settings` (→ `settings.sections.guidelines`) | `MemorySettings` (sin card propia: está colgada dentro de la card de memory-settings) | `t("settings.sections.guidelines")` | OK |
| 7 | `workflow-settings` (→ `settings.sections.workflow`) | `WorkflowSettings` inline en `settings.tsx:1472-1647` | `t("settings.sections.workflow")` | Card independiente; los 6 items viven SOLO aquí, NO duplicados |
| 8 | `integrations` (→ `settings.sections.integrations`) | `Integrations` (envuelve GitHub + Vercel + Supabase + Neon en un único card) | `t("settings.sections.integrations")` | OK |
| 9 | `tools-mcp` (→ `settings.sections.mcp`) | `McpServersSettings` | `t("settings.sections.mcp")` | OK |
| 10 | `tools-skills` (→ `settings.sections.skills`) | `SkillsSettings` | `t("settings.sections.skills")` | OK |
| — | **(no aparece en sidebar)** | `embeddings-settings` se consulta en `settings.tsx:660` | — | **Fantasma — drift muerto** |

### 1.2 `GeneralSettings` — dominio único con 4 categorías visuales planas (sin sub-bloques)

`GeneralSettings` arranca en `settings.tsx:946` con `<div id="general-settings">` y termina en línea 1436 con el `SettingItem` de `ancho_de_burbuja`. NO contiene los 6 items de flujo/notificaciones/búsqueda — esos viven en `WorkflowSettings` (§1.3). Items reales:

| # | Item | Categoría lógica |
|---|---|---|
| 958 | Idioma | Idioma |
| 963 | Apariencia (claro/oscuro) | Apariencia |
| 990 / 1063 | Variante tema claro / oscuro | Apariencia |
| 1138 | Color primario | Apariencia |
| 1207 | Estilo de animación de carga (escaparate de 39 loaders en grid) | Apariencia |
| 1246 | Tipografía de la interfaz | Tipografía |
| 1270 | Tipografía del chat | Tipografía |
| 1294 | Vista del chat (Max/Flow/Zen) | Vista |
| 1330 | Tamaño de fuente — bloque colapsable con `<h3>` (Interfaz/Sidebar/Chat) | Tipografía |
| 1437 | Ancho de burbuja | Vista |

**Separación visual real:** el único sub-header `<h3 className="typo-label">` es "Tamaño de fuente" (líneas 1330-1358, colapsable con chevron). El resto — Apariencia → variantes de tema → color → loader → tipografías → vista — son `<SettingItem>` planos seguidos sin subtítulos ni divisores (los loaders van en un `<Dialog>` aparte, no inline). El ojo no distingue dónde acaba "Tema" y dónde empieza "Tipografía".

### 1.3 `WorkflowSettings` — card independiente (sin duplicados hoy)

`WorkflowSettings` (`settings.tsx:1472-1640`) es una **card independiente en el DOM** con su propio `<h2>` "Flujo de trabajo" (`settings.sections.workflow`), `<p>` de descripción (`workflowDesc`) y `id="workflow-settings"` — el mismo `id` que la entrada 7 del sidebar (`SettingsList.tsx:22`). Contiene 6 `<SettingItem>`s:

| # | Key (`settingsItems.*`) | Línea | Setting |
|---|---|---|---|
| 1 | `modo_de_chat_predeterminado` | 1496 | `DefaultChatModeSelector` |
| 2 | `confirmar_cambios_en_git` | 1504 | Toggle `autoApproveChanges` |
| 3 | `expandir_vista_previa` | 1522 | Toggle + pill derecha/izquierda (`vista_previa_posicion_*`) |
| 4 | `notificaciones_de_respuesta` | 1565 | Toggle `notifyOnResponse` |
| 5 | `reproducir_sonido` | 1584 | Toggle `enableNotificationSound` |
| 6 | `busqueda_web` | 1603 | Toggle `enableWebSearch` |

**Estos 6 items NO están duplicados:** `GeneralSettings` termina en `ancho_de_burbuja` (§1.2) y no los renderiza. Cada key `settingsItems.*` de la tabla aparece una sola vez en todo `src/` (los únicos otros hits son `DefaultChatModeSelector.tsx`, con las variantes `*Agent/Plan/Ask`). El grep original de la auditoría las contó dos veces porque sus líneas caían dentro del rango visual 940-1470 del *nuevo layout propuesto*, no del actual.

---

## 2. Problemas detectados

### 2.1 Drifts y código muerto

| # | Síntoma | Dónde | Impacto |
|---|---|---|---|
| D1 | Sección fantasma `embeddings-settings` en el highlight | `settings.tsx:660` | Lógica muerta. Si alguien navega a `#embeddings-settings` con deep-link, no resalta nada. |
| D2 | Nueve keys distintas con valor `"Agente"` | `messages.es.ts:46, 61, 412, 930*, 1047, 1078, 1088, 1409, 1840` (*`modo_de_chat_predeterminadoAgent`, namespace de chat-modes) | Riesgo bajo en la práctica: pertenecen a namespaces distintos (chat-modes, customAgents, prompts.scope, tabs…) y casi todas son correctas en contexto. Las únicas del dominio de la pantalla de Ajustes son `settings.agent` (l. 46, **muerta** — ver D5), `settings.sections.agent` (l. 61, sidebar) y `agentSection.title` (l. 1047, `<h2>`): dos keys vivas con el mismo valor (drift latente, no bug visible). |
| D3 | Tres keys con valor `"Directrices"` | `messages.es.ts:67 (`settings.sections.guidelines`, la que usa la card), 770 (`sidebar` muerto*), 1508 (workspace, contexto distinto)` | Riesgo bajo: `770` vive en el namespace `settings.sidebar` muerto (D5) y `1508` es del workspace (menú de otra pantalla). La corrección real es D5 (borrar el namespace muerto), no "consolidar Directrices". |
| D4 | `<h2>` de Agente lee de key distinta a la del sidebar (`agentSection.title` vs `settings.sections.agent`); Proveedores y General usan la **misma** key en ambos sitios | `AIBehaviorSettings.tsx:125`, `UnifiedAIProviders.tsx:45`, `SettingsList.tsx:17-18` | **Sin divergencia visible hoy:** ambos pares resuelven al mismo string ("Agente"/"Agent", "Proveedores de IA"/"AI Providers"). El riesgo es solo de drift futuro (cambiar una sin la otra). La versión anterior de esta fila afirmaba erróneamente que el sidebar decía "Proveedores"/"Agente" y el `<h2>` "Proveedores de IA"/"Comportamiento del agente" — **falso verificado**: el valor "Comportamiento del agente" vive en `settings.aiBehavior` (l. 47), que **nadie renderiza** (D5), y el `<h2>` de Agente dice "Agente" (`agentSection.title`, l. 1047). |
| D5 | Namespace `settings.*` plano (líneas 39-57 de `messages.es.ts`: `general`, `appearance`, `theme`, `language`, `agent`, `aiBehavior`, `permissions`, `effort`, `verbosity`, `model` + descripciones) sin ningún `t("settings.<plana>")` en `src/` — 0 hits | `messages.es.ts:39-57`; verificado con grep `t\("settings\.` en `src/`: solo aparecen `settings.title`, `settings.search*`, `settings.sections.*` y keys de providers/modelos | Esqueleto de una reorganización que se quedó a medias. Las descripciones (`aiBehaviorDescription: "Esfuerzo, verbosidad y modelos"`, etc.) son reutilizables para los futuros sub-`<h3>`. Nota: la versión anterior de esta fila hablaba de un namespace `sidebar` en "líneas 30-79" — **inexistente**; el namespace real es `settings.*` plano en líneas 39-57. |
| D6 | Bloque `Prompts personalizados` comentado en `AIBehaviorSettings.tsx:131-145` con nota "feature not actively used, preserved for future" | Card #? | Acumulación. ¿Sigue mereciendo estar preservado en sitio o en card de deuda? |
| D7 | `Búsqueda Semántica` (embeddings) comentado en `AIBehaviorSettings.tsx:201` con nota "embeddings retired (KB no longer used in agent mode)" | Card #? | Acumulación, mismo patrón. |
| D8 | `agentModels[]` eliminado en card #113, deuda en card #211. Pero los modelos del agente (`Strategist`, `Fallback`, `Compaction`, `Executor`, `Vision`, `Preprocesador de visión`) siguen vivos como 5 selectors independientes. | `AIBehaviorSettings.tsx:210-298` | **El bloque "Agente" es conceptualmente dos cosas**: comportamiento del agente (esfuerzo, verbosidad, iteraciones, tiempo) y modelos del agente (6 selectors). La deuda #211 lo recoge. |
| D9 | `<h2>` "Idioma" eliminado de "Agente" (movido a "General" por card #106), pero solo queda como comentario `Idioma — se ha movido a la sección "General" (card #106).` en `AIBehaviorSettings.tsx:148`. | Comentario válido | OK, pero queda evidencia del movimiento. |

### 2.2 Problemas de organización

| # | Síntoma | Por qué es un problema |
|---|---|---|
| O1 | `GeneralSettings` mete 4 dominios sin divisores visuales | El usuario no sabe dónde acaba "Tema" y empieza "Tipografía". |
| O2 | `WorkflowSettings` existe como card aparte y los 6 items viven **solo** en ella (sin duplicar en `GeneralSettings`), pero conceptualmente son del mismo dominio ("General > Flujo de trabajo") | Hoy NO hay duplicado visual; sí hay fragmentación del dominio "General" en dos cards sin justificación funcional. La propuesta §3 los consolida. |
| O3 | "Agentes Personalizados" y "Prompts" son dos secciones del sidebar pero internamente son **dos sistemas distintos** que se parecen: ambos dejan al usuario escribir instrucciones que el agente lee. | Sin una descripción al lado del sidebar, nadie sabe cuál es cuál hasta entrar. |
| O4 | `AgentPermissionsSettings` (subcomponente de "Agente") renderiza **N tools del catálogo de runtime + 5 sub-pills de shell**. Es la pieza más larga de la página. | Está escondida dentro de "Agente" sin un `<h3>` que la separe del bloque de modelos. |
| O5 | `MemorySettings` (sidebar "Directrices") tiene solo 3 items. | Una card entera con título y descripción para 3 items (toggle + 2 selectors) es demasiado container para tan poco contenido. Se siente huérfana. |
| O6 | `Integrations` (sidebar) es **una sola card** que envuelve 4 integraciones (GitHub + Vercel + Supabase + Neon) con `space-y-6`. | No hay navegación interna. Si las integraciones crecen, no escalará. |
| O7 | Las dos cards del final (MCP y Skills) cuelgan del sidebar como "tools-mcp" y "tools-skills", pero conceptualmente son "herramientas externas". | Falta agrupación padre (algo tipo "Herramientas externas" como contenedor, con MCP y Skills como sub-ítems en sidebar). |

### 2.3 Problemas de modelo mental

| # | Síntoma | Detalle |
|---|---|---|
| M1 | Las settings de Agente se reparten entre **dos namespaces de i18n distintos** para el mismo dominio. | Sidebar = `settings.sections.agent`, `<h2>` = `agentSection.title` (mismo valor hoy, drift latente). Proveedores y el resto de cards ya usan `settings.sections.*` en ambos sitios. Para un futuro rename hay que tocar dos sitios solo en Agente. |
| M2 | ~~El sidebar dice "Agente" y la card dice "Comportamiento del agente"~~ — **falso verificado, tachado 2026-08-28**: ambos dicen "Agente". La confusión venía de `settings.aiBehavior` ("Comportamiento del agente"), key muerta que nadie renderiza (D5). No hay problema de modelo mental aquí; el riesgo real es O3 (Agentes Personalizados vs Prompts se parecen) y M3 (falta de onboarding). | — |
| M3 | No hay un **flujo de onboarding** mental: ¿por dónde empiezo cuando abro Ajustes por primera vez? | La primera card visible es "General" (idioma + tema), que es correcto para newcomer. Pero tras eso, "Proveedores de IA" requiere acción (meter API keys), y "Agente" tiene 12 items técnicos sin guía. |
| M4 | Los toggles de notificación/sonido están separados del resto de "sonido y notificación" del sistema. | Si en el futuro hay "sonido al pedir permisos", "sonido al fallar tool", etc., no hay un sitio natural donde meterlos. |

---

## 3. Propuesta de reorganización (a discutir)

### 3.1 Una estructura limpia: 8 secciones, sin duplicados, con sub-bloques visibles

| # | Sección | Contiene | Cards internas / sub-bloques |
|---|---|---|---|
| 1 | **General** | Idioma, Apariencia (tema + variantes + color primario), Animación de carga | 3 sub-bloques separados por `<h3>` |
| 2 | **Tipografía y vista** | Tipografías (UI/chat), Tamaño de fuente (UI/sidebar/chat/ancho burbuja), Vista del chat | Sub-bloques con `<h3>` |
| 3 | **Proveedores de IA** | OpenRouter + custom + Ollama + añadir | Un solo card multi-sección, sin cambios (sidebar y `<h2>` ya comparten key y string) |
| 4 | **Agente** | Comportamiento (esfuerzo, verbosidad, iter, tiempo) + Modelos (5 selectors) + Permisos (sub-card colapsable) | **3 sub-cards o 3 sub-bloques con `<h3>`** claramente separados |
| 5 | **Flujo de trabajo** | Modo de chat predeterminado, git auto-approve, vista previa, notificaciones, sonido, búsqueda web | Hoy: card independiente `WorkflowSettings` (fuente única real, sin duplicados). Propuesta: mover los 6 items a `GeneralSettings > Flujo de trabajo` como sub-bloque con `id="workflow-settings"` y eliminar el componente `WorkflowSettings` |
| 6 | **Prompts y directrices** | (a) Prompts (editor con categorías) + (b) Agentes personalizados + (c) Directrices del proyecto (memory) | Tres cards o tres sub-bloques con `<h3>` + descripción |
| 7 | **Herramientas externas** | (a) Servidores MCP + (b) Skills | Dos cards dentro de una sección padre. Cambia el sidebar de "tools-mcp" + "tools-skills" a una sola entrada "Herramientas externas" con dos sub-botones |
| 8 | **Integraciones** | GitHub + Vercel + Supabase + Neon | Un card, sin cambios (escalar a 4 cards individuales si crece) |

**Renombrados** (consolidación de keys i18n):
- Agente: `<h2>` (`agentSection.title`) y sidebar (`settings.sections.agent`) ya muestran el mismo string ("Agente"/"Agent"); la consolidación propuesta es que ambos lean la **misma key** (`settings.sections.agent`) para eliminar el drift latente, no para cambiar ningún texto visible.
- Proveedores: sidebar y `<h2>` ya leen la misma key (`settings.sections.providers` = "Proveedores de IA"/"AI Providers"). Sin cambio visible propuesto; solo documentado para que no se reintroduzca la divergencia.
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

1. **Eliminar** el namespace muerto `settings.*` plano (líneas 39-57 de `messages.es.ts`) — ninguna key se renderiza (verificado: 0 hits de `t("settings.<plana>")` en `src/`). Ojo: las descripciones (`aiBehaviorDescription`, `permissionsDescription`, `effortDescription`…) son buenas y pueden reaprovecharse como textos de los futuros sub-`<h3>` antes de borrarlas.
2. **Consolidar** "Agente": que el `<h2>` lea `settings.sections.agent` (la key del sidebar) en vez de `agentSection.title`. Sin cambio visible (mismo string), solo se elimina el drift.
3. **Nada que consolidar en "Directrices"**: la única key viva del dominio Ajustes es `settings.sections.guidelines`; las otras dos ("Directrices") son del namespace muerto (se va con el punto 1) y del workspace (contexto distinto, no tocar).
4. **Nada que decidir en "Proveedores"**: sidebar y `<h2>` ya comparten key y string. No tocar.
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
| Unificar "Agente" en una sola key (el `<h2>` pasaría de `agentSection.title` a `settings.sections.agent`) | Sin cambio visible (mismo string "Agente"); solo se elimina el drift. Decisión trivial, sin riesgo editorial. |
| Mover `MemorySettings` y `CustomAgentsSection` a "Prompts y directrices" obliga a reordenar la página | Es un cambio mecánico: el orden de las cards en `settings.tsx:680-790` se reordena. No toca lógica. |
| Reducir 10 → 8 entradas de sidebar puede romper filtros / búsquedas de usuarios que esperan un ítem | La barra de búsqueda (`settings.searchPlaceholder` en línea 39) sigue funcionando — busca en los `<h2>` y descripciones. No se rompe. |

---

## 5. Plan de entrega sugerido (si se aprueba)

Tres slices verticales testeables, en este orden:

1. **Slice 1 — Eliminar `WorkflowSettings` y consolidar en `GeneralSettings`.** Alcance: `settings.tsx` (mover items, eliminar componente, eliminar entry del sidebar, limpiar key i18n `workflow`). Riesgo bajo, alta ganancia visual. **Mueve 6 items (no duplicados) del DOM** de una card propia al sub-bloque "Flujo de trabajo" dentro de General.
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

- **Estado actual:** 10 cards visibles (una por entrada del sidebar; no hay "11ª card": `embeddings-settings` es solo una condición muerta en el highlight de `settings.tsx:660`, sin div ni sidebar), `GeneralSettings` con ~10 items reales en 4 categorías planas (Idioma/Apariencia/Tipografía/Vista), `WorkflowSettings` con 6 items propios (Modo de chat predeterminado, git auto-approve, vista previa, notificaciones, sonido, búsqueda web) — **sin duplicar en `GeneralSettings` (conjuntos disjuntos, cero duplicados visuales en toda la pantalla)**. Drift de i18n solo latente: `<h2>` de Agente y sidebar leen keys distintas con el mismo valor ("Agente"); Proveedores y el resto ya comparten key. Namespace muerto: `settings.*` plano (l. 39-57, incluye el "Comportamiento del agente" que nadie renderiza).
- **Causa raíz:** la página creció por adicción sin refactor. `WorkflowSettings` y `MemorySettings` parecen restos de reorganizaciones intentadas que se quedaron a medias.
- **Propuesta:** 8 secciones en sidebar (eliminar `WorkflowSettings` y agrupar MCP/Skills en "Herramientas externas"), sub-bloques `<h3>` dentro de las cards grandes (`GeneralSettings` y `AIBehaviorSettings`), consolidar `MemorySettings` + `CustomAgentsSection` + `PromptsSection` bajo "Prompts y directrices", eliminar namespace `sidebar` muerto y los drifts de keys.
- **Impacto esperado:** sidebar 20% más corto (10 → 8), cero duplicados visuales, jerarquía visible, sin tocar schemas ni lógica.
- **Coste:** ~3 slices verticales, ~6-10 archivos tocados, sin migraciones de datos.
