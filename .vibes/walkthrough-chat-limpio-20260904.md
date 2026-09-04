# Change Summary: Layout de chat limpio sin avatares

## Resumen para usuario
Se ha simplificado el layout del chat al estilo de la app de referencia: sin avatares de usuario ni de agente, mensaje de usuario en card de punta a punta del contenedor, y mensajes del agente como texto plano sin burbuja ni card. Se mantiene el resto de funcionalidad (colapso de mensajes largos, copiar, citar, compartir, badges de modelo).

## Desglose técnico
### Archivos modificados
- `src/components/chat/ChatMessage.tsx`:
  - Eliminados imports `SimpleAvatar`, `VibesAvatar`, `User as UserIcon`, `userAtom` / `VibesUser`, `formatDistanceToNow`, estado `isCollapsed`.
  - Eliminada prop `user` del componente y lógica `activeUser`.
  - Eliminado bloque de avatar + spacer `w-7` equilibrador y `marginLeft: 100px` de usuario.
  - Contenedor de contenido: usuario pasa de `flex justify-end` con ancho `w-fit` a `flex justify-stretch` + `w-full items-stretch`.
  - Card de usuario: `w-full rounded-lg` (antes `w-fit`), mantiene `bg-primary/15` con borde.
  - Asistente: sin card, solo `py-2` (antes `px-4 py-3 bg-background-lightest border`). Eliminado `hover:bg-secondary/20` envolvente y capa extra.
  - Toolbar de acciones de usuario reposicionada a `absolute right-2 -top-2 -translate-y-full` dentro de wrapper `relative` para no salirse del contenedor tras quitar el avatar.
  - Eliminado `isFixError` duplicado, recuperado comentario original de errores persistidos.
- `src/components/chat/MessagesList.tsx`:
  - Eliminado `import { userAtom }`, `const user = useAtomValue(userAtom)` y prop `user={user}` a `MemoizedChatMessage`.
- Otros consumidores verificados sin cambios necesarios: `src/components/chat/ChatPreviewThread.tsx` y `src/components/message_window/MessageWindowApp.tsx` ya usaban `ChatMessage` sin prop `user`.

### Archivos creados / eliminados
- Ninguno.

## Verificación
- `pnpm ts:main` (`npx tsgo -p tsconfig.app.json --noEmit --incremental`): exit 0, sin errores.
- `git diff` revisado: solo `ChatMessage.tsx` y `MessagesList.tsx` tocados, -58/+18 aprox en ChatMessage.
- Pendiente verificación visual manual por munix en Electron (modo claro/oscuro, mensajes largos con colapso, sticky de usuario).

## Próximos pasos / consideraciones
- Probar hover de toolbar en mensajes de usuario pegados al borde superior (sticky `top-0` + toolbar `-translate-y-full` podría recortarse; si molesta, mover a inline o con margen).
- Valorar quitar `px-4` extra de `MessagesList` para asistente si se quiere aún más ancho de texto, y revisar `ChatPreviewThread` que aún envuelve en `rounded-2xl p-1`.
- `SimpleAvatar` / `VibesAvatar` siguen en uso en sidebar, ProfileModal y AdminListApps, no se eliminan.
