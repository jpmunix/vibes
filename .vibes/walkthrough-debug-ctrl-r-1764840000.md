# Change Summary: Ctrl+R recarga preservando query string en chat/git windows

## Resumen para el usuario

Síntoma: al pulsar **Ctrl+R** dentro de la ventana de chat (o la de git viewer) para forzar un reload durante debug, la pantalla se quedaba en negro con el error de DevTools "Not allowed to load local resource: file:///?appId=256&chatId=1412". El appId/chatId se conservaban pero la query quedaba huérfana, así que Chromium la trataba como un recurso local inválido.

Causa raíz: el handler `before-input-event` de las ventanas `chatWindow` y `gitWindow` (`src/ipc/handlers/window_handlers.ts`) llamaba a `webContents.reload()` (o `reloadIgnoringCache()`). Un reload del WebContents pierde la URL canónica usada en el `loadFile`/`loadURL` inicial — la query string con `?window=chat&appId=…&chatId=…` solo vivía en la llamada inicial, no en la URL "real" del archivo, así que Electron terminaba apuntando a `file:///?appId=…&chatId=…` sin `index.html`, y Chromium lo bloqueaba.

Solución: en ambas ventanas, sustituir el `webContents.reload()` por una reemisión del `loadURL`/`loadFile` con la misma query string con la que se abrió la ventana originalmente. Para eso he movido la construcción de `queryParam` antes del handler `before-input-event` y extraído la construcción de la URL a una función `loadChatUrl` / `loadGitUrl` reutilizable.

## Cambios técnicos

**Archivo modificado:** `src/ipc/handlers/window_handlers.ts`

### `openChatWindow` handler
- Construyo `queryParam` (`?window=chat&appId=…&chatId=…&hasPendingPrompt=…&chatMode=…&theme=…&intensity=…`) **antes** del `before-input-event`, en lugar de después.
- Extraigo la rama `MAIN_WINDOW_VITE_DEV_SERVER_URL ? loadURL : loadFile` a una función `loadChatUrl` reutilizable.
- `Ctrl+R`, `Ctrl+Shift+R` y `F5` ahora llaman a `loadChatUrl()` en lugar de `reload()` / `reloadIgnoringCache()`. F12 y Ctrl+Shift+I siguen abriendo DevTools.
- La carga inicial de la ventana se hace llamando a `loadChatUrl()` (mismo comportamiento que antes).

### `openGitWindow` handler (mismo bug, mismo arreglo preventivo)
- Mismo refactor: `queryParam` arriba, `loadGitUrl` reusable, `Ctrl+R` / `Ctrl+Shift+R` / `F5` llaman a `loadGitUrl()`. La carga inicial es `loadGitUrl()`.

## Verificación

- **Typecheck:** `pnpm ts:main` → exit 0, sin errores. (Comando canónico del repo, según §1.5 de AGENTS.md; equivalente a `npx tsgo -p tsconfig.app.json --noEmit --incremental`.)
- **Comprobación estructural:** grep confirma las 8 referencias esperadas a `loadChatUrl` / `loadGitUrl` en `window_handlers.ts` (declaración, llamada en Ctrl+Shift+R/F5, llamada en Ctrl+R, llamada inicial).

## Pendiente (decisión de munix)

1. **Tests unitarios:** este cambio toca handlers de ventana sin cobertura de tests automáticos. AGENTS.md §1.1 marca los tests por slice como regla en piedra. Opciones:
   - Dejarlo cubierto solo con smoke manual (Ctrl+R → recargar chat sin pantalla negra).
   - Añadir test unitario con `vitest` sobre los handlers reusando la rama de build de `queryParam`.
2. **Smoke manual:** lanzar la app, abrir un chat real con Ctrl+R, comprobar que la URL que muestra DevTools conserva `?window=chat&appId=…&chatId=…` y que no hay error de local resource. La ventana de git viewer se cubre con el mismo flujo.
3. **Misma clase de bug, otros sitios:** no he auditado si el main window tiene un patrón equivalente al que no le afecta (la query es trivial: `?window=main`). Si quieres lo reviso en otra pasada.
4. **i18n / Trello / Worktrees:** no aplica a este cambio (código main-process, sin UI strings, sin tocar git ni card).
