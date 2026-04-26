# v8.2
*26 de abril de 2026*

## Control total de permisos del agente

Ahora puedes decidir exactamente qué puede y qué no puede hacer el agente con un sistema de permisos por herramienta. Desde **Ajustes → Agente** configuras cada capacidad (editar archivos, terminal, acceso web, diagnósticos LSP) como **Siempre**, **Preguntar** o **Nunca**. Cuando una herramienta está en modo "Preguntar", **el agente te muestra un banner en el chat para que apruebes o rechaces la acción antes de ejecutarla**, con opción de recordar tu decisión para futuras sesiones. Para la terminal puedes definir reglas por comando (rm, patrones personalizados), y para Git hay una sección dedicada con **reglas granulares por nivel de riesgo**: staging, operaciones locales destructivas (reset, checkout, rebase…) y remotas (push, push --force).

## Ventana de archivos del proyecto

Hemos añadido una ventana independiente para **explorar los archivos de tu proyecto sin salir del chat**. Accesible desde el menú de herramientas de la vista previa, se abre con su propio espacio y título, como ya ocurre con Git, la consola y la base de datos.

## Descartar todos los cambios de Git de golpe

Antes, al descartar varios archivos modificados desde el panel de Git se ejecutaba un comando por cada archivo. Ahora, si seleccionas todos, **se ejecuta un único comando Git que revierte todo de forma instantánea**, con un mensaje de confirmación que resume el resultado.

## Indicador de respuesta cancelada

Cuando detienes una respuesta del agente a mitad de generación, ahora **se muestra un indicador visual discreto** en el punto exacto donde se cortó la respuesta, en lugar de dejar el mensaje colgando sin contexto.

## Selector de modelos rediseñado

El diálogo de añadir modelos ha recibido un **lavado de cara completo**: nueva disposición visual, filtros mejorados para encontrar modelos por capacidad y tipo, y **precios de entrada y salida por millón de tokens visibles directamente en la lista** (los gratuitos aparecen marcados como "gratis"). La sección de modelos habilitados en Ajustes también se ha renovado con el mismo estilo. Además, hemos sustituido la antigua ventana modal de "Ver detalles" por un **tooltip enriquecido al pasar el cursor**, mostrando precio, contexto, máximo de salida, modalidades y etiquetas sin salir del flujo de selección.

## Los colores de la interfaz siguen tu acento

Los componentes interactivos del chat (preguntas del asistente, permisos, citas) antes usaban un color teal fijo. Ahora **todos derivan automáticamente del color de acento que elijas en ajustes**, de modo que toda la interfaz mantiene coherencia visual sin importar qué tono prefieras.

## Historial de notas de versión, rediseñado

Las notas de versión ahora muestran el **historial completo de todas las releases**, con cada versión como un bloque colapsable. Las dos más recientes se muestran expandidas por defecto y el resto permanecen cerradas para no saturar la vista. Además, hemos **unificado el formato de todas las notas** antiguas: mismo estilo de prosa, misma jerarquía y títulos limpios tipo changelog de GitHub.

## Correcciones y ajustes

- Todos los diálogos de la aplicación (confirmaciones, alertas, formularios) se han unificado en fuentes, colores y estilos para una experiencia visual coherente en toda la interfaz.
- Títulos de las ventanas independientes (Git, Chat, Consola, Base de datos) normalizados con un formato uniforme.
- Textos de la interfaz de workspaces corregidos para mayor consistencia.
- Mejoras internas de estabilidad.
- El popover de versión del sistema ahora carga instantáneamente

# v8.1
*25 de abril de 2026*

## Genera un sistema de diseño desde una captura de pantalla

Ahora puedes subir o pegar una captura de cualquier interfaz y la IA **analizará los colores, tipografías, espaciado y componentes para generar un archivo DESIGN.md completo automáticamente**. Solo necesitas un modelo con soporte de visión y un pantallazo de la referencia que quieras replicar. Además, desde la vista de detalles de la app puedes **descargar el DESIGN.md activo** en cualquier momento.

