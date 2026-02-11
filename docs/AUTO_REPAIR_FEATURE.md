# Auto-Repair Runtime Errors — Documentación técnica

## Resumen

Feature que detecta errores de compilación del dev server (Vite) en tiempo real tras cada turno de la IA, y automáticamente dispara un nuevo mensaje de reparación para que la IA corrija el error sin intervención del usuario.

Adicionalmente, arranca silenciosamente el dev server de Vite al seleccionar una app (sin abrir el preview), para que la detección de errores esté disponible desde el primer momento.

---

## Arquitectura

```
┌─────────────────────────────────────────────────────┐
│                    MAIN PROCESS                     │
│                                                     │
│  app_handlers.ts                                    │
│  └─ listenToProcess()                               │
│     ├─ spawnedProcess.stdout → "app:output" (stdout)│
│     └─ spawnedProcess.stderr → "app:output" (stderr)│◄── Vite emite errores aquí
│                                                     │
└──────────────────────┬──────────────────────────────┘
                       │ IPC event: "app:output"
                       ▼
┌─────────────────────────────────────────────────────┐
│                   RENDERER PROCESS                  │
│                                                     │
│  layout.tsx (ROOT)                                  │
│  ├─ useAppOutputSubscription() ◄── SIEMPRE montado  │
│  │   └─ Recibe "app:output" → appConsoleEntriesAtom │
│  └─ useSilentAppStart() ◄── SIEMPRE montado         │
│      └─ Arranca ipc.app.runApp() silenciosamente    │
│                                                     │
│  ChatInput.tsx (RUTA /chat)                         │
│  ├─ useAutoRepair()                                 │
│  │   └─ Monitorea appConsoleEntriesAtom             │
│  │   └─ Detecta patrones de error                   │
│  │   └─ Llama streamMessage() para reparar          │
│  └─ useStreamChat({ autoRepair: ... })              │
│      └─ onEnd: activateMonitoring(chatId)           │
│      └─ onEnd (repair): onRepairStreamEnd()         │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## Archivos clave

| Archivo | Responsabilidad |
|---------|----------------|
| `src/atoms/autoRepairAtoms.ts` | Estado global: `autoRepairStateAtom` (watching, repairing, attempts, chatId, lastDetectedError), `silentlyStartedAppsAtom`, constantes `MAX_AUTO_REPAIR_ATTEMPTS` (2) y `AUTO_REPAIR_WATCH_WINDOW_MS` (8s) |
| `src/hooks/useAutoRepair.ts` | **Lógica principal.** Monitorea `appConsoleEntriesAtom` buscando patrones de error de Vite. Gestiona el ciclo: activar ventana → detectar error → disparar fix → verificar resultado |
| `src/hooks/useSilentAppStart.ts` | Arranca Vite en background cuando el usuario selecciona una app. Trackea apps ya arrancadas en `silentlyStartedAppsAtom` |
| `src/hooks/useStreamChat.ts` | Modificado para aceptar `autoRepair` callbacks. En `onEnd` llama `activateMonitoring()` o `onRepairStreamEnd()` |
| `src/components/chat/ChatInput.tsx` | Punto de integración: instancia `useAutoRepair()` y lo conecta con `useStreamChat()` |
| `src/components/AutoRepairToast.tsx` | Componente visual del toast (repairing/success/failed) |
| `src/lib/toast.tsx` | `showAutoRepairToast()` y `dismissAutoRepairToast()` con ID estable |
| `src/app/layout.tsx` | Monta `useSilentAppStart()` a nivel raíz |
| `src/lib/schemas.ts` | Setting `enableAutoRepairRuntimeErrors` (boolean, optional) |
| `src/main/settings.ts` | Default `enableAutoRepairRuntimeErrors: true` |

---

## Flujo detallado

### 1. Arranque silencioso (`useSilentAppStart`)

```
selectedAppIdAtom cambia (usuario selecciona app)
  │
  ├─ ¿enableAutoRepairRuntimeErrors === true? → SI
  ├─ ¿appUrlAtom ya tiene URL para esta app? → NO (no está corriendo)
  ├─ ¿silentlyStartedApps ya contiene esta app? → NO
  │
  └─ ipc.app.runApp({ appId })  ← silencioso, sin UI
     Resultado: el dev server empieza a emitir stdout/stderr vía "app:output"
