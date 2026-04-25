# Novedades de la versión 8.1

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

## Correcciones y ajustes visuales

- La vista del chat ahora arranca en modo Zen por defecto, más limpio y rápido.
- Las preguntas interactivas del asistente se muestran con un nuevo estilo visual más integrado.
- Interfaz de la vista previa más limpia, con menos elementos redundantes en la barra de navegación.
- Mejoras internas de estabilidad y rendimiento.

---

# Novedades de la versión 8.0

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

## Correcciones y mejoras generales

- Imágenes y archivos adjuntos en el chat se muestran con un diseño más compacto y con opción de ampliarlos al hacer clic.
- El buscador del selector de modelos se reinicia correctamente al cerrar el menú o elegir un modelo.
- Numerosas mejoras de estabilidad y rendimiento internas.

---

# Novedades de la versión 7.0

## 🎨 Un Nuevo Diseño Más Inteligente

- **Navegación Fluida:** Nos hemos despedido de las barras estáticas en la parte superior. Ahora puedes cambiar de App y de Chat usando menús desplegables mucho más rápidos e intuitivos.
- **Panel Lateral con Memoria:** Tu panel lateral ahora recuerda cómo lo dejaste. Si cierras una sección porque no la usas, se mantendrá cerrada la próxima vez que entres.
- **Gestión Completa de Chats:** Archiva, restaura, renombra, marca como no leído y elimina chats directamente desde el sidebar. Los chats archivados desaparecen de la lista principal para no molestar, y puedes recuperarlos fácilmente desde "Ver archivados" en el menú principal.
- **Ajustes donde Deben:** Hemos limpiado el panel principal y reubicado el botón de Ajustes junto a tu avatar para que el espacio de trabajo esté más despejado.

## 💬 El Chat que Necesitabas

- **Modo Zen para el Chat:** El nuevo **modo Zen** elimina todo el "ruido" visual (badges, paneles intermedios), mostrando únicamente el texto y la respuesta final. El resultado es muy fluido y ligero. *Puedes activarlo en Ajustes → Agente → Vista del chat.*
- **Coste por Mensaje Exacto:** Cada respuesta que te da el agente muestra el coste exacto acumulado durante esa interacción, tanto en modo normal como en modo Zen.
- **Citar Mensajes Históricos:** Ahora puedes citar cualquier mensaje del historial para añadirlo como contexto. Puedes seguir apilando varias citas a la vez antes de enviar.
- **Adiós a los Textos Rotos:** El texto se ajusta automáticamente y puedes leer sin problemas.
- **Consola de Sistema Independiente:** Los mensajes técnicos ya no ensucian tu historial de chat. Todo eso va a su propia ventanita independiente.

## 🔄 Panel Git Completamente Renovado

- **Vista Dividida con Paneles Redimensionables:** A la izquierda la lista de archivos, a la derecha el visor de diferencias, y en medio un separador que puedes arrastrar a tu gusto.
- **Vista Plana o en Árbol:** Tú decides si quieres ver los archivos modificados como una simple lista, o con la estructura de carpetas completa.
- **Visor de Diferencias Mejorado:** Numeración de líneas reales, colores de alto contraste mucho más limpios y scroll independiente.
- **El Subidón de Push:** Botón directo para hacer **Push** acompañado del número de commits pendientes.
- **Herramientas Recogidas:** Las cosas avanzadas de Git se han agrupado en un discreto menú `⋮` para no saturar el panel.
- **Indicador Naranja en Sidebar:** Un indicador naranja suave parpadeando en la barra lateral para recordarte que tienes cambios pendientes.

## ⚙️ Inteligencia y Flujo de Trabajo

- **El Agente Ya No se Corta a la Mitad:** Hemos quitado los límites de "pasos". El agente trabajará hasta completar el código que necesitas.
- **Diagnósticos de Código Configurables:** Puedes activar o desactivar la lectura en tiempo real (LSP) de errores en TypeScript desde **Ajustes → Agente**.
- **Configuración Básica de Modelos:** Solo configuras tu **Modo Estándar** y el **Modo Pro**. Sencillo y sin mareos.
- **La Gran Purga:** Hemos borrado casi 2000 líneas de código viejo, dándote una aplicación más rápida y eficiente.

## ⌨️ Tu Entorno, Tus Reglas (y Tus Tipografías)

