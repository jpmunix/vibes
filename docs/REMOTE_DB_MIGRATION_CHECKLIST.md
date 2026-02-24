# Checklist de Migración a la Base de Datos Remota
**Progreso actual: Fase 3 Completada**

## Fase 1 y 2: Autenticación y Esquemas
- [x] Configuración inicial e integración de Bunny SQLite (Tokens y URLs).
- [x] Implementación y despliegue del esquema remoto (`remote-schema.ts`).
- [x] Scripts de sincronización inicial y migración de datos (Firebase a LibSQL).
- [x] Autenticación dual (local/remota).

## Fase 3: Migración de los Handlers IPC (Completada)
- [x] **`mcp_tools.ts`**: Migrado `db.select().from(mcpServers)` a `getRemoteDb()`.
- [x] **`tool_definitions.ts`**: Migrado `db.query.apps.findFirst` a `getRemoteDb()`.
- [x] **`message_persistence.ts`**: Migrado esquema `messages` a `getRemoteDb().update(remoteSchema.messages)`.
- [x] **`ai_messages_cleanup.ts`**: Limpieza de JSON de IA usando `getRemoteDb()`.
- [x] **`set_chat_summary.ts`**: Actualizaciones de `title` de los chats de la DB remota.
- [x] **`read_logs.ts`**: Migrados los logs de acceso de chat.
- [x] **`local_agent_handler.ts`**: Orquestación y persistencia de mensajes del agente unificados hacia la nube.
- [x] **`context_paths_handlers.ts`**: Rutas de contexto.
- [x] **`import_handlers.ts`**: Creación de aplicaciones y recursos desde importaciones.
- [x] **`chat_handlers.ts` y `chat_stream_handlers.ts`**: Flujos principales de chat en remoto.
- [x] **`debate_handlers.ts` y `debate_stream_handlers.ts`**: Funcionalidad de debates en remoto.
- [x] **`knowledge_handlers.ts`**: Vectorizaciones y almacenamiento de conocimiento migrado.
- [x] **`token_stats_handlers.ts` y `ai_query_logs.ts`**: Inserción de logs de IA con rotación FIFO (threshold) adaptada a esquema de nube.
- [x] **`settings_handlers.ts`**: Sincronización bidireccional y guardado en tabla remota `userSettings`.
- [x] **Migración Backup ➔ Dossiers (`dossier_handlers.ts`)**: 
  - Extracción automática e interactiva hacia `.zip`.
  - Integración nativa a **Bunny Storage** basándose en la configuración individual del app (`bunnyConfig`).
  - Tabla `dossiers` mapeada a storagePath de Bunny.net.
  - Eliminada la copia de seguridad SQLite local depreciada en `backup_handlers.ts`.

## Fases Pendientes (Avanzar)
### Fase 4: Integración del Frontend y Pulido
- [x] Actualizar componentes React/Jotai que asuman datos estrictamente locales.
- [x] Conectar la UI de Dossiers (`BackupModal.tsx` o nuevo `DossiersModal.tsx`) para usar el IPC de `dossier_handlers.ts` en lugar de listar en Firebase Storage.
- [x] Ajustar estados de carga en frontend al comunicarse con DB en la nube.
- [x] Probar bidireccionalidad de `settings`.

### Fase 5: Limpieza Estructural ("Sunset" Local)
- [ ] Revisión final y eliminación de `@/db/schema.ts` (esquema SQLite local).
- [x] Retirar dependencias y código de `better-sqlite3` relacionadas con los handlers V2.
- [ ] Eliminar librerías y componentes viejos de Firebase (si no se usan para nada más).
- [ ] Tests End-to-End con el modelo remoto (ajuste de mocks final).
