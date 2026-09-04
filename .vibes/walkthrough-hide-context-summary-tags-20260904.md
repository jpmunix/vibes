# Change Summary: ocultar [Previous Turn Context Summary] en la UI

## Resumen para el usuario
- En los mensajes del agente se veía un pegote al final con
  `[Previous Turn Context Summary]` y debajo `Read: … / Listed: … / Modified: …`.
- Ese texto es **memoria de trabajo para el LLM** (el bridge lo inyecta en la
  hidratación del prompt para que no repita exploración), no contenido para el
  usuario. El modelo a veces lo reproduce al final de su respuesta y esa
  réplica persistía en Bunny y se pintaba como prosa.
- Ahora se filtra antes de renderizar, de modo que la UI solo muestra la
  respuesta real.

## Desglose técnico
- Archivo modificado:
  - `src/components/chat/normalizeMessageContent.ts`:
    - Nuevas export `stripPreviousTurnSummary(text)`: corta el mensaje en el
      marcador `[Previous Turn Context Summary]` y limpia el sangrado sobrante
      (los `\n\n` previos). Sin marcador → devuelve el texto intacto.
    - `normalizeMessageContent` ahora compone
      `stripPreviousTurnSummary(stripDsmlToolCallBlocks(normalizeLegacyTags(...)))`.
- Archivo de tests:
  - `src/components/chat/normalizeMessageContent.test.ts`: 2 tests nuevos
    (elimina el bloque al final conservando la prosa; no toca texto sin
    marcador).
- Por qué aquí y no en el parser: la TAG `<vibes-context-summary>` **ya** está
  en la lista de ocultas de `VibesMarkdownParser` / worker / `ChatMessage`.
  Lo que se veía era la réplica en **texto plano** que el LLM copia del prompt,
  y el único punto que limpia `message.content` antes de pintarlo (y no toca el
  prompt al modelo) es `normalizeMessageContent`. Afecta a todas las ramas
  (user/assistant/system) y al collapsed/streaming excerpt, que reutilizan el
  mismo `normalizedMessageContent`.

## Verificación
- `npx vitest run src/components/chat/normalizeMessageContent.test.ts` →
  9/9 en verde.
- Pendiente de verificación visual por tu parte: recargar Vibes y confirmar que
  ya no aparece el bloque de "Read/Modified" en los mensajes del agente.

## Notas
- No se toca el prompt al LLM: la memoria entre turnos sigue intacta.
- Solo cubre la réplica en texto plano. La TAG estructurada seguía oculta.
