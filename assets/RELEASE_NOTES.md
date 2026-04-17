## Modo Zen para el chat

Cuando el agente trabaja en tareas largas, el chat puede volverse muy pesado visualmente. El nuevo **modo Zen** elimina todo el ruido intermedio —badges de herramientas, paneles de pensamiento, modales— y muestra únicamente el texto de la respuesta y el coste al final. El resultado es una experiencia mucho más fluida y ligera durante el streaming. Puedes activarlo en **Ajustes → Agente → Vista del chat**.

## Panel Git completamente renovado

La ventana de Git ha sido rediseñada de raíz:

- **Vista dividida con paneles redimensionables**: la lista de archivos y el visor de diferencias conviven en paneles que puedes ajustar arrastrando el separador
- **Vista plana o en árbol**: alterna entre lista plana o estructura de carpetas jerárquica
- **Visor de diff mejorado**: numeración de líneas, colores de alto contraste y scroll independiente por panel
- **Botón de Push directo**: cuando tienes commits locales sin subir, aparece un botón de push junto al de pull, mostrando cuántos commits están pendientes
- **Historial más legible**: tipografía y tamaños de fuente consistentes con el resto de la app
- **Herramientas Git en menú discreto**: las opciones auxiliares (eliminar lock, abortar merge/rebase) se han recogido en un menú `⋮` para no saturar el header

## Indicador de commits pendientes en la barra lateral

Si tienes commits sin pushear o archivos sin confirmar, aparece un indicador naranja pulsante en la barra lateral para recordártelo sin interrumpirte.

## Coste por mensaje

Cada respuesta del agente muestra el coste exacto acumulado durante esa interacción, visible tanto en modo normal como en modo Zen.

## Gestión completa de chats en el sidebar

Archiva, restaura, renombra, marca como no leído y elimina chats directamente desde el sidebar. Los chats archivados desaparecen de la lista principal sin borrarse, y puedes recuperarlos desde "Ver archivados" en el menú de carpeta.

## Citar mensajes

Cita cualquier mensaje del historial —del usuario o de la IA— para dárselo como contexto al siguiente envío. Puedes apilar varias citas a la vez antes de enviar.

## El agente ya no se corta a mitad de una tarea

Se eliminó el límite de pasos que provocaba interrupciones inesperadas en tareas complejas. El agente ahora trabaja hasta completar la tarea o hasta que tú lo pares.

## Diagnósticos LSP configurables

Activa o desactiva la verificación de errores TypeScript en tiempo real desde **Ajustes → Agente**. Cuando está desactivada, el agente ejecuta una comprobación completa al finalizar la tarea.
