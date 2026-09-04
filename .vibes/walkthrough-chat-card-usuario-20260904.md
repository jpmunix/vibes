# Change Summary: Card de usuario restaurada al color original

## Resumen para el usuario
- La burbuja del usuario vuelve a su color original (`bg-primary/15` con borde `border-primary/25`), sin transparencias raras ni mezcla con el texto del agente.
- El layout limpio se mantiene: mensajes del usuario en card de punta a punta y mensajes del agente sin burbuja ni avatares.
- Se reparó un daño colateral en el visor del panel admin, que había quedado con código copiado a medias y rompía la compilación.

## Desglose técnico
- Modificado: `src/components/chat/ChatMessage.tsx`
  - Card de usuario: `rounded-xl w-full px-4 py-3 bg-primary/15 dark:bg-primary/15 border border-primary/25 dark:border-primary/20`.
  - Se mantiene el caso de error `Fix error:` con fondo rose y borde rose.
  - Los mensajes del asistente siguen sin card (`w-full py-1`), salvo error.
- Modificado: `src/components/admin_window/AdminListApps.tsx`
  - Se añadió `isFixError` local (faltaba y rompía el build).
  - Se añadió manejador local de copiar mensaje de usuario con `navigator.clipboard` y estado `userCopied`.
  - Se eliminó el botón de citar copiado por error (ese panel no tiene quote).
  - Se añadieron los iconos `Copy`/`Check` que faltaban.
  - Se corrigió el orden de hooks: el `return` temprano de modo zen ahora va después de todos los hooks.

## Verificación
- `pnpm ts:main` en `/home/munix/Desarrollo/GitRepo/Vibes`: exit 0, sin errores.
- `git diff` confirma cambios acotados a `ChatMessage.tsx` y `AdminListApps.tsx`.

## Notas
- Si `bg-primary/15` sigue pareciendo tenue en algún tema concreto, el siguiente paso sería ajustar el token del tema, no meter alpha en la card.