## Nuevo modo de chat: Flow

Hemos añadido un tercer modo de visualización entre Completo y Zen. **Flow te muestra los pensamientos de la IA en tiempo real como citas inline**, sin los badges de herramientas ni paneles expandibles. Ideal si quieres seguir el razonamiento sin el ruido visual de los pasos intermedios.

## Creación de apps, ahora instantánea

Hemos rediseñado la forma en la que se crean nuevas aplicaciones. En lugar de ejecutar comandos de instalación cada vez, **las dependencias se pre-cachean en segundo plano y se copian directamente al crear un proyecto**. El resultado: crear una app nueva tarda segundos en lugar de minutos, y arranca lista para trabajar desde el primer momento.

## Instalación más limpia después de cada sesión del agente

Cuando el agente termina de trabajar y ha modificado dependencias, ahora **se limpia automáticamente la carpeta de módulos para que el siguiente arranque haga una instalación fresca**. Esto evita estados inconsistentes y errores difíciles de depurar provocados por instalaciones parciales durante la sesión.

## Cierra varias apps de golpe

Si has acumulado proyectos que ya no necesitas, ahora puedes **seleccionar múltiples aplicaciones y cerrarlas todas a la vez** desde la barra lateral. Entra en modo selección, marca las que quieras, y confirma con opción de eliminar también los archivos. Una barra de progreso te muestra el avance en tiempo real.

## Nuevo stack: React.js (beta)

Hemos añadido una plantilla experimental con **React 19, Vite 6, Tailwind CSS 4 (plugin nativo de Vite), Shadcn/ui y React Router DOM 7**. Ideal si quieres trabajar con lo último de cada librería. Aparece en el selector de plantillas junto al stack estable para que elijas según tu preferencia.

## Correcciones y ajustes

- La vista del chat ahora arranca en modo Zen por defecto, más limpio y rápido.
- Las preguntas interactivas del asistente se muestran con un nuevo estilo visual más integrado.
- Interfaz de la vista previa más limpia, con menos elementos redundantes en la barra de navegación.
- Mejoras internas de estabilidad y rendimiento.

# v8.0
*24 de abril de 2026*

## Lista de tareas en tiempo real, mejorada

La lista de tareas que el asistente genera durante su trabajo ahora se muestra de forma más clara y organizada. **Puedes seguir el progreso de cada paso al instante**, con mejor visualización del estado de cada tarea y transiciones más fluidas.

## Crea apps vacías directamente desde el agente

Ya no necesitas partir de una plantilla para arrancar un proyecto. Ahora puedes **crear una aplicación completamente vacía desde el propio espacio de trabajo del agente**, lista para que empieces desde cero o para que la IA la construya según tus instrucciones.

## Diseños predefinidos con DESIGN.md

Hemos añadido la posibilidad de asignar un sistema de diseño personalizado a tus proyectos. **Sube tu propio archivo DESIGN.md, pega el contenido directamente o elige entre diseños predefinidos**, y el asistente aplicará esas directrices visuales automáticamente en todo lo que genere.

## Creación de apps más limpia y actualizada

Dejamos atrás los esqueletos con dependencias obsoletas. Al crear una nueva aplicación, el agente **trabaja siempre con las últimas versiones de cada librería** e instala solo lo necesario para tu proyecto, sin arrastrar código muerto ni paquetes innecesarios.

## Nuevo estilo del indicador de actividad

El loader y los indicadores de estado durante la fase de trabajo del agente han sido rediseñados. **La animación es ahora más elegante y refleja con precisión la acción que se está realizando**, con colores diferenciados según el tipo de operación.

## Planificación más inteligente con lista de tareas

Cuando describes lo que quieres de forma general, el asistente ahora **desglosa el trabajo en una lista de tareas estructurada antes de empezar**. Esto te da visibilidad sobre lo que va a hacer y permite que proyectos complejos se ejecuten con más orden y mejores resultados.

## Arranque automático del servidor, más fiable

