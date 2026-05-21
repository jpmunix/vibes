---
title: Cómo Documentar
---

# Guía de Documentación de Vibes 

Esta guía describe cómo escribir y organizar documentación dentro de Vibes. El sistema de documentación utiliza archivos Markdown enriquecidos con marcas personalizadas que se renderizan como componentes nativos.

## Estructura de Directorios

La documentación vive en `assets/vibes-docs/`. Cada directorio es una **sección** y debe contener un archivo `index.md`:

```
assets/vibes-docs/
├── index.md                    ← Raíz del árbol
├── getting-started/
│   ├── index.md                ← Manifiesto de sección
│   ├── bienvenida.md
│   └── configuracion.md
├── aplicaciones/
│   ├── index.md
│   ├── crear-app.md
│   └── despliegue/
│       ├── index.md            ← Subsección anidada
│       ├── vercel.md
│       └── supabase.md
└── como-documentar.md          ← Página de nivel raíz
```

## El Archivo `index.md`

Cada directorio necesita un `index.md` con dos partes:

### 1. Frontmatter YAML

Metadatos de la sección entre líneas `---`:

<!-- @preview -->
---
title: Nombre de la Sección
icon: rocket
description: Descripción breve para tooltips
---
<!-- @/preview -->

| Campo | Obligatorio | Descripción |
|---|---|---|
| `title` | ✅ | Título visible en el sidebar |
| `icon` | ❌ | Nombre del icono Lucide (e.g. `rocket`, `book-open`) |
| `description` | ❌ | Descripción corta |

### 2. Directivas `@section`

Definen **qué páginas/subsecciones** aparecen en el sidebar y **en qué orden**:

<!-- @preview -->
<!-- @section bienvenida.md "Bienvenida" -->
<!-- @section configuracion.md "Configuración Inicial" -->
<!-- @section despliegue/ "Despliegue" -->
<!-- @/preview -->

- Un archivo `.md` → genera un **enlace** en el sidebar
- Un directorio con `/` final → genera una **sección desplegable** (se lee su propio `index.md`)
- El **orden** de las directivas es el orden que se pinta en el sidebar

---

## Markdown Estándar

Todas las características estándar de Markdown están soportadas y se renderizan con estilos personalizados:

### Headings

<!-- @preview -->
# Título principal (h1)
## Sección (h2) — con borde inferior
### Subsección (h3)
#### Punto (h4)
<!-- @/preview -->

Todos los headings generan un **anchor link** automático (el `#` que aparece al hacer hover) para poder enlazar directamente a una sección.

### Texto

<!-- @preview -->
Texto normal con **negrita**, *cursiva* y `código inline`.
<!-- @/preview -->

### Listas

<!-- @preview -->
- Elemento con viñeta
- Otro elemento
  - Sub-elemento indentado

1. Elemento numerado
2. Otro elemento
<!-- @/preview -->

### Enlaces

