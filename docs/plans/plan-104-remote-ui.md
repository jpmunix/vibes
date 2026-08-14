# Plan: #104 Interfaz remota web desde el móvil (QR + IP local)

> **Documento vivo.** Se actualiza con cada sub-slice.
> **Trigger:** Card #104 en To-do.
> **Branch:** `feature/vibes-core`

---

## Contexto

ZCode ya tiene control remoto vía SaaS (tunnel a internet en `zcode.z.ai/remote/v4`). Esta card es **local-only**: el móvil y el PC en la misma WiFi, sin terceros, sin HTTPS, sin túnel.

**Lo que ya existe:**
- `server/src/` — Fastify + Socket.io que replica el sistema IPC de Electron main
- `POST /api/ipc/:channel` ya expone los handlers de chat/runtime/persistencia
- `Socket.io` para stream de respuestas en tiempo real (patrón `io.to(userId).emit()`)
- `server/src/hooks.mjs` — shim de Electron que registra handlers en `globalThis.__vibesIpcRegistry`

**Lo que NO existe todavía:**
- El server no se arranca desde el proceso principal de Electron
- No hay generación de QR
- No hay UI web mínima para el móvil
- No hay panel de control en Vibes para activar/gestionar la interfaz remota

---

## Arquitectura objetivo

```
PC (Electron main)
  └── RemoteUiServer (puerto 4847, auto-arrancado)
        ├── GET /               → UI web mínima (single HTML file)
        ├── GET /api/health     → Health check
        ├── POST /api/ipc/:ch   → handlers IPC existentes (ya existe)
        └── Socket.io /         → stream de respuestas (ya existe)

Móvil → Navegador → http://IP:4847 → UI web mínima
```

**Diferencia con Vibes Cloud:** aquí no hay auth OAuth, no hay túnel, no hay dominio. Solo LAN.

---

## Sub-slices (orden estricto, cada una verde antes de la siguiente)

```
3.1 [server基础的] → 3.2 [Electron arranca server] → 3.3 [QR + panel Vibes] → 3.4 [UI web móvil] → 3.5 [auth local] → 3.6 [tests]
```

---

### 3.1 — Base del servidor local (`server/src/`)

**Objetivo:** Aislar la lógica del server web en un módulo reutilizable que pueda importarse desde Electron main process.

**Nuevo archivo:** `src/ipc/remote_ui_server.ts`

| Export | Responsabilidad |
|--------|-----------------|
| `startRemoteUiServer(port?: number)` | Levanta Fastify + HTTP + Socket.io, devuelve `{port, server, io}` |
| `stopRemoteUiServer()` | Cierra el servidor |
| `getLocalIpAddress(): string` | Detecta la IP local (WiFi/Ethernet) |
| `generateQrCode(text: string): Promise<string>` | Genera QR como data URL (usa `qrcode` npm) |
| `LocalUiConfig` (type) | `{ port, ip, qrDataUrl, token, active }` |

**Dependencias nuevas** (añadir a `package.json` de Vibes):
- `qrcode` — generación de QR

**Puerto:** usar `4847` hardcoded (está libre en el rango 4800-4899).

**Verificación:**
- `tsc --noEmit` pasa en `src/ipc/remote_ui_server.ts`
- `import { startRemoteUiServer } from "./src/ipc/remote_ui_server"` no da errores de types

**Criterio de aceptación:**
- Módulo exportable sin efectos secundarios (no levanta servidor al importar)
- `getLocalIpAddress()` devuelve una IP no-loopback

---

### 3.2 — Electron arranca el server

**Objetivo:** El main process de Electron puede levantar y parar el servidor local bajo demanda.

**Cambios en `src/main.ts`:**
- Añadir flag `--remote-ui` que levanta el servidor al arrancar
- Añadir variable de estado `remoteUiServer: {port, io} | null`
- Crear command handler `remote-ui:start` → `startRemoteUiServer()`
- Crear command handler `remote-ui:stop` → `stopRemoteUiServer()`
- Crear command handler `remote-ui:status` → `{active, port, ip, qrDataUrl}`
- Al hacer `app.on("will-quit")` → parar el servidor si está activo

**IPC channels nuevos:**

| Channel | Args | Returns |
|---------|------|---------|
| `remote-ui:start` | `{}` | `{port, ip, qrDataUrl}` |
| `remote-ui:stop` | `{}` | `{ok: true}` |
| `remote-ui:status` | `{}` | `LocalUiConfig` |

**Criterio de aceptación:**
- `npm run start -- --remote-ui` levanta el servidor
- `npm run start` (sin flag) no levanta el servidor
- Health check `curl http://localhost:4847/api/health` devuelve 200

---

### 3.3 — Panel de control en Vibes (QR + toggle)

**Objetivo:** Un panel/modal en la UI de Vibes que permita activar la interfaz remota, mostrar el QR y el estado.

**Nuevo componente:** `src/components/remote/RemoteUiPanel.tsx`

**Ubicación UI:** Añadir en el header-bar de la app ( junto al icono de ajustes) un botón con icono WiFi/QR. Al hacer click se abre el panel.

**El panel muestra:**
- Toggle ON/OFF para activar/desactivar
- Si activo: IP:puerto + QR code (imagen PNG en data URL)
- Botón "Copiar URL" → copia `http://IP:PORT?token=TOKEN`
- Indicador de estado: "Servidor parado" / "1 cliente conectado"

**Comunicación con main process:** usa los IPC channels de 3.2.