Hemos mejorado la detección del estado del proyecto para que el servidor de desarrollo **se arranque automáticamente en el momento justo**, sin falsos positivos ni reinicios innecesarios. Cuando el agente termina de trabajar, la vista previa se actualiza sin que tengas que hacer nada.

## Preguntas y respuestas en el modo plan

Reforzamos el uso de la herramienta de preguntas interactivas cuando el asistente está en modo plan. **El agente te preguntará lo que necesite aclarar antes de lanzarse a construir**, especialmente eficaz con modelos como Gemini Pro, Claude Haiku y superiores, GPT Codex, Kimi 2.6, Qwen Plus o MiniMax 2.7.

## Modelos gratuitos de OpenRouter, ahora sí funcionan

Antes, al seleccionar un modelo gratuito de OpenRouter podía fallar silenciosamente. Hemos corregido el problema: **los modelos gratuitos se conectan y responden correctamente**, sin errores ocultos.

## Variantes de modelo: elige cómo rutar tus peticiones

Ahora puedes elegir **variantes de enrutamiento** (como `:nitro` o `:exacto`) directamente desde el selector de modelos. Cada variante tiene un comportamiento diferente en velocidad y coste, y lo ves reflejado al instante en la interfaz, junto con los precios por millón de tokens.

## Chat más estable y sin bloqueos

Hemos reescrito partes clave del sistema de chat para que las respuestas fluyan sin interrupciones. **Se acabaron los cortes inesperados** y los momentos en que el chat parecía congelarse. Todo funciona de forma más predecible, incluso cuando envías varios mensajes seguidos.

## Scroll del chat, completamente renovado

Eliminamos la librería externa que controlaba el scroll y la reemplazamos por un sistema nativo, más ligero y rápido. **El desplazamiento es ahora suave y natural**, sin saltos raros al cargar mensajes antiguos ni al recibir respuestas largas.

## Revertir varios archivos a la vez desde Git

En el panel de Git, ya no necesitas revertir archivo por archivo. **Selecciona varios cambios y revuértelos todos de un golpe** con una sola confirmación. Más rápido, menos clics.

## El asistente puede hacerte preguntas

Si la IA necesita aclarar algo antes de continuar, ahora **te lo pregunta directamente en el chat**, con opciones para responder de forma rápida, incluso con selección múltiple. Nada de quedarse bloqueado esperando: el flujo de trabajo sigue siendo tuyo.

## Correcciones y ajustes

- Imágenes y archivos adjuntos en el chat se muestran con un diseño más compacto y con opción de ampliarlos al hacer clic.
- El buscador del selector de modelos se reinicia correctamente al cerrar el menú o elegir un modelo.
- Numerosas mejoras de estabilidad y rendimiento internas.

# v7.0
*19 de abril de 2026*

## Un nuevo diseño más inteligente

Nos hemos despedido de las barras estáticas en la parte superior. Ahora puedes **cambiar de app y de chat usando menús desplegables** mucho más rápidos e intuitivos. Tu panel lateral recuerda cómo lo dejaste: si cierras una sección, se mantiene cerrada la próxima vez. Además, puedes **archivar, restaurar, renombrar, marcar como no leído y eliminar chats** directamente desde el sidebar, y hemos reubicado los ajustes junto al avatar para despejar el espacio de trabajo.

## El chat que necesitabas

El nuevo **modo Zen** elimina todo el "ruido" visual (badges, paneles intermedios), mostrando únicamente la respuesta final. Cada mensaje del agente muestra el **coste exacto acumulado** durante esa interacción. Puedes **citar mensajes históricos** y apilar varias citas antes de enviar. El texto se ajusta automáticamente y los mensajes técnicos van a una **consola independiente** para no ensuciar el historial.

## Panel Git completamente renovado

Vista dividida con **paneles redimensionables**, vista plana o en árbol, visor de diferencias con numeración de líneas y colores de alto contraste. Botón de **Push directo** con contador de commits pendientes, herramientas avanzadas agrupadas en un menú discreto y un **indicador naranja en la barra lateral** que te recuerda los cambios pendientes.

## Inteligencia y flujo de trabajo

