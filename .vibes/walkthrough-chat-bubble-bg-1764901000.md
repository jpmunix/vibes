# Change Summary: Restaurar fondo opaco en la burbuja del usuario

## Resumen para el usuario
Se restauró la capa de fondo opaco (`bg-background`) debajo de la burbuja translúcida del usuario (`bg-primary/15`). Esto mantiene el color de acento característico sin que se trasluzca el texto del agente ni el contenido que quede por detrás en el scroll o renderizado.

## Detalle técnico de cambios
- **`src/components/chat/ChatMessage.tsx`**:
  - Se reincorporó `className={isUser ? "bg-background rounded-xl shadow-sm" : ""}` en el contenedor de la burbuja del usuario.
  - La burbuja interior conserva `bg-primary/15 dark:bg-primary/15` con su borde de acento, renderizando sobre una base sólida opaca del tema.

## Verificación realizada
- `pnpm ts:main`: 0 errores de TypeScript (`npx tsgo -p tsconfig.app.json --noEmit --incremental`).