**Criterio de aceptación:**
- Toggle funciona y levanta/parece el servidor
- QR es escaneable y la URL contiene el token
- Al hacer click en "Copiar URL" el portapapeles tiene la URL correcta

---

### 3.4 — UI web mínima para el móvil

**Objetivo:** Una única página HTML/CSS/JS servida por el mismo server en `GET /`.

**Archivo:** `public/remote-ui/index.html`

**Funcionalidad (scope estricto):**

| Vista | Descripción |
|-------|-------------|
| **Login** | Pide el token (o lo lee de `?token=` en la URL). Sin token muestra input para pegarlo. |
| **Chat list** | Lista de conversaciones (nombre + fecha). Click → abre chat. |
| **Chat view** | Historial + input de texto + botón enviar. Stream SSE de respuestas. |
| **Model selector** | Dropdown con modelos disponibles (pide `/api/ipc/model:list`). |

**Streams:** el chat usa `EventSource` (SSE) conectado a `/socket.io/` para recibir los chunks del stream. Al enviar un mensaje, hace `POST /api/ipc/agent:sendMessage`.

**Auth local:**
- El token se genera al activar la interfaz (3.5)
- Se pasa como query param: `http://IP:4847?token=XXXX`
- El server valida el token en cada request Socket.io y HTTP

**Responsive:** funciona en móvil (320px+) y desktop. Touch-friendly. Sin dependencias externas ( vanilla JS, CSS inline).

**Criterio de aceptación:**
- El QR abre la UI web en el móvil
- Se puede ver la lista de chats
- Se puede continuar un chat existente y recibir respuestas en stream
- Se puede cambiar de modelo desde el dropdown

---

### 3.5 — Auth local (token)

**Objetivo:** Generar y validar un token para la conexión local.

**Nuevo archivo:** `src/ipc/remote_ui_auth.ts`

| Función | Responsabilidad |
|---------|-----------------|
| `generateLocalToken(): string` | Genera un token aleatorio (32 chars, base64url) |
| `validateLocalToken(token: string): boolean` | Compara con el token activo |
| `getActiveToken(): string \| null` | Devuelve el token activo (o null si server parado) |

**Integración:**
- `remote_ui_server.ts` recibe `token` en `startRemoteUiServer(options: {token})`
- El token se genera en el handler `remote-ui:start` y se guarda en module scope
- Socket.io valida el token en handshake (en `io.use()` middleware)
- HTTP: header `Authorization: Bearer TOKEN` o query param `?token=TOKEN`

**QR content:** `http://IP:4847?token=XXXX` (el token va en la URL para que sea cómodo escanear)

**Criterio de aceptación:**
- Sin token (o token incorrecto) → conexión rechazada
- Con token correcto → conexión aceptada
- Token regenerate cada vez que se reinicia el server

---

### 3.6 — Tests y verificación

**Tests nuevos:**

| Archivo | Qué cubre |
|---------|-----------|
| `src/ipc/remote_ui_server.test.ts` | `getLocalIpAddress()` (devuelve IP válida), `generateQrCode()` (devuelve data URL), módulo sin side-effects al importar |
| `src/ipc/remote_ui_auth.test.ts` | `generateLocalToken()` (longitud, unicidad), `validateLocalToken()` (ok/error) |
| `src/components/remote/RemoteUiPanel.test.tsx` | Toggle ON/OFF, muestra QR cuando activo, copia URL |

**Verificación manual (smoke test):**
1. Arrancar Vibes con `--remote-ui`
2. Abrir panel → activar toggle → QR aparece
3. Escanear QR con el móvil → UI web se abre
4. Ver lista de chats → continuar uno → recibir respuesta en stream
5. Cambiar modelo → verificar que cambia
6. Apagar toggle → QR desaparece → móvil pierde conexión

**Criterio de aceptación:**
- Tests verdes
- Smoke test manual pasa

---

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| `getLocalIpAddress()` devuelve una IP incorrecta (Docker bridge, VPN) | En 3.1, verificar que la IP es reachable desde otro dispositivo en la misma LAN. Añadir fallback manual si falla. |
| El puerto 4847 está ocupado | Usar `findFreePort()` (ya existe en `shared/ports.ts`) con fallback a rango 4850-4899 |
| Socket.io SSE para stream no funciona igual que el WebSocket de Electron | Verificar que los handlers que usan `sender.send()` (fakeEvent.sender.send) emiten correctamente por Socket.io (ya implementado en `ipc.ts`) |
| QR code library (`qrcode`) no es compatible con Bun/Node ESM | Usar versión latest y testar en Bun (el runtime de dev) |
| La UI web mínima se queda grande (CSS/JS inline en un solo file) | Limitar scope: solo 3-4 vistas, 0 dependencias, < 50KB total |

---

## Orden de revisión con munix

| Slice | Qué pido a munix |
|-------|-----------------|
| 3.1 | OK para crear `src/ipc/remote_ui_server.ts` + añadir `qrcode` a deps |
| 3.2 | OK para modificar `src/main.ts` con los nuevos IPC channels |
| 3.3 | OK para crear `RemoteUiPanel.tsx` y añadirlo al header de la app |
| 3.4 | Revisar scope de la UI web (¿falta algo? ¿sobra algo?) |
| 3.5 | OK para el enfoque de auth (token en URL) |
| 3.6 | OK final para smoke test manual |

---

**Última actualización:** 2026-08-13
**Mantenedor:** agent (bajo supervisión munix)