<!-- @preview -->
[Texto del enlace](https://url.com)
<!-- @/preview -->

Todos los enlaces se abren en una nueva ventana.

### Imágenes

Para añadir imágenes usa la sintaxis estándar de Markdown con cualquier URL pública (CDN, Imgur, GitHub raw, etc.):

<!-- @preview -->
![Logo de Vibes](https://images.mnstatic.com/Tools/files/ba2815a6a54b6b0ee2d630d691b24835dfde8c90aef37e31292abd064d97ebee.png?width=100)
<!-- @/preview -->

<!-- @info "Las imágenes se renderizan con bordes redondeados y un caption automático usando el texto alternativo." -->

### Tablas

<!-- @preview -->
| Columna 1 | Columna 2 | Columna 3 |
|---|---|---|
| Dato | Dato | Dato |
| Dato | Dato | Dato |
<!-- @/preview -->

### Bloques de código

<!-- @preview -->
```javascript
function hola() {
  console.log("¡Hola!");
}
```
<!-- @/preview -->

Se muestran con un badge del lenguaje en la cabecera.

### Citas (Blockquotes)

<!-- @preview -->
> Esto es una cita con acento visual.
<!-- @/preview -->

---

## Marcas Personalizadas

Las marcas custom usan la sintaxis de comentarios HTML para no interferir con el Markdown estándar. Son invisibles en editores de texto normales pero Vibes las renderiza como componentes nativos.

### Callouts (Alertas)

Cuatro tipos de callout con colores e iconos distintos:

#### Sintaxis de una línea

<!-- @preview -->
<!-- @tip "Los atajos de teclado aceleran tu flujo de trabajo." -->
<!-- @/preview -->

<!-- @preview -->
<!-- @info "Esta funcionalidad requiere Node.js 18+." -->
<!-- @/preview -->

<!-- @preview -->
<!-- @warning "Esto sobrescribirá los archivos existentes." -->
<!-- @/preview -->

<!-- @preview -->
<!-- @danger "Esta acción no se puede deshacer." -->
<!-- @/preview -->

#### Sintaxis multi-línea

Para callouts con contenido complejo (listas, código, etc.), usa las marcas de apertura y cierre:

<!-- @preview -->
<!-- @tip -->
Puedes combinar **negrita**, `código` y listas dentro de un callout:

- Primer punto importante
- Segundo punto
<!-- @/tip -->
<!-- @/preview -->

#### Título personalizado

Todos los callouts aceptan un atributo `title="..."` opcional para sobreescribir el título por defecto:

<!-- @preview -->
<!-- @danger title="No ejecutar en producción" "Este comando borra toda la base de datos." -->
<!-- @/preview -->

<!-- @preview -->
<!-- @info title="Requisito previo" "Necesitas tener Docker instalado antes de continuar." -->
<!-- @/preview -->

También funciona con la sintaxis multi-línea:

<!-- @preview -->
<!-- @warning title="Cambio incompatible" -->
A partir de la versión 9.0:

- La API de plugins cambia de formato
- Los hooks legacy dejan de funcionar
<!-- @/warning -->
<!-- @/preview -->

| Tipo | Título por defecto | Color |
|---|---|---|
| `@tip` | Consejo | 🟢 Verde |
| `@info` | Información | 🔵 Azul |
| `@warning` | Atención | 🟡 Ámbar |
| `@danger` | Peligro | 🔴 Rojo |

### Atajos de Teclado

Renderiza combinaciones de teclas como badges estilizados:

<!-- @preview -->
Pulsa <!-- @kbd "Ctrl+S" --> para guardar.
<!-- @/preview -->

<!-- @preview -->
Usa <!-- @kbd "Ctrl+Shift+P" --> para abrir la paleta de comandos.
<!-- @/preview -->

### Badges de Versión

Indica desde qué versión está disponible una funcionalidad:

<!-- @preview -->
Esta funcionalidad está disponible desde <!-- @version "8.5+" -->
<!-- @/preview -->

### Preview (Código ↔ Resultado)

Envuelve cualquier bloque de Markdown para crear un panel con toggle entre el código fuente y el resultado renderizado. Por defecto muestra el código:

````markdown
<!-- @preview -->
| Animal | Sonido |
|---|---|
| Gato | Miau |
| Perro | Guau |
<!-- @/preview -->
````

<!-- @preview -->
| Animal | Sonido |
|---|---|
| Gato | Miau |
| Perro | Guau |
<!-- @/preview -->

Útil para documentar sintaxis mostrando simultáneamente el ejemplo y su resultado visual.

### Secciones Colapsables

Envuelve contenido en una sección colapsable con título y chevron. El contenido se oculta por defecto y se expande al hacer click.

Acepta un atributo `level` (1-3) que controla el tamaño del titular, equivalente a `#`, `##`, `###`:

````markdown
<!-- @collapse "Título grande" -->
Contenido colapsado con nivel 1 (por defecto).
<!-- @/collapse -->

<!-- @collapse "Título mediano" level="2" -->
Contenido colapsado con nivel 2.
<!-- @/collapse -->

<!-- @collapse "Título compacto" level="3" -->
Contenido colapsado con nivel 3.
<!-- @/collapse -->
````

<!-- @collapse "Nivel 1 (por defecto)" -->
Título equivalente a `#`. Se usa para secciones principales.
<!-- @/collapse -->

<!-- @collapse "Nivel 2" level="2" -->
Título equivalente a `##`. Para sub-secciones.
<!-- @/collapse -->

<!-- @collapse "Nivel 3" level="3" -->
Título equivalente a `###`. Para detalles compactos.
<!-- @/collapse -->

---

## Resumen de Marcas

| Marca | Tipo | Renderiza |
|---|---|---|
| `<!-- @tip "texto" -->` | Bloque | Callout verde (consejo) |
| `<!-- @info "texto" -->` | Bloque | Callout azul (información) |
| `<!-- @warning "texto" -->` | Bloque | Callout amarillo (atención) |
| `<!-- @danger "texto" -->` | Bloque | Callout rojo (peligro) |
| `<!-- @tip -->...<!-- @/tip -->` | Multi-línea | Callout con contenido rico |
| `title="Custom"` | Atributo | Sobreescribe el título del callout |
| `<!-- @kbd "teclas" -->` | Inline | Badge de atajo de teclado |
| `<!-- @version "X.Y" -->` | Inline | Badge de versión |
| `<!-- @preview -->...<!-- @/preview -->` | Multi-línea | Panel código/resultado toggle |
| `<!-- @collapse "título" -->...<!-- @/collapse -->` | Multi-línea | Sección colapsable con chevron |
| `level="1\|2\|3"` | Atributo | Tamaño del titular del collapse |
