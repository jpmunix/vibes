# Consultar conversaciones de Antigravity — `ag-chats.mjs`

> **CUÁNDO LEER ESTO:** Si necesitas datos de conversaciones pasadas o archivadas de Antigravity (del proyecto o de cualquier workspace) sin abrir la app — p. ej. munix está en el móvil y pide contexto de un chat anterior.
>
> **ESENCIA (si no lees más):** Usa `node scripts/ag-chats.mjs list` (vive en Vibes) para localizar conversaciones (devuelve `cascadeId`, título, última actividad, estado) y `show <cascadeId>` para leer el contenido. Es solo lectura sobre `~/.gemini/antigravity/`. El título que ves es el resumen autogenerado por Antigravity, no el primer prompt.

Para revisar los chats del proyecto (incluido el estado **archivado**) y el contenido de cada conversación **sin abrir Antigravity** — p. ej. cuando munix se va al móvil y el agente debe consultar datos de conversaciones pasadas — usar el script [`scripts/ag-chats.mjs`](file:///home/munix/Desarrollo/GitRepo/Vibes/scripts/ag-chats.mjs).

**Qué hace:** replica la lectura del tracker del proxy de Antigravity ([antigravity-tracker.ts](file:///home/munix/Desarrollo/GitRepo/antigravity-proxy/proxy/src/antigravity-tracker.ts)) sobre `~/.gemini/antigravity/` (los `.db` de conversaciones, el índice `.pb` para el estado archivado, y el `transcript.jsonl` para el contenido). Es **solo lectura**: no borra ni modifica nada de Antigravity.

## Uso (salida en JSON)

```bash
# Por defecto lista los workspaces activos del repo Vibes:
#   Vibes (corpus jpmunix/vibes), arneses (sin corpus, detectado por workspaceUri) y vibes-core.
node scripts/ag-chats.mjs list

# Todos los proyectos del workspace
node scripts/ag-chats.mjs list --all

# Otro proyecto concreto (uno o varios separados por coma)
node scripts/ag-chats.mjs list --project <nombre>
node scripts/ag-chats.mjs list --project cinco-villas,totem-admin

# Filtrar por estado
node scripts/ag-chats.mjs list --archived
node scripts/ag-chats.mjs list --active

# Leer el transcript de una conversación concreta (cascadeId = campo `cascadeId` del list)
node scripts/ag-chats.mjs show <cascadeId>

# Solo mensajes de usuario de una conversación
node scripts/ag-chats.mjs show <cascadeId> --type USER_INPUT

# Incluir también pasos de sistema/herramientas
node scripts/ag-chats.mjs show <cascadeId> --steps
```

> [!NOTE]
> El proyecto actual de trabajo se referencia como **Vibes** (corpus `jpmunix/vibes` / workspace `/Vibes`).
> **Ojo con `arneses`:** no tiene `corpusName` (campo vacío); se detecta por `workspaceUri` que termine en `/arneses`.
> Por defecto `list` devuelve los 3 workspaces activos del repo: Vibes, arneses y vibes-core.
> Para revisarlos, `list` es el primer paso (devuelve `cascadeId`, título, última actividad y `archived`), y `show` lee el contenido de una sola.
> El script depende de la CLI `sqlite3` del sistema (no usa `better-sqlite3`, que en Vibes está compilada para Electron).

> [!IMPORTANT]
> El campo `title` de cada conversación es el **resumen autogenerado por Antigravity** (el nombre que se ve en el panel izquierdo, p. ej. "Workspace Conversation Access"), leído del índice `agyhub_summaries_proto.pb`. No es un truncado del primer prompt.
> Si una conversación no tiene summary en el `.pb`, el script cae al primer `USER_INPUT` del transcript y, en última instancia, al `step_payload`.

## Checklist de cumplimiento

- [ ] ¿Usé `list` primero para localizar el `cascadeId` antes de `show`?
- [ ] Si busco en `arneses`: ¿recordé que se detecta por `workspaceUri`, no por corpus?
- [ ] ¿He tratado el script como solo lectura (sin intentar escribir/borrar en `~/.gemini/antigravity/`)?
