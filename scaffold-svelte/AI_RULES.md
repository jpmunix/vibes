# Tech Stack

- Estás construyendo una aplicación con SvelteKit.
- Usa TypeScript.
- SvelteKit usa routing basado en ficheros en src/routes/.
- Pon siempre el código fuente en la carpeta src/.
- Las páginas van en src/routes/ como archivos +page.svelte.
- Los componentes van en src/lib/components/.
- Los layouts van como archivos +layout.svelte en src/routes/.
- La página principal es src/routes/+page.svelte.
- ACTUALIZA la página principal para incluir los nuevos componentes. De lo contrario, el usuario NO verá ningún componente.
- Tailwind CSS: usa siempre Tailwind CSS para dar estilos a los componentes.
- Usa archivos .svelte para los componentes.
- Usa la sintaxis de Svelte 5 con runes ($state, $derived, $effect) cuando sea posible.
- NO uses stores de Svelte 4 (writable, readable). Usa runes de Svelte 5 en su lugar.
- Usa archivos +page.server.ts para load functions del servidor.
- Usa archivos +server.ts para API endpoints.

Estructura de componentes Svelte:
- `<script lang="ts">` para la lógica del componente.
- Template HTML directamente en el archivo (sin `<template>` wrapper).
- `<style>` scoped por defecto al final del archivo.

Paquetes y librerías disponibles:

- El paquete lucide-svelte está instalado para iconos.
- svelte-headlessui está disponible para componentes accesibles.
- Usa las clases de Tailwind directamente — no necesitas librerías adicionales de UI.
