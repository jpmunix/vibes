- Nueva capacidad del agente de trabajar con el reposition git. Opciones status, diff, diff_file, log, show_commit, current_branch, list_branches, commit, create_branch, checkout, stash_save, stash_pop, stash_list, revert_file
- Búsqueda semántica avanzada para identificar patrones en el código y enviar el contexto más relevante al modelo de LLM. Del mismo modo, se ha mejorado la precisión la base de conocimientos utilizando el mismo patrón de semántica.
- Se ha intentado mitigar el problema en el que el usuario escribe un prompt y la IA en vez de ejecutar la acción completa el mensaje del usuario.

**feat: add semantic search settings and caching support for embeddings**
- Introduced "Búsqueda Semántica" settings for enabling AI-powered contextual search using vector embeddings.
- Added support for selecting and configuring embedding models in a dedicated settings UI.
- Implemented a new `EmbeddingsCache` table for storing vector embeddings indexed by file, debate, or message.
- Updated handlers to fetch the initial prompt for a selected app and cache embeddings for semantic ranking.
- Enabled semantic re-ranking of search results combining keyword and similarity scores.
- Enhanced fallback logic to ensure the `EmbeddingsCache` table and migrations are created if missing during initialization.
  **feat: update UI styles and implement anti-continuation for user messages**
- Adjusted `h-screenish` and container height styles for improved layout consistency across components.
- Updated input styles in settings to remove shadow effects for a cleaner appearance.
- Implemented anti-continuation logic to wrap the last user message (`<user_request>` tags) in `local_agent_handler` and `chat_stream_handlers` to prevent the model from continuing user text.


## 🔥 Novedades v5.0 ~ Beta 1

El rediseño completo de la experiencia de chat y la arquitectura de ventanas dedicadas marca un nuevo hito en rendimiento y usabilidad.

### 🎨 Rediseño Completo del Chat

*   **Nueva Interfaz de Chat**: Rediseño integral de la interfaz de chat con detección inteligente de errores, insignias de error mejoradas y disposición optimizada de mensajes para mayor claridad y legibilidad.
*   **Gestión de Estado Simplificada**: Eliminación de la lógica global de colapsar/expandir mensajes, simplificando la gestión de estado interna del componente `ChatMessage` para un rendimiento más fluido.
*   **Ventanas de Chat Dedicadas**: Migración de la funcionalidad de chat a ventanas independientes con aislamiento de rendimiento, mejorando la velocidad de la interfaz principal y eliminando interferencias entre componentes.
*   **Estilos Optimizados**: Eliminación de estilos innecesarios para un renderizado de la UI más limpio y rápido.

### 🧠 Agente Inteligente & IA

*   **Esfuerzo de Razonamiento Configurable**: Nuevo selector `ReasoningEffortSelector` con niveles granulares (none, minimal, low, medium, high, xhigh) para modelos que soportan razonamiento, permitiendo ajuste fino de precisión en tareas complejas.
*   **Modelos por Defecto Actualizados**: Actualización de los modelos por defecto a OpenAI `gpt-4.1-nano` y `gpt-5.1-codex-mini` en todos los selectores y componentes.
*   **Selector Dinámico de Modelos OpenRouter**: Los modelos preexistentes se pueden activar/desactivar desde los ajustes y añadir nuevos mediante un buscador de OpenRouter.
*   **Información de Modelos Enriquecida**: La modal de información de un modelo muestra costes, parámetros de entrada y salida soportados.
*   **Visibilidad de API Keys**: Función para visualizar/ocultar las API keys de OpenRouter directamente desde los ajustes.


### 🚀 Rendimiento y Arquitectura

*   **Eliminación de Extensiones Innecesarias**: Limpieza de dependencias para reducir la superficie del proyecto.
*   **Core Rescrito**: Reescritura completa del núcleo de la aplicación para mejorar resiliencia, robustez y rendimiento general.

---

## 🔥 Novedades v4.0 ~ Beta 5

Enfoque en la mejora del flujo de creación de aplicaciones, la optimización del rendimiento de compilación y nuevas capacidades de búsqueda y reemplazo.

### 🚀 Flujo de Trabajo y Productividad

*   **Mejoras en Creación de Apps**: Fases de carga animadas con actualizaciones dinámicas, saneamiento mejorado de títulos y nombres de aplicaciones, y caché de `node_modules` reutilizable para inicializaciones más rápidas.
*   **Búsqueda/Reemplazo Avanzado**: Estrategias de recuperación mejoradas para el flujo de búsqueda y reemplazo con mejor manejo de errores y retroalimentación de éxito.
*   **Componente VibesOutput Extendido**: Mayor contexto y retroalimentación en el flujo de trabajo de búsqueda y reemplazo.
*   **Mejoras en Tareas**: Refinamientos en la funcionalidad de gestión de tareas y Kanban.

### 🛠 Herramientas Git

