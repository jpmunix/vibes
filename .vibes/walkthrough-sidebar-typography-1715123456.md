# Change Summary: Sidebar de ajustes — tipografía y compactación

## Resumen

Se ha eliminado la **negrita permanente** de todos los items de navegación secundarios (`.typo-menu-item`) en sidebars, y se ha compactado específicamente el `SettingsList` para que se vea más armónico y menos "gritón".

## Cambios técnicos

### `src/styles/typography.css` — línea 113

- `.typo-menu-item`: `font-bold` → `font-medium`. Afecta a los 14 sitios que usan la clase (SettingsList, DocsSidebar, ReleaseNotesSidebar, WorkspaceList, AdminWindow...). La negrita ahora es opt-in vía `font-semibold` donde tenga sentido (p. ej. item activo).

### `src/components/SettingsList.tsx`

- Contenedor: `space-y-1 p-4` → `space-y-0.5 p-3`
- Items: `px-3 py-2` → `px-2 py-1.5`
- Item activo: ahora lleva `font-semibold` extra para mantener jerarquía visual sin depender del `font-bold` global.

## Configurador de escalas

No se toca. `--scale-sidebar` sigue controlando el tamaño via `calc(13px * var(--scale-sidebar, 1))`. El peso (`font-weight`) es independiente de la escala, con lo cual no hay conflicto.

## Verificación

- `pnpm ts:main` → **0 errores** (tsgo incremental)