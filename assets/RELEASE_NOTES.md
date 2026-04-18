## 🎨 Un Nuevo Diseño Más Inteligente

- **Navegación Fluida:** Nos hemos despedido de las barras estáticas en la parte superior. Ahora puedes cambiar de App y de Chat usando menús desplegables mucho más rápidos e intuitivos.
- **Panel Lateral con Memoria:** Tu panel lateral (donde ves las Apps, el Agente y las Tareas) ahora recuerda cómo lo dejaste. Si cierras una sección porque no la usas, se mantendrá cerrada la próxima vez que entres.
- **Gestión Completa de Chats:** Archiva, restaura, renombra, marca como no leído y elimina chats directamente desde el sidebar. Los chats archivados desaparecen de la lista principal para no molestar, y puedes recuperarlos fácilmente desde "Ver archivados" en el menú principal.
- **Ajustes donde Deben:** Hemos limpiado el panel principal y reubicado el botón de Ajustes junto a tu avatar para que el espacio de trabajo esté más despejado.

## 💬 El Chat que Necesitabas

- **Modo Zen para el Chat:** Cuando el agente trabaja en tareas largas, la pantalla podía saturarse con información de fondo y herramientas. El nuevo **modo Zen** elimina todo ese "ruido" visual (badges, paneles intermedios), mostrando únicamente el texto y la respuesta final. El resultado es muy fluido y ligero. *Puedes activarlo en Ajustes → Agente → Vista del chat.*
- **Coste por Mensaje Exacto:** Olvídate de sorpresas. Cada respuesta que te da el agente muestra el coste exacto acumulado durante esa interacción, tanto en modo normal como en modo Zen.
- **Citar Mensajes Históricos:** ¿El agente dijo algo ayer que quieres que tenga en cuenta hoy? Ahora puedes citar cualquier mensaje del historial para añadirlo como contexto. Además, puedes seguir apilando varias citas a la vez antes de enviar.
- **Adiós a los Textos Rotos:** Se acabó eso de pegar un enlace o un código larguísimo y que la ventana intente romperse; ahora el texto se ajusta automáticamente y puedes leer sin problemas.
- **Consola de Sistema Independiente:** Los mensajes técnicos ("El sistema se ha conectado...", etc.) ya no ensucian tu historial de chat. Todo eso va a su propia ventanita independiente en la cabecera.

## 🔄 Panel Git Completamente Renovado

Olvídate del panel de Git antiguo, lo hemos rehecho de raíz para ser tu mejor aliado:

- **Vista Dividida con Paneles Redimensionables:** A la izquierda la lista de archivos, a la derecha el visor de diferencias (diff), y en medio un separador que puedes arrastrar a tu gusto.
- **Vista Plana o en Árbol:** Tú decides si quieres ver los archivos modificados como una simple lista, o con la estructura de carpetas completa.
- **Visor de Diferencias Mejorado:** Ahora tiene numeración de líneas reales, colores de alto contraste mucho más limpios y scroll independiente.
- **El Subidón de Push:** Si tienes commits locales sin subir al servidor, ahora verás un botón directo para hacer **Push** acompañado del número de commits pendientes, justo al lado del Pull.
- **Herramientas Recogidas:** Las cosas avanzadas de Git (eliminar *lock*, abortar *merges* o *rebases*) se han agrupado en un discreto menú `⋮` para no saturar el panel.
- **Indicador Naranja en Sidebar:** ¿Te olvidas de hacer commit? Habrá un indicador naranja suave parpadeando en la barra lateral para recordártelo sin molestar tu flujo.

## ⚙️ Inteligencia y Flujo de Trabajo

La sala de máquinas también ha subido de marcha:

- **El Agente Ya No se Corta a la Mitad:** Hemos quitado por fin los límites de "pasos". Ahora el agente evalúa su tarea y no se rendirá ni se detendrá de pronto; trabajará hasta completar el código que necesitas.
- **Diagnósticos de Código Configurables:** Si sientes que el agente analiza mucho entre mensajes, ahora puedes activar o desactivar la lectura en tiempo real (LSP) de errores en TypeScript desde **Ajustes → Agente**. Con ello desactivado, el agente lo mirará solo al finalizar.
- **Configuración Básica de Modelos:** Redujimos todo el caos. Solo configuras tu **Modo Estándar** (respuestas y lectura del día a día) y el **Modo Pro** (trabajo pesado). Sencillo y sin mareos.
- **La Gran Purga:** Para hacer hueco, hemos borrado casi 2000 líneas de código viejo de funciones ("Dossiers", etc.) que nadie utilizaba ya, dándote una aplicación más rápida y eficiente.