*   **Modo Commit Silencioso**: Funcionalidad de commit mejorada con modo silencioso y lógica de auto-reintento para mayor fiabilidad.
*   **Inicialización Git Mejorada**: Manejo inteligente de archivos lock obsoletos para prevenir bloqueos en operaciones Git.
*   **Permisos de Binarios Linux**: Corrección de permisos en binarios Git para Linux y configuración automática de MCP.

### 🎨 Interfaz de Usuario

*   **Sidebar Responsiva**: Mejora en la responsividad del sidebar con manejo condicional de colapsar/expandir según el contexto.
*   **Optimización de Embeddings**: Generación de embeddings optimizada con logging mejorado para mayor responsividad de la UI.
*   **Caché de Ajustes**: Sistema de caché para ajustes, mejora de logs de consola y UI de auto-reparación perfeccionada.

### 📦 Distribución

*   **Empaquetado .deb Automatizado**: Scripts de empaquetado automático `.deb` con subida a NAS para distribuciones Linux.
*   **Minificación de Build**: Build de producción con minificación habilitada y dependencias actualizadas.

---

## 🔥 Novedades v3.6

Ciclo de mejoras incrementales enfocado en la robustez de plantillas, optimización de empaquetado y refinamientos de la interfaz.

### 🚀 Mejoras Destacadas

*   **Plantillas Mejoradas**: Sustitución de wildcards en templates por valores específicos de cada aplicación, mejorando la personalización del scaffolding.
*   **Optimización de Empaquetado**: Exclusión de archivos redundantes `date-fns/fp` para optimizar el empaquetado y prevenir errores `ENOTEMPTY`.
*   **Consistencia de Estilos**: Actualización de rutas de importación de hojas de estilo a `globals.css` para mayor coherencia en todo el proyecto.

---

## 🔥 Novedades v3.5

### 🚀 Flujo de Trabajo y Productividad

*   **Generación de Dossier Avanzada**: Generación de dossiers completos con copia automática a la cuenta de Vibes del usuario logueado.
*   **Modo Planificación**: Nueva funcionalidad `usePlanSync` que permite organizar y estructurar proyectos, con soporte para múltiples chats, recuperación de planes y cambio automático de modo de chat según ajustes predeterminados.
*   **Gestión de Dossiers Consolidada**: Fusión de la lógica de dossier en `BackupModal` y limpieza de `ActionHeader` para un flujo más limpio.

---

## 🔥 Novedades v3.4

### 🧠 Agente Inteligente & IA

*   **Nuevos Modelos de Lenguaje**: Incorporación de modelos de IA adicionales, incluyendo Grok 4.1 Fast con contexto de 2M tokens, optimizados para tareas de programación y edición de código.

### ✏️ Editor Visual

*   **Edición Directa por IA**: Integración del prompt `quick_edit_system` para modificar textos, iconos, colores y tamaños directamente desde la interfaz del navegador, sin necesidad de editar código manualmente.
*   **Herramientas de Anotación Mejoradas**: Nuevas herramientas de dibujo (rectángulos), funcionalidades extendidas del toolbar y mejoras en la precisión del annotator.

### 🚀 Flujo de Trabajo

*   **Exportación e Importación de Ajustes**: Reestructuración completa del layout de ajustes con funcionalidad de exportación/importación en formato JSON.
*   **Gestión de Cuenta de Usuario**: Incorporación de gestión de cuenta directamente desde el `ActionHeader`.

---

## 🔥 Novedades v3.3

### 🛠 Herramientas

*   **Visor de Supabase**: Nuevo visor de base de datos para Supabase, con visualización de tablas, valores y gestión de registros (añadir/eliminar) directamente desde la aplicación.
*   **Herramientas Git Avanzadas**:
    *   **GitPanel**: Nuevo panel Git con staging/unstaging de archivos individuales.
    *   **Resolución de Conflictos**: Herramientas integradas de resolución de conflictos y gestión de merges.
    *   **Avisos Inteligentes**: Alertas ante fallos comunes con herramientas para eliminar locks, abortar merges y rebases.
*   **Capturas de Pantalla Mejoradas**:
    *   **Dibujo de Rectángulos**: Nueva herramienta de dibujo de rectángulos en el annotator.
    *   **Estabilidad**: Mejoras en estabilidad y precisión de las herramientas de captura.

### 💬 Chat

*   **Bloques de Respuesta Colapsables**: Colapsar/expandir respuestas del asistente para facilitar la navegación en conversaciones largas.
*   **Función Undo Mejorada**: Recuperación de prompts y assets tras deshacer acciones dentro del flujo del chat.
*   **Preview de Adjuntos**: Previsualización de adjuntos en el chat para una referencia visual inmediata.

### 🧠 Sistema de Conocimiento

*   **Refactor del Sistema de Conocimiento**: Filtrado de ruido, deduplicación semántica y decaimiento de confianza para el contexto aprendido automáticamente.
*   **Migración a Modal**: Panel de conocimiento migrado a modal y mejorado con extracción automática por IA.

### 🎨 Interfaz