- **Personalización a Otro Nivel:** Docenas de tipografías nuevas (Bricolage Grotesque, Inter, Outfit, JetBrains Mono...). Puedes elegir una tipografía de diseño para toda la interfaz y asignar otra distinta exclusivamente para el chat.
- **Previsualiza Colores Sin Cortes:** El selector de color de acento ya no se cierra cada vez que pulsas un color.
- **Desplegables Premium:** Menús selectores reconstruidos desde cero, más bonitos y bien centrados.

## 🚀 Menos Paja, Más Fluidez

- **Reencauzando el Interfaz:** Hemos desactivado los menús viejos de "Inspiración", el antiguo gestor de "Tareas", las "Notas" y las revisiones automáticas de seguridad. Tu código y el Agente son ahora los maestros del espacio central.
- **Tu Git Fluye en su Propio Espacio:** Todas las gestiones de Git importantes lanzan su propia ventana separada independiente.
- **Indicadores Sutiles e Inteligentes:** El desplegable de tu historial te deja ver qué chats continúan trabajando mediante un spinner asíncrono giratorio.

---

# Novedades de la versión 6.5

## Modo Zen para el chat

El nuevo **modo Zen** elimina todo el ruido intermedio —badges de herramientas, paneles de pensamiento, modales— y muestra únicamente el texto de la respuesta y el coste al final. Puedes activarlo en **Ajustes → Agente → Vista del chat**.

## Panel Git completamente renovado

- **Vista dividida con paneles redimensionables**
- **Vista plana o en árbol**
- **Visor de diff mejorado**: numeración de líneas, colores de alto contraste y scroll independiente
- **Botón de Push directo** con número de commits pendientes
- **Herramientas Git en menú discreto** `⋮`

## Indicador de commits pendientes en la barra lateral

Si tienes commits sin pushear o archivos sin confirmar, aparece un indicador naranja pulsante en la barra lateral.

## Coste por mensaje

Cada respuesta del agente muestra el coste exacto acumulado durante esa interacción.

## Gestión completa de chats en el sidebar

Archiva, restaura, renombra, marca como no leído y elimina chats directamente desde el sidebar.

## Citar mensajes

Cita cualquier mensaje del historial para dárselo como contexto al siguiente envío. Puedes apilar varias citas a la vez.

## El agente ya no se corta a mitad de una tarea

Se eliminó el límite de pasos que provocaba interrupciones inesperadas.

## Diagnósticos LSP configurables

Activa o desactiva la verificación de errores TypeScript en tiempo real desde **Ajustes → Agente**.

---

# Novedades de la versión 6.4.6

## ✨ Novedades

- Nueva opción en **Ajustes → Agente**: activa o desactiva los diagnósticos LSP por archivo
- Nuevo botón **"Reiniciar OpenCode"** en ajustes para aplicar cambios de configuración sin salir de la app

## 🛠 Fixes

- Eliminada la limitación de pasos del agente que provocaba cortes inesperados
- Corregidos falsos eventos de edición de archivos al iniciar sesión del agente
- Mejorado el comportamiento del scroll al comenzar el streaming
- Corregido el modo Plan que revertía a Agente al primer envío

---

# Novedades de la versión 6.3.3

## 🛠 Fixes

- Reparado problema con los iconos de servicios conectados que se visualizaban como un cuadrado blanco

---

# Novedades de la actualización del 15 de marzo de 2026

## 🚀 Integración completa del agente OpenCode

### Nuevo motor de agente IA
El corazón de Vibes ahora es **OpenCode**, un agente de código local de última generación que reemplaza al antiguo sistema Crush/Dyad.

- **Modos de chat renombrados**: "Agente" (OpenCode), "Agente legacy", "Planificar" y "Preguntar"
- **Streaming en tiempo real**: Procesamiento de eventos SSE para mostrar respuestas del agente en vivo
- **Soporte de adjuntos**: Imágenes, texto en línea y subida directa al codebase
- **Inyección de entorno**: Las variables de integración (Bunny DB/Storage, PocketBase) se inyectan automáticamente
- **Compactación automática de contexto**: Modo auto + prune para conversaciones largas
- **Badges de uso de tokens**: Separados y siempre visibles

### Diagnósticos del agente
- Canales IPC para health-check y test-run accesibles desde las DevTools
- Verificación de instalación, versión y claves API desde el frontend