```

### 2. Activación del monitoreo (`activateMonitoring`)

```
useStreamChat.onEnd recibe ChatResponseEnd
  │
  ├─ response.updatedFiles === true
  │   ├─ (existente) refreshAppIframe(), checkProblems()
  │   │
  │   └─ (NUEVO) ¿autoRepair.isRepairing?
  │       ├─ SI  → autoRepair.onRepairStreamEnd(true)
  │       └─ NO  → autoRepair.activateMonitoring(chatId)
  │
  └─ response.updatedFiles === false && isRepairing
      └─ autoRepair.onRepairStreamEnd(false)
```

`activateMonitoring()` hace:
1. Guarda un snapshot de `consoleEntries.length` → solo mira entradas NUEVAS
2. Setea `watching: true` en `autoRepairStateAtom`
3. Programa un timer de 8 segundos para cerrar la ventana automáticamente

### 3. Detección de errores (efecto reactivo en `useAutoRepair`)

```
appConsoleEntriesAtom cambia (nueva entrada de stderr llega)
  │
  ├─ ¿watching === true? → SI
  ├─ ¿repairing === false? → SI
  ├─ ¿attempts < MAX_AUTO_REPAIR_ATTEMPTS (2)? → SI
  ├─ ¿No hay stream en progreso? → SI
  │
  └─ Para cada entrada NUEVA (después del snapshot):
     ├─ ¿entry.level === "error"? → SI
     ├─ ¿entry.appId === selectedAppId? → SI
     ├─ ¿isCompilationError(entry.message)? → SI
     │
     └─ ¡ERROR DETECTADO!
        ├─ Cancelar timer de ventana
        ├─ watching=false, repairing=true, attempts++
        ├─ showAutoRepairToast({ status: "repairing" })
        └─ streamMessageRef.current({ prompt: "Fix this error...", chatId, isSystemPrompt: true })
```

### 4. Patrones de detección

**Patrones que disparan reparación** (`ERROR_PATTERNS`):
```
"Failed to resolve import"
"Module not found"
"SyntaxError:"
"[vite] Internal server error"
"✘ [ERROR]"
"error TS"
"Cannot find module"
"is not defined"
"Unexpected token"
"Failed to parse source"
"Transform failed"
"Build failed"
"Could not resolve"
"does not provide an export named"
"is not exported from"
```

**Patrones ignorados** (`IGNORE_PATTERNS`):
```
"npm warn", "npm notice", "WARN deprecated", "peer dep missing",
"ExperimentalWarning", "DeprecationWarning", "node --trace-deprecation",
"hmr update", "page reload", "optimized dependencies changed",
"new dependencies optimized", "Pre-bundling"
```

### 5. Verificación post-reparación (`onRepairStreamEnd`)

```
Repair stream termina → onEnd de useStreamChat
  │
  ├─ updatedFiles === true
  │   ├─ Snapshot nuevo de consoleEntries.length
  │   ├─ ¿attempts < MAX? 
  │   │   ├─ SI → Re-activar monitoring (watching=true, timer 8s)
  │   │   │       Si 8s sin error nuevo → showAutoRepairToast({ status: "success" })
  │   │   └─ NO → showAutoRepairToast({ status: "failed" })
  │   │
  │   └─ (Si se detecta OTRO error durante la nueva ventana, se repite el ciclo)
  │
  └─ updatedFiles === false
      └─ showAutoRepairToast({ status: "failed" })