Se han eliminado los límites de pasos del agente: **trabajará hasta completar el código que necesitas**. Los diagnósticos LSP son configurables desde ajustes y la configuración de modelos se ha simplificado a solo dos modos: estándar y pro. Hemos borrado casi 2000 líneas de código viejo para una app más rápida y eficiente.

## Tu entorno, tus reglas

Docenas de **tipografías nuevas** (Bricolage Grotesque, Inter, Outfit, JetBrains Mono…) con opción de asignar una tipografía distinta para el chat. El selector de color de acento ya no se cierra al hacer clic y los menús selectores se han reconstruido desde cero. Hemos desactivado los menús viejos (Inspiración, Tareas, Notas) para que el código y el agente sean los protagonistas.

# v6.5
*17 de abril de 2026*

## Modo Zen para el chat

El nuevo **modo Zen** elimina todo el ruido intermedio —badges de herramientas, paneles de pensamiento, modales— y muestra únicamente el texto de la respuesta y el coste al final. Puedes activarlo en **Ajustes → Agente → Vista del chat**.

## Panel Git renovado

Vista dividida con paneles redimensionables, vista plana o en árbol, visor de diff mejorado con numeración de líneas y colores de alto contraste. **Botón de Push directo** con número de commits pendientes y herramientas Git agrupadas en un menú discreto.

## Coste por mensaje y gestión de chats

Cada respuesta del agente muestra el **coste exacto acumulado** durante la interacción. Archiva, restaura, renombra, marca como no leído y elimina chats directamente desde el sidebar. Puedes **citar cualquier mensaje** del historial para dárselo como contexto al siguiente envío.

## Sin límites y con diagnósticos configurables

Se eliminó el límite de pasos que provocaba interrupciones inesperadas. Activa o desactiva la **verificación de errores TypeScript** en tiempo real desde Ajustes → Agente. Un indicador naranja pulsante en la barra lateral te recuerda los cambios pendientes.

# v6.4.6
*16 de abril de 2026*

## Novedades

- Nueva opción en **Ajustes → Agente**: activa o desactiva los diagnósticos LSP por archivo.
- Nuevo botón **"Reiniciar OpenCode"** en ajustes para aplicar cambios de configuración sin salir de la app.

## Correcciones

- Eliminada la limitación de pasos del agente que provocaba cortes inesperados.
- Corregidos falsos eventos de edición de archivos al iniciar sesión del agente.
- Mejorado el comportamiento del scroll al comenzar el streaming.
- Corregido el modo Plan que revertía a Agente al primer envío.

# v6.3.3
*8 de abril de 2026*

## Correcciones

- Reparado problema con los iconos de servicios conectados que se visualizaban como un cuadrado blanco.

# v6.0
*15 de marzo de 2026*

## Integración completa del agente OpenCode

El corazón de Vibes ahora es **OpenCode**, un agente de código local de última generación que reemplaza al antiguo sistema Crush/Dyad. Modos de chat renombrados ("Agente", "Planificar", "Preguntar"), **streaming en tiempo real** de respuestas, soporte de adjuntos (imágenes, texto, subida directa), inyección automática de variables de integración y **compactación automática de contexto** para conversaciones largas.

## Rebranding completo de Dyad a Vibes

Se han reemplazado **todas** las referencias a "Dyad" por "Vibes": componentes, textos, configuración y documentación. Eliminadas todas las restricciones de Dyad Pro, la licencia FSL y los componentes deprecados.

## Experiencia de arranque premium

**Splash screen** con instalación automática del CLI de OpenCode, skeleton de carga para la ventana principal eliminando el flash de contenido vacío, y micro-animaciones avanzadas en el input del chat y el sidebar.

## Correcciones

- Normalización de etiquetas legacy para compatibilidad hacia atrás.
- Prevención de escrituras obsoletas en settings.
- Funcionalidad "Abrir chat" directamente desde el listado de apps.
- Undo/redo y restauración de versiones de mensajes del agente.

# v5.0
*2 de marzo de 2026*

## Agente IA renovado