## 🎨 Identidad Vibes

### Rebranding completo de Dyad a Vibes
Se han reemplazado **todas** las referencias a "Dyad" por "Vibes": componentes, textos, configuración y documentación.

- **Eliminación de Dyad Pro**: Todas las restricciones y funcionalidad legacy eliminadas
- **Eliminación de licencia FSL**: Se ha retirado la documentación Fair Source License
- **Limpieza de componentes**: Eliminados todos los componentes deprecados

## ✨ Experiencia de arranque y UI premium

- **Splash screen** con instalación/actualización automática del CLI de OpenCode
- **Skeleton de carga** para la ventana principal, eliminando el flash de contenido vacío
- **Micro-animaciones avanzadas** en el input del chat y en el sidebar

## 🛠 Mejoras técnicas

- Normalización de etiquetas legacy para compatibilidad hacia atrás
- Prevención de escrituras obsoletas en settings
- Funcionalidad "Abrir chat" directamente desde el listado de apps
- Undo/redo y restauración de versiones de mensajes del agente
- Limpieza general del repositorio

---

# Novedades de la versión 5.0

### 🤖 Agente IA

- **Base de Conocimientos Inteligente**: Filtrado semántico, deduplicación y decaimiento de confianza para inyectar solo las reglas más relevantes
- **Caché de Embeddings SQLite**: Persistencia eficiente de vectores con invalidación inteligente
- **Esfuerzo de Razonamiento Configurable**: Selector de niveles (none, low, medium, high) para modelos compatibles
- **Selector Dinámico OpenRouter**: Activar/desactivar modelos y añadir nuevos mediante buscador integrado
- **Agente Autosuficiente**: La nueva arquitectura hace innecesaria la auto-reparación externa
- **Un Solo Modo, Cero Confusión**: Todos los flujos convergen en el modo "Agente"

### ⚙️ Gestión de Procesos

- Herramientas `start_process`, `stop_process` y `list_processes` para gestionar servidores desde el agente
- `run_command` para ejecutar comandos seguros con restricciones de seguridad
- `wait_for_http` para esperar disponibilidad de servicios con timeouts configurables

### 🔀 Git

- Interacción íntegra con el repositorio: status, diff, log, show_commit, commit, checkout, branching, stash y revert
- Ventana de Git dedicada con navegación por commits y diffs visuales
- GitPanel con staging/unstaging individual, resolución de conflictos y gestión de merges
- Avisos inteligentes ante fallos comunes

### 🎨 Interfaz & UX

- Comprobación automática de actualizaciones con diálogo de descarga
- Rediseño completo de Ajustes con cabeceras colapsables
- Permisos por herramienta con selector de tres niveles
- Integraciones normalizadas (GitHub, Vercel, Supabase, Neon)
- Ventanas de chat dedicadas, eliminando latencia en la interfaz principal
- Layout "Solid Edge" limpio y enrasado
- Bloques de respuesta colapsables y preview de adjuntos
- Edición directa por IA desde la interfaz del navegador

### 🛠 Herramientas & Productividad

- Integraciones expandidas: **Bunny.net** y **PocketBase**
- Visores de bases de datos unificados (Supabase, Bunny, PocketBase)
- Terminal de consola integrada con exportación de logs
- Capturas de pantalla nativas con herramientas de anotación mejoradas
- Exportación e importación de ajustes en JSON

### 💾 Backups & Datos

- Gestión completa de backups con rotación, restauración y compresión gzip
- Logging unificado de consultas IA con métricas detalladas por modelo

### 👤 Cuenta & Autenticación

- Migración total a la nube: todos los datos locales se migran automáticamente al iniciar sesión
- Gestión multi-API-key con seguimiento de créditos

### ✅ Tareas & Kanban

- Subtareas (checklists) con Smart Import automático
- Resúmenes de desarrollo al completar tareas
- Barras de progreso con drag-and-drop

---

# Novedades de la versión 4.0

## 🔥 Novedades Beta 5
- Esfuerzo de razonamiento configurable para modelos que lo soportan
- Poder visualizar las API keys de OpenRouter
- Selector de modelos dinámico con buscador de OpenRouter
- Modal de información de modelo con costes y parámetros de entrada/salida
- Mejoras a la hora de crear apps nuevas
- Mejoras en "Tareas"

## Novedades acumulativas

### 🚀 Flujo de Trabajo y Productividad