```

### 6. Reset

El estado se resetea cuando:
- El usuario envía un nuevo mensaje (no `isSystemPrompt`) → `resetAutoRepair()`
- Se alcanza `MAX_AUTO_REPAIR_ATTEMPTS` (2)
- La reparación tiene éxito (8s sin nuevos errores)

---

## Protecciones anti-loop

1. **`MAX_AUTO_REPAIR_ATTEMPTS = 2`** — máximo 2 intentos por ciclo de mensaje del usuario
2. **`AUTO_REPAIR_WATCH_WINDOW_MS = 8000`** — la ventana de monitoreo se cierra sola tras 8s
3. **`lastDetectedError`** — no re-dispara el exact mismo error
4. **`isRepairing` flag** — no arranca reparación si ya hay una en progreso
5. **`isStreamingById`** — no arranca reparación si hay stream activo en el chat
6. **`isSystemPrompt: true`** — los mensajes de reparación NO resetean el estado
7. **`pendingStreamChatIds`** (en `useStreamChat`) — previene streams duplicados

---

## Setting

| Campo | Tipo | Default | Descripción |
|-------|------|---------|-------------|
| `enableAutoRepairRuntimeErrors` | `boolean` | `true` | Controla tanto la auto-reparación como el arranque silencioso |

Definido en:
- Schema: `src/lib/schemas.ts` → `UserSettingsSchema`
- Default: `src/main/settings.ts` → `DEFAULT_SETTINGS`

**Nota:** Actualmente no hay toggle en la UI de settings. Para desactivar, el usuario debe editar `user-settings.json` manualmente o se puede añadir un switch similar a `AutoFixProblemsSwitch.tsx`.

---

## Debugging

### Logs de consola

El sistema emite logs en la consola del renderer:
```
[AutoRepair] Detected compilation error (attempt 1/2): Failed to resolve import...
[SilentAppStart] Starting app 5 silently...
[SilentAppStart] App 5 started successfully in background
[AutoRepair] streamMessage not registered. Cannot trigger repair.
```

### Inspeccionar estado

Desde React DevTools, buscar el atom `autoRepairStateAtom`:
```ts
{
  watching: boolean,    // ¿Estamos en ventana de monitoreo?
  repairing: boolean,   // ¿Hay un stream de reparación activo?
  attempts: number,     // Intentos realizados en este ciclo
  chatId: number|null,  // Chat donde se está reparando
  watchStartedAt: number|null, // Timestamp del inicio del monitoreo
  lastDetectedError: string|null // Último error detectado
}
```

### Problemas comunes

| Síntoma | Causa probable | Solución |
|---------|---------------|----------|
| No se detectan errores | `enableAutoRepairRuntimeErrors` está `false` | Verificar settings |
| No se detectan errores | La app no está corriendo (Vite no arrancó) | Verificar que `useSilentAppStart` se ejecutó o arrancar preview manualmente |
| No se detectan errores | El patrón de error no está en `ERROR_PATTERNS` | Añadir el patrón nuevo a la lista |
| Se detecta pero no repara | `streamMessageRef.current` es `null` | Verificar que `setStreamMessage` se llama en `ChatInput` via `useEffect` |
| Loop infinito de reparaciones | Imposible (máx 2), pero si sucede | `MAX_AUTO_REPAIR_ATTEMPTS` en `autoRepairAtoms.ts` |
| Falsos positivos | Un stderr normal matchea `ERROR_PATTERNS` | Añadir el patrón a `IGNORE_PATTERNS` |
| Toast no desaparece | Timer de toast no funciona | `dismissAutoRepairToast()` usa `toast.dismiss(AUTO_REPAIR_TOAST_ID)` |
| Arranque silencioso falla | Error de `runApp` (falta `package.json`, etc.) | Se silencia con `catch`; verificar logs |

### Testing manual

1. Crear una app nueva y arrancarla (o dejar que arranque silenciosamente)
2. Pedirle a la IA que cree un componente
3. Manualmente editar un archivo para introducir un error (ej: borrar un import)
4. Enviar un mensaje nuevo a la IA
5. Tras el `onEnd`, Vite detecta el error en <500ms
6. Debería aparecer el toast "🔧 Reparando automáticamente..."
7. La IA debería enviar un fix y el toast cambiar a "✅ Error reparado"

---

## Posibles mejoras futuras

- [ ] **Toggle en Settings UI**: Añadir un switch para `enableAutoRepairRuntimeErrors` en la página de ajustes
- [ ] **Detección de errores del iframe**: Combinar stderr con errores de runtime del iframe (`window-error`, `build-error-report`) para mayor cobertura
- [ ] **Ajustar patterns**: Los patrones de error son heurísticos; se pueden refinar con datos reales de uso
- [ ] **Métricas**: Trackear tasa de éxito de auto-reparación via PostHog
- [ ] **Timeout configurable**: Exponer `AUTO_REPAIR_WATCH_WINDOW_MS` como setting
- [ ] **Preview del fix**: Mostrar qué archivos cambió la IA en el toast de éxito
