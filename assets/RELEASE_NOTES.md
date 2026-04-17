## ✨ Novedades

- **Gasto de la sesión**: se muestra el coste acumulado de cada chat en la barra superior del workspace, con formato claro y tooltip descriptivo
- **Breadcrumb en el header**: el header del modo agente ahora muestra `App › Título del chat` con el nombre completo sin truncar
- **Citar mensajes**: puedes citar cualquier mensaje del chat (tanto del usuario como de la IA) usando el botón de citar. La cita aparece como una pill encima del campo de texto y se envía como contexto al modelo
- **Múltiples citas**: puedes añadir varias citas a la vez antes de enviar tu mensaje
- **Copiar respuestas de la IA**: el botón de copiar en la burbuja de la IA copia solo el texto limpio, sin etiquetas internas de herramientas ni metadatos
- **Gestión de chats en el sidebar**: cada chat tiene un botón de acción rápida para archivar y un menú `⋮` con opciones: marcar como no leído, renombrar y eliminar
- **Sistema de archivado**: archiva chats directamente desde el sidebar; los chats archivados desaparecen de la lista principal sin borrarse
- **Panel de archivados**: desde el menú de carpeta, "Ver archivados" abre un modal centrado con todos los chats archivados, fecha y botón para restaurarlos individualmente
- **Renombrado inline**: al elegir "Renombrar", el título se edita directamente en el sidebar sin ventanas emergentes
- **Marcar como no leído**: marca manualmente un chat para que muestre el puntito indicador, igual que cuando llega una respuesta nueva
- **Restyle del sidebar**: hover con fondo completo en toda la fila (incluyendo zona de botones), gradiente de fundido más pronunciado, iconos más grandes y mejor espaciado
- **Menú de carpeta `⋮`**: nuevo chat, ver archivados y cerrar carpeta — todo accesible desde el mismo menú contextual
- Nueva opción en **Ajustes → Agente**: activa o desactiva los diagnósticos LSP por archivo
- Cuando el LSP está desactivado, el agente ejecuta `tsc --noEmit` automáticamente al finalizar la tarea para verificar errores de TypeScript
- Nuevo botón **"Reiniciar OpenCode"** que aparece en ajustes cuando cambias la configuración del servidor, para aplicarla sin salir de la app

## 🛠 Fixes

- Corregido un error de validación al actualizar servidores MCP desde ajustes
- Corrección del prompt de Gemini: se evita que alucine herramientas de shell como `apply_patch` o scripts de Python, forzando el uso exclusivo de las herramientas nativas del SDK
- Eliminada la limitación de pasos del agente que provocaba cortes inesperados en la respuesta
- Corregidos falsos eventos de edición de archivos al iniciar una sesión del agente
- Mejorado el comportamiento del scroll al comenzar el streaming de respuestas largas
- Corregido el modo Plan que revertía a Agente al primer envío
