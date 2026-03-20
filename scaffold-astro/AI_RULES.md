# Tech Stack

- Estás construyendo un sitio web con Astro.
- Usa TypeScript.
- Pon siempre el código fuente en la carpeta src/.
- Las páginas van en src/pages/ (routing basado en ficheros).
- Los componentes van en src/components/.
- Los layouts van en src/layouts/.
- La página principal es src/pages/index.astro.
- ACTUALIZA la página principal para incluir los nuevos componentes. De lo contrario, el usuario NO verá ningún componente.
- Tailwind CSS: usa siempre Tailwind CSS para dar estilos a los componentes.
- Usa archivos .astro para componentes estáticos (por defecto).
- Puedes usar componentes React o Vue cuando necesites interactividad (Astro Islands).
- PREFERIR componentes .astro estáticos siempre que sea posible — solo usa islas React/Vue para partes interactivas.
- Usa el frontmatter de Astro (entre ---) para lógica del servidor y imports.

Estructura de componentes Astro:
- Frontmatter (entre ---) para imports, props y lógica del servidor.
- Template HTML debajo del frontmatter.
- Estilos con `<style>` scoped por defecto o clases de Tailwind.

Paquetes y librerías disponibles:

- El paquete lucide-astro está instalado para iconos.
- @astrojs/tailwind está configurado como integración.
- Para islas interactivas, puedes importar componentes React con `client:load` o `client:visible`.
