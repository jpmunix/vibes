# v8.3
*28 de abril de 2026*

## El agente ahora tiene memoria

Nuevo **sistema de memoria por proyecto**: mientras trabajas, la IA extrae automáticamente hechos de arquitectura, preferencias, decisiones y problemas recurrentes. Esas memorias se inyectan como contexto en los chats siguientes, de modo que **el agente no parte de cero cada vez**. Puedes ver, editar, desactivar o crear memorias desde su propio panel, y personalizar las instrucciones de extracción desde **Ajustes → Prompts**.

## Playground: compara modelos en paralelo

Nuevo espacio para **lanzar el mismo prompt contra varios modelos a la vez** y comparar velocidad, tamaño de respuesta y calidad lado a lado. Puedes guardar **presets de modelos** para cambiar de batería con un clic, probar cómo responden distintos modelos al sistema de memorias, activar **auto-colapso** para que los resultados anteriores se plieguen solos y reintentar modelos individuales sin relanzar todo. Accesible desde **Ajustes → OpenRouter**.

## Ajusta el tamaño de cada zona

Nuevo panel colapsable en **Ajustes → General** para escalar el tamaño de fuente **por zona**: interfaz (botones, labels), sidebar, chat y **ancho de las burbujas**. Cada control va del 100% al 130% de forma independiente, de modo que puedes agrandar solo el texto del chat sin tocar el resto o ensanchar las burbujas para aprovechar más pantalla.

## Archiva apps y workspaces

Ahora puedes **archivar aplicaciones y workspaces** para sacarlos de la barra lateral sin borrar nada. Ideal para hacer limpieza visual cuando acumulas proyectos terminados o pausados. Todo queda guardado y accesible desde la sección de archivados, listo para **restaurarse con un clic** cuando lo necesites.

## Arranque casi instantáneo

Hemos recortado drásticamente el tiempo de arranque de la aplicación. Se ha optimizado el flujo de carga de datos, eliminado tablas innecesarias de la base de datos, retirado funcionalidades obsoletas y **borrado más de 50 archivos sin uso**. El resultado es una app que abre prácticamente al instante.

## Correcciones y ajustes

- Los botones de Importar, Exportar y Restablecer de los ajustes se han agrupado en un menú desplegable más compacto.
- Nuevo acceso directo a **Ver logs** desde el menú de ajustes.
- El menú contextual de cada workspace incluye un submenú "Código" con acceso rápido al explorador, los cambios Git y las memorias.
- Protección contra modelos retirados de OpenRouter: se detectan y desactivan automáticamente para evitar errores 404 durante el uso.
- Buscador de ajustes reescrito con keywords más precisas y cobertura de todos los controles, incluidos sub-valores de cada selector.
- Los títulos de los chats ya no se cortan prematuramente; el límite se ha ampliado para que reflejen mejor el contenido de la conversación.
- Corregido el botón "Ver todos" en la lista de chats del sidebar, que no hacía nada al pulsarlo.
- Nueva opción para **reiniciar el servidor del agente** directamente desde el menú de ajustes, sin cerrar la aplicación.
- Limpieza automática de más de 20 claves abandonadas del archivo de ajustes, tanto en local como al sincronizar con el servidor.
- Eliminación de código muerto en múltiples componentes que aún referenciaban ajustes obsoletos.
- Las ventanas ahora recuerdan su última posición y tamaño, y se restauran donde las dejaste al volver a abrirlas.
- Mejoras internas de estabilidad.

# v8.0
*27 de abril de 2026*

## Control total de permisos del agente

Ahora puedes decidir exactamente qué puede y qué no puede hacer el agente con un sistema de permisos por herramienta. Desde **Ajustes → Agente** configuras cada capacidad (editar archivos, terminal, acceso web, diagnósticos LSP) como **Siempre**, **Preguntar** o **Nunca**. Cuando una herramienta está en modo "Preguntar", **el agente te muestra un banner en el chat para que apruebes o rechaces la acción antes de ejecutarla**, con opción de recordar tu decisión para futuras sesiones. Para la terminal puedes definir reglas por comando (rm, patrones personalizados), y para Git hay una sección dedicada con **reglas granulares por nivel de riesgo**: staging, operaciones locales destructivas (reset, checkout, rebase…) y remotas (push, push --force).

