## ✨ Novedades

- Nueva opción en **Ajustes → Agente**: activa o desactiva los diagnósticos LSP por archivo
- Cuando el LSP está desactivado, el agente ejecuta `tsc --noEmit` automáticamente al finalizar la tarea para verificar errores de TypeScript
- Nuevo botón **"Reiniciar OpenCode"** que aparece en ajustes cuando cambias la configuración del servidor, para aplicarla sin salir de la app

## 🛠 Fixes

- Eliminada la limitación de pasos del agente que provocaba cortes inesperados en la respuesta
- Corregidos falsos eventos de edición de archivos al iniciar una sesión del agente
- Mejorado el comportamiento del scroll al comenzar el streaming de respuestas largas
- Corregido el modo Plan que revertía a Agente al primer envío
