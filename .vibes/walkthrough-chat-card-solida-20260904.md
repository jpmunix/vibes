# Change Summary: Card de usuario sólida sin alpha

## Resumen para el usuario
- La card del mensaje del usuario usaba `bg-primary/15` con transparencia y se mezclaba visualmente con el contenido del agente.
- Ahora la card es sólida con el color de superficie del tema (`bg-card`), con borde y sombra sutil, sin transparencias.
- El layout limpio se mantiene: usuario en card de punta a punta, agente sin burbuja, sin avatares.

## Desglose técnico
- Archivo modificado:
  - `/home/munix/Desarrollo/GitRepo/Vibes/src/components/chat/ChatMessage.tsx` (línea ~669): clase de la card de usuario cambiada de `bg-primary/15 dark:bg-primary/15 border border-primary/25 dark:border-primary/20` a `bg-card text-card-foreground border border-border shadow-sm`.
  - No se toca la rama de error (`isFixError` sigue en rosa) ni la rama del asistente (`w-full py-1`, sin card).
- Archivos creados/eliminados: ninguno.
- Tokens usados: `--card`, `--card-foreground` y `--border` definidos en `src/styles/globals.css` y `src/styles/themes.css`, sólidos en claro y oscuro.

## Verificación
- Edición aplicada con éxito (1 reemplazo confirmado por el diff de la herramienta).
- Pendiente de verificación visual por tu parte: recargar Vibes y comprobar que la card del usuario ya no transparenta el texto del agente en claro y oscuro.

## Próximos pasos / notas
- Si la card sólida se ve demasiado plana o demasiado elevada frente al fondo, ajustar solo `border-border` o `shadow-sm`, sin volver a alphas de `primary`.
- Si quieres el mismo acabado en el input o en otras cards del chat, aplicarlo como tarea aparte.