**Base de Conocimientos Inteligente** con filtrado semántico, deduplicación y decaimiento de confianza. Caché de embeddings SQLite con invalidación inteligente. **Esfuerzo de razonamiento configurable** (none, low, medium, high) y selector dinámico de modelos de OpenRouter con buscador integrado. El agente es autosuficiente: todos los flujos convergen en un solo modo.

## Gestión de procesos y herramientas

Herramientas para gestionar servidores desde el agente (`start_process`, `stop_process`, `list_processes`), ejecutar comandos seguros con restricciones de seguridad y esperar disponibilidad de servicios con timeouts configurables.

## Git integrado

Interacción íntegra con el repositorio: status, diff, log, commit, checkout, branching, stash y revert. **Ventana de Git dedicada** con navegación por commits, staging/unstaging individual, resolución de conflictos y gestión de merges.

## Interfaz y experiencia de usuario

Comprobación automática de actualizaciones, rediseño de ajustes con cabeceras colapsables, permisos por herramienta con selector de tres niveles, ventanas de chat dedicadas y layout "Solid Edge" limpio. Integraciones expandidas: **Bunny.net** y **PocketBase** con visores de bases de datos unificados.

## Backups, cuenta y tareas

Gestión completa de backups con rotación, restauración y compresión gzip. Migración total a la nube con gestión multi-API-key. Subtareas en el kanban con Smart Import automático y resúmenes de desarrollo al completar tareas.

# v4.0
*18 de febrero de 2026*

## Razonamiento, modelos y productividad

Esfuerzo de razonamiento configurable para modelos que lo soportan. **Selector de modelos dinámico** con buscador de OpenRouter y modal de información con costes y parámetros. Generación de dossiers avanzada, modo planificación, comandos específicos de arranque por proyecto, creación rápida de apps en blanco y ventanas múltiples.

## Agente inteligente y editor visual

Mejoras significativas en el agente con nuevos modelos orientados a programación. **Edición directa por IA**: modifica textos, iconos, colores y tamaños desde la interfaz del navegador. Corrección del bloqueo del agente sin reglas de contexto y refactor del sistema de conocimiento automático.

## Interfaz y herramientas

Temas claros y oscuros consolidados con selector de color primario. Ajustes renovados, vista previa anclable, función undo mejorada. Herramientas Git avanzadas, visor de Supabase, capturas de pantalla con edición avanzada y exportación de notas a DOCX.

# v3.3.1
*13 de febrero de 2026*

## Correcciones y mejoras

- Corrección del bug que bloqueaba el agente sin reglas de contexto.
- Capacidad de colapsar el bloque de respuesta de la IA y hacer undo para recuperar prompts.
- Herramientas de captura de pantalla mejoradas y barra de acciones del chat simplificada.
- Refactor del sistema de conocimiento automático para evitar ruido y falsos positivos.
- Herramientas para controlar mejor el repositorio Git e integración con Supabase.

# v3.0
*11 de febrero de 2026*

## Kanban, API keys y base de conocimientos

Integración con Firebase, logs de diagnóstico más completos y mejoras en el asistente. **Resumen automático de desarrollo** en el tablero kanban al completar tareas, subtareas con Smart Import, y soporte para **múltiples API keys** de OpenRouter con panel de crédito.

## Chat, agente e interfaz

Edición y reenvío de mensajes, etiquetas para organizar chats y botón para detener respuestas. **Base de Conocimientos IA** que aprende automáticamente las reglas y convenciones del proyecto. Auto-repair de errores en tiempo real, reducción del 95% de la ventana de contexto y capturas de pantalla enviables al chat.

## Registro de usuario

Crear cuenta en Vibes, personalizarla y activar copias de seguridad en la nube.

# v2.5
*9 de febrero de 2026*

## Primeras notas de versión

Esta es la primera versión con notas de versión. Al enviar una tarea del kanban a desarrollo y marcarla como completada, se sincroniza el estado y **se genera un resumen de desarrollo en la propia tarea**, con un icono de bot azul indicando que hay notas.
