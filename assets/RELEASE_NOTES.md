### 🧠 Agente & IA

*   **Herramientas Unificadas**: `file_editor` fusiona `write_file`, `edit_file`, `search_replace` y `patch_file` en una sola herramienta basada en acciones. `explore_codebase` consolida `read_file`, `list_files`, `grep` y `code_search` en una única interfaz de exploración.
*   **Edición por Parches**: Herramienta `patch_file` con edición precisa basada en líneas y componente visual integrado para revisar los cambios aplicados.
*   **Diálogo con el Usuario**: Herramienta `ask_user` que permite al agente solicitar información durante la ejecución, con persistencia de mensajes de error para depuración.
*   **Resiliencia Mejorada**: Lógica de fallback y manejo de errores reforzado en la ejecución de herramientas para mayor robustez ante fallos inesperados.
*   **Búsqueda Semántica Avanzada**: Contexto inteligente mediante embeddings vectoriales con re-ranking híbrido (keywords + similitud vectorial) para enviar al modelo solo lo más relevante.
*   **Base de Conocimientos Inteligente**: Filtrado semántico, deduplicación y decaimiento de confianza para inyectar solo las reglas y convenciones más relevantes al prompt actual.
*   **Caché de Embeddings SQLite**: Persistencia eficiente de vectores con invalidación inteligente mediante hashes SHA-256 de contenido.
*   **Esfuerzo de Razonamiento Configurable**: Selector de niveles de razonamiento (none, low, medium, high) para modelos compatibles.
*   **Selector Dinámico OpenRouter**: Activar/desactivar modelos y añadir nuevos mediante un buscador integrado.
*   **Mitigación de Continuación IA**: Lógica anti-continuación envolviendo prompts en tags `<user_request>`, evitando que la IA prediga o complete el texto del usuario.
*   **Agente Autosuficiente**: La nueva arquitectura de herramientas unificadas y gestión de errores nativa hace innecesaria la auto-reparación externa.
*   **Un Solo Modo, Cero Confusión**: Todos los flujos convergen en el modo "Agente", eliminando la complejidad del antiguo modo "build".

### ⚙️ Gestión de Procesos

*   **Procesos en Segundo Plano**: Herramientas `start_process`, `stop_process` y `list_processes` para gestionar servidores y servicios de larga duración desde el agente.
*   **Ejecución de Comandos**: Herramienta `run_command` para ejecutar comandos seguros en primer plano con restricciones de seguridad integradas.
*   **Detección de Disponibilidad**: Herramienta `wait_for_http` para esperar la disponibilidad de servicios mediante comprobaciones HTTP, regex o puerto, con timeouts configurables.
*   **ProcessManager**: Singleton centralizado para controlar, monitorizar y detener procesos en ejecución con detección inteligente de estado.

### 🔀 Git

*   **Agente con Superpoderes Git**: Interacción íntegra con el repositorio: `status`, `diff`, `log`, `show_commit`, `commit`, `checkout`, `branching`, `stash` y `revert`.
*   **Ventana de Git Dedicada**: Visor Git independiente con navegación por commits, diffs visuales y sincronización automática del tema.
*   **GitPanel**: Panel Git con staging/unstaging de archivos individuales, resolución de conflictos y gestión de merges.
*   **Avisos Inteligentes**: Alertas ante fallos comunes con herramientas para eliminar locks, abortar merges y rebases.
*   **Modo Commit Silencioso**: Funcionalidad de commit con modo silencioso y lógica de auto-reintento para mayor fiabilidad.

### 🎨 Interfaz & UX

