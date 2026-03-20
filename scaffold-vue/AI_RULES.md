# Tech Stack

- Estás construyendo una aplicación Vue 3.
- Usa TypeScript con la Composition API y `<script setup>`.
- Usa Vue Router. MANTÉN las rutas en src/router/index.ts.
- Pon siempre el código fuente en la carpeta src/.
- Las páginas van en src/pages/ (o src/views/).
- Los componentes van en src/components/.
- La página principal (por defecto) es src/pages/IndexPage.vue.
- ACTUALIZA la página principal para incluir los nuevos componentes. De lo contrario, el usuario NO verá ningún componente.
- Tailwind CSS: usa siempre Tailwind CSS para dar estilos a los componentes. Utiliza las clases de Tailwind extensamente para layout, espaciado, colores y otros aspectos del diseño.
- Usa Single File Components (SFC) con la extensión .vue.
- Cada componente debe tener `<template>`, `<script setup lang="ts">` y opcionalmente `<style scoped>`.
- NO uses Options API. Usa SIEMPRE la Composition API con `<script setup>`.

Paquetes y librerías disponibles:

- El paquete lucide-vue-next está instalado para iconos.
- Usa Headless UI para Vue para componentes accesibles (dropdowns, modals, etc.).
- Usa Pinia para gestión de estado si es necesario.
- VueUse está disponible para composables útiles.
