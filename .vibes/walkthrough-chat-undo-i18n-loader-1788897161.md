# Change Summary: Localización y cierre del loader de Undo en el chat

## Resumen para el usuario

El botón de deshacer de la caja de chat ya no muestra la clave `chat.undo`: ahora tiene traducción en español e inglés. También se han localizado el diálogo de confirmación, los estados de los archivos modificados y sus botones; el spinner deja de mostrarse en cuanto termina la operación de deshacer, sin esperar a la recarga secundaria de mensajes.

## Detalles técnicos

| Archivo | Cambio |
|---|---|
| `src/components/chat/ChatInput.tsx` | Añadida la clave `t` a las dependencias del callback de undo y se libera `isUndoLoading` justo después de completar la operación principal, antes de sincronizar de nuevo el chat. |
| `src/components/chat/UndoConfirmDialog.tsx` | Sustituidos los textos visibles hardcodeados por `useI18n()` y claves de traducción, incluidos los estados `added`, `modified`, `deleted` y `renamed`. |
| `src/lib/i18n/messages.es.ts` | Añadidas las traducciones españolas para el botón y el diálogo de Undo. |
| `src/lib/i18n/messages.en.ts` | Añadidas las traducciones inglesas equivalentes. |

No se modificaron los cambios ajenos ya presentes en el working tree.

## Verificación

- `pnpm ts:main` — correcto, sin errores.
- `pnpm vitest run src/lib/i18n/index.test.ts` — 21 tests en verde.
- `pnpm vitest run src/lib/i18n/index.test.ts src/lib/i18n/useI18n.test.ts` — 25 tests en verde.
- La comprobación de paridad i18n valida las claves nuevas en ambos diccionarios.

## Consideraciones

Conviene hacer una comprobación manual en la aplicación con Undo directo y con el diálogo de cambios sin commitear para confirmar visualmente que el loader desaparece tras ambas variantes.

## Plan sincronizado

- [x] Inspeccionar el flujo del botón Undo, sus estados de carga y las claves i18n existentes.
- [x] Corregir la localización visible y liberar el loader tras la operación.
- [x] Verificar la paridad i18n y los tests disponibles.
- [x] Ejecutar typecheck y tests.
- [ ] Smoke test manual en la aplicación pendiente.