## Explorador de archivos del proyecto

Hemos añadido una ventana independiente para **explorar y gestionar los archivos de tu proyecto sin salir del chat**. Se abre desde el menú de herramientas de la vista previa con su propio espacio, como ya ocurre con Git, la consola y la base de datos. Puedes **crear archivos y carpetas, renombrar y eliminar** directamente desde el árbol, sin pasar por la terminal ni por el agente. Cada archivo muestra un **icono coloreado según su tipo** (TypeScript en azul, JavaScript en amarillo, CSS en rosa, PHP en índigo…) para que identifiques de un vistazo lo que buscas.

## Diseños predefinidos y generación por visión

Puedes asignar un sistema de diseño a tus proyectos de varias formas: **sube un archivo DESIGN.md, pega el contenido directamente, elige entre diseños predefinidos o sube una captura de pantalla** y la IA analizará los colores, tipografías, espaciado y componentes para generarlo automáticamente. El asistente aplicará esas directrices en todo lo que genere. Desde la vista de detalles puedes **descargar el DESIGN.md activo** en cualquier momento.

## Selector de modelos rediseñado

El diálogo de añadir modelos ha recibido un **lavado de cara completo**: nueva disposición visual, filtros mejorados para encontrar modelos por capacidad y tipo, y **precios de entrada y salida por millón de tokens visibles directamente en la lista** (los gratuitos aparecen marcados como "gratis"). La sección de modelos habilitados en Ajustes también se ha renovado con el mismo estilo. Además, hemos sustituido la antigua ventana modal de "Ver detalles" por un **tooltip enriquecido al pasar el cursor**, mostrando precio, contexto, máximo de salida, modalidades y etiquetas sin salir del flujo de selección.

## Ponle nombre a tus modelos

Ahora puedes **asignar un alias personalizado a cualquier modelo** desde su ficha de detalles. El alias sustituye al nombre original en todos los selectores y también se usa como keyword de búsqueda, de modo que puedes encontrar tus modelos favoritos escribiendo el nombre que tú les hayas puesto. Puedes editarlo o quitarlo en cualquier momento.

## Variantes de modelo: elige cómo rutar tus peticiones

Ahora puedes elegir **variantes de enrutamiento** (como `:nitro` o `:exacto`) directamente desde el selector de modelos. Cada variante tiene un comportamiento diferente en velocidad y coste, y lo ves reflejado al instante en la interfaz, junto con los precios por millón de tokens.

## Tú decides cuándo commitear

Hasta ahora, el agente commiteaba automáticamente todos los cambios al terminar. Ahora puedes **desactivar "Auto-aprobar y confirmar cambios" en ajustes** para que el agente haga staging de los archivos pero te deje a ti el control del commit. Decides qué archivos incluir, qué mensaje escribir y cuándo confirmar desde el panel de Git.

## Descartar todos los cambios de Git de golpe

Antes, al descartar varios archivos modificados desde el panel de Git se ejecutaba un comando por cada archivo. Ahora, si seleccionas todos, **se ejecuta un único comando Git que revierte todo de forma instantánea**, con un mensaje de confirmación que resume el resultado.

## El asistente puede hacerte preguntas

Si la IA necesita aclarar algo antes de continuar, ahora **te lo pregunta directamente en el chat**, con opciones para responder de forma rápida, incluso con selección múltiple. En modo plan, el agente te preguntará lo que necesite antes de lanzarse a construir.

## Nuevo modo de chat: Flow

Hemos añadido un tercer modo de visualización entre Completo y Zen. **Flow te muestra los pensamientos de la IA en tiempo real como citas inline**, sin los badges de herramientas ni paneles expandibles. Ideal si quieres seguir el razonamiento sin el ruido visual de los pasos intermedios.