*   **Rediseño Completo de Ajustes**: Todas las secciones comparten el mismo patrón visual: filas con título, descripción y control (pills, toggles, selectores). Prompts, Modelos y Permisos se agrupan con cabeceras colapsables.
*   **Permisos por Herramienta**: Cada herramienta del agente tiene un selector de tres niveles (Nunca / Preguntar / Siempre) con pills visuales.
*   **Integraciones Normalizadas**: GitHub, Vercel, Supabase y Neon con diseño uniforme.
*   **Rediseño Integral del Chat**: UI de chat optimizada para legibilidad con insignias de estado mejoradas y manejo de errores nativo.
*   **Ventanas de Chat Dedicadas**: La lógica de chat migra a ventanas independientes, eliminando latencia en la interfaz principal.
*   **Layout "Solid Edge"**: Diseño limpio y enrasado con la barra de título, sin márgenes externos ni redondeados redundantes.
*   **Sidebar Responsiva**: Colapsar/expandir condicional según el contexto.
*   **Bloques de Respuesta Colapsables**: Colapsar/expandir respuestas del asistente para navegar conversaciones largas.
*   **Preview de Adjuntos**: Previsualización de adjuntos en el chat para referencia visual inmediata.
*   **Edición Directa por IA**: Modificar textos, iconos, colores y tamaños directamente desde la interfaz del navegador.
*   **Herramientas de Anotación Mejoradas**: Dibujo de rectángulos, funcionalidades extendidas del toolbar y mayor precisión del annotator.

### 🚀 Rendimiento & Arquitectura

*   **Core Reescrito**: Reescritura completa del núcleo para mejorar la resiliencia y el aislamiento de procesos.
*   **Aislamiento de Rendimiento**: La separación de ventanas garantiza que las tareas pesadas de la IA no bloqueen la navegación.
*   **Carga Lazy de Rutas**: Rutas cargadas de forma lazy con optimización del streaming y chunking de build.
*   **Mejoras en File Watcher**: Optimización del watcher de archivos y lógica de escaneo, especialmente en macOS.
*   **Código Más Limpio**: Se retiran módulos legacy (Web Search, Serper, Turbo Edits v2) que habían quedado obsoletos.

### 🛠 Herramientas & Productividad

*   **Visor de Supabase**: Visor de base de datos con visualización de tablas, valores y gestión de registros directamente desde la aplicación.
*   **Terminal de Consola**: Terminal integrada para las aplicaciones, con exportación de logs.
*   **Capturas de Pantalla Nativas**: Soporte nativo con logging de metadatos y herramientas de anotación mejoradas.
*   **Mejoras en Creación de Apps**: Fases de carga animadas, saneamiento de títulos y caché de `node_modules` reutilizable.
*   **Plantillas Mejoradas**: Valores específicos por aplicación en el scaffolding, eliminando wildcards genéricos.
*   **Exportación e Importación de Ajustes**: Funcionalidad completa en formato JSON.

### 💾 Backups & Datos

*   **Backups Integrales**: Gestión completa de backups con rotación, restauración desde la nube, compresión gzip y programación automática en segundo plano.
*   **Backup API de SQLite**: Proceso de backup usando la API nativa de SQLite para garantizar integridad.
*   **Logging Unificado de Consultas IA**: Métricas detalladas de uso de tokens con estadísticas por modelo, chat y timestamps.

### 👤 Cuenta & Autenticación

*   **Login y Registro**: Autenticación con Firebase incluyendo login, registro, logout y gestión de perfil.
*   **Firebase bajo Control**: La integración se reserva exclusivamente para autenticación y backups, las funciones de proyecto se incorporarán próximamente.
*   **Gestión Multi-API-Key**: Soporte para múltiples API keys de OpenRouter con seguimiento detallado de créditos y uso.

### 💬 Chat & Conversación

*   **Modo Agente por Defecto**: El flujo de chat unificado con UI mejorada.
*   **Función Undo Mejorada**: Recuperación de prompts y assets tras deshacer acciones.
*   **Modo Planificación**: Organización y estructuración de proyectos con soporte para múltiples chats y recuperación de planes.
*   **Dossiers**: Generación de dossiers completos con copia automática a la cuenta del usuario.

### ✅ Tareas & Kanban

*   **Subtareas (Checklists)**: Soporte completo con añadir, editar, eliminar, reordenar y marcar como completadas.
*   **Smart Import**: Importación inteligente que detecta y adjunta subtareas automáticamente.
*   **Resúmenes de Desarrollo**: Resúmenes automáticos al completar tareas, con indicador de notas generadas por bot.
*   **Barras de Progreso**: Visualización de progreso con drag-and-drop para reordenar.

---

#### ✨ ¡Disfruta las vibraciones de esta nueva actualización! ✨
