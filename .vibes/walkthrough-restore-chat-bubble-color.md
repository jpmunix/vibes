# Change Summary: Restaurar color de acento en la burbuja del chat

## Resumen para el usuario
Se ha restaurado el fondo traslúcido con el color de acento (`bg-primary/15 border-primary/25`) en las burbujas de los mensajes del usuario en el chat, eliminando la clase `bg-background` que forzaba el fondo blanco opaco e impedía ver el color característico.

## Desglose técnico de archivos
- **Modificado**: `src/components/chat/ChatMessage.tsx`
  - Se removió `bg-background rounded-xl shadow-sm` del contenedor envolvente para que la clase `bg-primary/15 dark:bg-primary/15` vuelva a ser visible.

## Verificación
- Verificación estática con `pnpm ts:main` ejecutada exitosamente sin errores de compilación ni tipos.
