# Plan: Selector de Scripts en Botón Play

## Objetivo
Al hacer clic en el botón de Play (ServerControlButton) en modo workspace, en lugar de arrancar directamente, mostrar un desplegable con todos los scripts del `package.json` del proyecto para elegir cuál ejecutar.

## Cambios necesarios

### 1. `ServerControlButton.tsx`
- Añadir estado para popover de scripts
- Modificar `handleStart` → `handlePlayClick` que abre el popover
- Leer `package.json` via `ipc.app.readAppFile({appId, filePath: 'package.json'})` al hacer hover
- Al seleccionar script: guardar como `startCommand` via `updateAppCommands` y arrancar
- Opción "Default (npm run dev)" siempre disponible

### 2. No se requieren cambios en IPC (reutilizamos APIs existentes)
- `readAppFile` para leer `package.json`
- `updateAppCommands` para persistir el script seleccionado

## UX
- Si no hay `package.json` o no tiene scripts → arranca directamente con comando por defecto
- Popover con búsqueda para filtrar scripts
- La selección se persiste como `startCommand`
