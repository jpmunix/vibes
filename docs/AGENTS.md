# Repository Agent Guide — minube-vibes

This is an **Electron desktop application** that acts as a developer workspace with AI chat, project management, Git tools, and database inspection.

---

## Agentes disponibles

Usa el agente apropiado según la tarea:

- **`coder`** (Haiku, máx. 6 pasos) — tareas puntuales: añadir un campo, arreglar un bug, actualizar una query. **Usa este por defecto.**
- **`architect`** (Sonnet, máx. 20 pasos) — refactoring amplio, cambios de arquitectura, análisis de dependencias entre sistemas.

---

## Reglas de rendimiento (CRÍTICO)

- **NO leas todos los archivos de un directorio.** Usa `grep`/`search` primero para localizar el objetivo.
- **NO hagas más de 2 búsquedas** si ya tienes el archivo objetivo.
- **Lee solo los archivos estrictamente necesarios** para completar la tarea.
- Para tareas claras y acotadas, **actúa directamente** sin explorar el codebase entero.

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Runtime | Electron |
| Frontend | React + TanStack Router + TanStack Query |
| Estado global | Jotai atoms |
| Base de datos local | SQLite + Drizzle ORM |
| Estilos | Vanilla CSS con variables de tema |
| Build | Vite + Electron Forge |
| Tests E2E | Playwright |

---

## Arquitectura IPC (Electron)

Esta es la frontera más importante del proyecto. Respétala siempre.

1. **`src/ipc/ipc_client.ts`** — corre en el renderer. Accede vía `IpcClient.getInstance()`. Expón métodos dedicados por canal IPC.
2. **`src/preload.ts`** — allowlist del renderer. Toda nueva API IPC debe añadirse aquí.
3. **`src/ipc/ipc_host.ts`** — registra handlers que viven en `src/ipc/handlers/`.
4. Los handlers deben lanzar `throw new Error("...")` en fallo. **No** usar `{ success: false }`.

### Archivos de referencia rápida

| Necesito... | Leo... |
|---|---|
| Estructura de la DB | `src/db/schema.ts` (local) o `src/db/remote-schema.ts` (Supabase) |
| Añadir canal IPC | `src/ipc/ipc_client.ts` + `src/preload.ts` + `src/ipc/ipc_host.ts` |
| Integración con el chat AI | `src/ipc/handlers/opencode_adapter.ts` |
| Query keys de React Query | `src/lib/queryKeys.ts` |
| Rutas de la app | `src/router.ts` |

---

## Modelo de datos

Genera migraciones SQL **siempre** con:

```sh
npm run db:generate
```

**NUNCA escribas archivos de migración a mano.**

---

## React + IPC — Patrón estándar

- **Reads:** `useQuery` con keys del factory `queryKeys` → `queryFn` async que llama al `IpcClient`.
- **Writes:** `useMutation` → valida localmente → llama IPC → invalida queries en `onSuccess`.
- **Sincronización con Jotai:** solo mediante `useEffect` si es estrictamente necesario.

### React Query key factory

```ts
import { queryKeys } from "@/lib/queryKeys";

// En useQuery:
useQuery({
  queryKey: queryKeys.apps.detail({ appId }),
  queryFn: () => IpcClient.getInstance().getApp(appId),
});

// Invalidar:
queryClient.invalidateQueries({ queryKey: queryKeys.apps.all });
```

Para añadir nuevas keys, sigue el patrón existente en `src/lib/queryKeys.ts` (`all` + factory functions con parámetros objeto).

---

## Setup inicial

```sh
npm install
npm run init-precommit   # configura hooks de pre-commit
```

---

## Checks antes de commit

```sh
npm run fmt        # formateo
npm run lint       # lint
npm run lint:fix   # auto-fix de lint
npm run ts         # type-check
```

Si tienes acceso al skill `/vibes:lint`, úsalo directamente — ejecuta todos estos pasos.

---

## Tests

- **Unit tests:** para lógica de negocio pura y funciones utilitarias.
- **E2E tests (Playwright):** para flujos completos de usuario. Preferibles cuando habría muchos mocks.
- No escribas más de 1-2 casos E2E por feature (alto coste por caso).

**IMPORTANTE:** Los E2E corren contra el binario compilado. Antes de correr E2E, siempre ejecuta:

```sh
npm run build
```

Ejecutar E2E:

```sh
PLAYWRIGHT_HTML_OPEN=never npm run e2e
```

Con logs de debug:

```sh
DEBUG=pw:browser PLAYWRIGHT_HTML_OPEN=never npm run e2e
```

---

## Seguridad Electron

- No uses `remote`. Valida/lockea por `appId` al mutar recursos compartidos.
- No expongas APIs de Node.js sin validación en el preload.
- Nombres de módulos y funciones descriptivos que reflejen la semántica del canal IPC.