- **Generación de Dossier Avanzada**: Dossiers completos con copia automática en tu cuenta
- **Modo Planificación**: Organización y estructuración de proyectos
- **Configuración de Comandos**: Comandos específicos de arranque o reinstalación por proyecto
- **Creación de Proyectos Rápidos**: Esqueleto para aplicación en blanco o vacía
- **Barra de Direcciones Interactiva**: Escribe rutas con historial y detección de rutas existentes
- **Ventanas Múltiples para Apps**: Las aplicaciones se abren en nuevas ventanas
- **Exportación e Importación de Ajustes**: En formato JSON

### 🧠 Agente Inteligente & IA

- Mejoras significativas en el agente inteligente
- Nuevos modelos orientados a programación
- Corrección del bloqueo del agente cuando no existían reglas de contexto
- Refactor del sistema de conocimiento automático para reducir falsos positivos

### ✏️ Editor Visual de la Página

- Edición directa por IA: modifica textos, iconos, colores y tamaños desde la interfaz

### 🎨 Interfaz

- Temas claros y oscuros consolidados
- Selector de color primario para cada tema
- Ajustes renovados y reorganizados
- Vista previa anclable al lado izquierdo
- Bloques de respuesta colapsables
- Función Undo mejorada con recuperación de prompts y assets

### 🛠 Herramientas

- Herramientas Git avanzadas con avisos inteligentes
- Visor para Supabase con gestión de registros
- Capturas de pantalla con edición avanzada, flechas y exportación PNG
- Exportación de notas a formato DOCX

---

# Novedades de la versión 3.3.1

### Performance
- Corrección del bug que bloqueaba el agente inteligente sin reglas de contexto

### Chat
- Capacidad de colapsar el bloque de respuesta de la IA
- Capacidad de hacer undo y recuperar prompts y assets

### UI
- Mejoradas las herramientas de captura de pantalla
- Simplificada la barra de acciones del chat

### Core
- Refactor del sistema de conocimiento automático para evitar ruido y falsos positivos

### Herramientas
- Herramientas para controlar mejor el repositorio Git
- Integración con Supabase para examinar la base de datos

---

# Novedades de la versión 3.0

- Integración con Firebase
- Logs de diagnóstico más completos
- Mejoras en el asistente inteligente para cometer menos errores manteniendo el ratio de consumo de tokens por debajo del modo Build

### 📝 Resumen automático de desarrollo en el tablero Kanban
Cuando envíes una tarea del kanban a desarrollo y la marques como completada, se sincroniza el estado, se genera un resumen automático y verás un ícono azul de bot indicando que hay notas generadas.

### ✅ Subtareas en el Kanban
Añade subtareas a tus tarjetas. **Smart Import** detecta subtareas automáticamente y las añade a tus cards.

### 🔑 Soporte para múltiples API keys de OpenRouter
Gestiona gastos por separado usando varias keys. Panel de crédito con gasto total, saldo y recargado.

### 💬 Mejoras en Debates
- Edición y reenvío de mensajes
- Etiquetas para organizar chats
- Botón para detener respuestas en generación

### 🤖 Base de Conocimientos IA
Sistema inteligente que aprende y aplica automáticamente las reglas, convenciones y preferencias de tu proyecto.

### 🔧 Auto-Repair de Errores en Tiempo Real
Monitoreo continuo y reparación automática de errores de runtime.

### 🛠️ Mejoras en el Agente
- Reducción del 95% de la ventana de contexto

### 🎨 Mejoras en la interfaz
- Botón de **Reiniciar** en las acciones del chat
- Capturas de pantalla total o parcial enviables al chat

### 👤 Registro de usuario
- Crear cuenta en Vibes y personalizarla
- Copias de seguridad en la nube

---

# Novedades de la versión 2.5

¡Esta versión incluye mejoras increíbles para potenciar tu desarrollo!

### 1. Notas de desarrollo en el tablero de tareas
Si envías a desarrollar una tarea de tu tablero kanban y la marcas como completada en el chat, se sincroniza el estado y se genera un resumen de desarrollo en la propia tarea. En la card verás un pequeño icono de bot azul que indica que hay notas.

### 2. Notas de versión
Esta es la primera versión que tiene notas de versión para aprender de todas las novedades.

---

#### ✨ ¡Disfruta las vibraciones! ✨