## Creación de apps, ahora instantánea

Hemos rediseñado la forma en la que se crean nuevas aplicaciones. En lugar de ejecutar comandos de instalación cada vez, **las dependencias se pre-cachean en segundo plano y se copian directamente al crear un proyecto**. El resultado: crear una app nueva tarda segundos en lugar de minutos, y arranca lista para trabajar desde el primer momento.

## Cierra varias apps de golpe

Si has acumulado proyectos que ya no necesitas, ahora puedes **seleccionar múltiples aplicaciones y cerrarlas todas a la vez** desde la barra lateral. Entra en modo selección, marca las que quieras, y confirma con opción de eliminar también los archivos. Una barra de progreso te muestra el avance en tiempo real.

## Historial de notas de versión, rediseñado

Las notas de versión ahora muestran el **historial completo de todas las releases**, con cada versión como un bloque colapsable. Las dos más recientes se muestran expandidas por defecto y el resto permanecen cerradas para no saturar la vista. Además, hemos **unificado el formato de todas las notas** antiguas: mismo estilo de prosa, misma jerarquía y títulos limpios tipo changelog de GitHub.

## Fija tus conversaciones favoritas

Ahora puedes **fijar hasta 10 conversaciones** en la parte superior de la barra lateral, sin importar a qué workspace pertenezcan. Un clic en el menú contextual del chat y listo: siempre a mano, con el nombre del workspace debajo para que no pierdas el contexto. Para desfijar, pasa el cursor y pulsa el icono.

## Cambia de tema con un atajo

Pulsa **Ctrl + T** (o **Cmd + T** en macOS) desde cualquier pantalla para **alternar entre el tema claro y el oscuro al instante**. Sin menús, sin ajustes: un solo atajo para cambiar el ambiente de trabajo cuando lo necesites.

## Correcciones y ajustes

- Todos los diálogos de la aplicación (confirmaciones, alertas, formularios) se han unificado en fuentes, colores y estilos para una experiencia visual coherente en toda la interfaz.
- Los colores de acento de la interfaz ahora derivan automáticamente del color primario que elijas en ajustes.
- Títulos de las ventanas independientes (Git, Chat, Consola, Base de datos) normalizados con un formato uniforme.
- El stack React con Tailwind CSS 4 y Vite 6 es ahora el predeterminado; nueva plantilla Express (Express 5, TypeScript, Helmet, Zod) disponible para proyectos backend.
- Al importar un proyecto existente, ahora se detecta automáticamente el lenguaje principal y el tipo de proyecto.
- Lista de tareas del agente más clara, con mejor visualización del progreso y transiciones más fluidas.
- Posibilidad de crear apps vacías directamente desde el espacio de trabajo del agente.
- Planificación más inteligente: el asistente desglosa el trabajo en tareas estructuradas antes de empezar.
- Arranque automático del servidor de desarrollo más fiable, sin falsos positivos.
- Indicadores de actividad del agente rediseñados con animaciones más precisas.
- Chat más estable y sin bloqueos; scroll renovado con sistema nativo más ligero.
- Los modelos gratuitos de OpenRouter ahora se conectan y responden correctamente.
- Indicador visual discreto cuando se cancela una respuesta del agente a mitad de generación.
- Cuando el agente modifica dependencias, se limpia automáticamente la carpeta de módulos para garantizar instalaciones frescas.
- Imágenes y archivos adjuntos en el chat con diseño más compacto y opción de ampliar al hacer clic.
- La vista del chat arranca en modo Zen por defecto.
- Interfaz de la vista previa más limpia, con menos elementos redundantes.
- Corregido un problema que impedía guardar archivos con contenido vacío desde el editor.
- Textos de la interfaz de workspaces corregidos para mayor consistencia.
- El popover de versión del sistema ahora carga instantáneamente.
- Retoques visuales en la barra lateral y en las fichas de detalle de aplicaciones.
- Mejoras internas de estabilidad y rendimiento.


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