*   **Eliminación de Apps**: Funcionalidad de eliminación de aplicaciones con garantía de integridad del esquema de base de datos.
*   **Consistencia Visual**: Actualización de estilos de items de aplicación para mayor coherencia visual.
*   **Mejoras en ActionHeader**: Simplificación de la lógica del header y mejor agrupación de menús.

---

## 🔥 Novedades v3.2

### 🚀 Rendimiento y Arquitectura

*   **Carga Lazy de Rutas**: Rutas de temas, hub y biblioteca cargadas de forma lazy para mejorar el tiempo de carga inicial.
*   **React Lazy Loading**: Implementación de lazy loading a nivel de React, optimización del manejo de streaming y mejora del chunking de build.
*   **Mejoras en File Watcher**: Optimización del watcher de archivos y lógica de escaneo para mayor eficiencia, especialmente en macOS.

### 🛠 Herramientas

*   **Terminal de Consola**: Nueva terminal de consola integrada para las aplicaciones, con exportación de logs.
*   **Componente ModelItemContent**: Nuevo componente reutilizable para la información de modelos, integrado en todos los selectores.

---

## 🔥 Novedades v3.1

### 🚀 Mejoras Destacadas

*   **Capturas de Pantalla Nativas**: Soporte nativo de capturas de pantalla con logging de metadatos mejorado.
*   **Seguimiento de Reintentos**: Contador de reintentos para ediciones de archivos visible en la UI para mayor transparencia.
*   **Persistencia de Ventanas**: Estado de ventanas persistente entre sesiones y mayor seguridad en operaciones de archivo.
*   **Más Backups en la Nube**: Límite de retención de backups aumentado a 10 copias en Firebase.

### 📊 Logging y Métricas

*   **Logging Unificado de Consultas IA**: Sistema unificado de logging para consultas IA con métricas detalladas de uso de tokens.
*   **Estadísticas de Tokens**: Archivo `token-stats.jsonl` para tracking de utilización de tokens con metadatos de modelo, chat y timestamps.

---

## 🔥 Novedades v3.0

La versión 3.0 introduce los sistemas fundamentales de conocimiento automático, auto-reparación y backups que transforman la experiencia de desarrollo.

### 🧠 Sistema de Conocimiento Automático

*   **Base de Conocimiento**: Nuevo sistema de auto-aprendizaje que extrae conocimiento del contexto del proyecto y lo inyecta automáticamente en las interacciones con la IA.
*   **Extracción en Background**: Tarea de extracción de conocimiento en segundo plano sin interrumpir el flujo de trabajo.
*   **Panel de Conocimiento**: Componentes `KnowledgeBasePanel` y `KnowledgeModelSelector` para gestionar y configurar los modelos de extracción.

### 🔧 Auto-Reparación

*   **Reparación Automática de Errores**: Sistema de detección y reparación automática de errores en tiempo de ejecución durante el desarrollo.
*   **Inicio Silencioso**: Hook `useSilentAppStart` para arranque silencioso de servidores Vite con detección de errores y preparación de HMR.
*   **Notificaciones de Progreso**: Notificaciones toast para el progreso y resultados de la reparación automática.

### 💾 Sistema de Backups

*   **Backups Integrales**: Sistema completo de gestión de backups con rotación, restauración desde la nube y compresión gzip.
*   **Modal de Backup**: Componente dedicado con pestañas para creación y gestión de backups.
*   **Backup API de SQLite**: Proceso de backup mejorado usando la API de backup de SQLite para garantizar integridad.
*   **Programación Automática**: Hook `useBackupScheduler` para backups periódicos en segundo plano.

### 👤 Autenticación de Usuarios

*   **Login y Registro**: Autenticación con Firebase incluyendo login, registro y logout.
*   **Gestión de Perfil**: Modal de perfil para gestionar nombre, foto y contraseña.
*   **Estado Global**: Átomos Jotai (`userAtom`, `authLoadingAtom`) para estado de autenticación global.

### 💬 Chat Mejorado

*   **Modo Agente Local**: Modo de chat por defecto actualizado a "local-agent" con UI mejorada.
*   **Búsqueda Web Enriquecida**: Resultados de búsqueda web ahora incluyen secciones "People Also Ask" con preguntas, snippets y enlaces relacionados.
*   **Botón de Reinicio**: Nuevo botón "Restart" en acciones del chat para mayor usabilidad.

### ✅ Tareas y Kanban

*   **Subtareas (Checklists)**: Soporte completo de subtareas con añadir, editar, eliminar, reordenar y marcar como completadas.
*   **Smart Import**: Importación inteligente que detecta y adjunta subtareas automáticamente.
*   **Resúmenes de Desarrollo**: Resúmenes automáticos al completar tareas Kanban, con indicador de notas generadas por bot.
*   **Barras de Progreso**: Visualización de progreso de checklists con barras y drag-and-drop para reordenar.

### 🔑 Multi-Key y Costes

*   **Gestión Multi-API-Key**: Soporte para múltiples API keys de OpenRouter con seguimiento detallado de créditos y uso.

---

#### ✨ ¡Disfruta las vibraciones de esta nueva actualización! ✨
