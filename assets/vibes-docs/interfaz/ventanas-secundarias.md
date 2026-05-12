---
title: Ventanas Secundarias
---

# Ventanas Secundarias

Vibes utiliza **ventanas flotantes independientes** para herramientas que necesitan su propio espacio. Todas comparten un diseño coherente con barra de título, skeleton loader de carga y los mismos controles de ventana.

## Ventanas disponibles

| Ventana | Acceso | Contenido |
|---|---|---|
| **Visor de Código** | Barra de herramientas de la app | Explorador de archivos con resaltado de sintaxis |
| **Terminal** | Barra de herramientas | Consola del sistema con historial |
| **Git** | Barra de herramientas | Commits, branches, diff visual |
| **Consola de App** | Barra de herramientas | Logs del servidor de desarrollo |
| **Base de datos** | Barra de herramientas | Visor de tablas y datos |
| **Memorias** | Barra de herramientas | Panel de gestión de memoria del agente |
| **Playground** | Menú del chat | Sandbox para probar prompts |
| **Notas de Versión** | Topbar (🚀) o Ajustes | Historial de novedades por versión |
| **Documentación** | Topbar (📖) | Esta documentación |
| **Admin** | Avatar → Panel Admin | Administración de usuarios |

## Comportamiento común

- Todas las ventanas **recuerdan su posición y tamaño** entre sesiones
- Al abrir una ventana que ya existe, se **enfoca** en lugar de crear una duplicada
- Mientras cargan, muestran un **skeleton loader animado** con la estructura de la ventana
- Los atajos <!-- @kbd "Ctrl+R" --> o <!-- @kbd "F5" --> recargan el contenido de la ventana activa
- <!-- @kbd "Ctrl+Shift+I" --> abre las DevTools de la ventana (para debugging)

## Visor de Código

El visor de código abre un explorador de archivos del proyecto con:

- **Árbol de archivos** colapsable con iconos por tipo de archivo (TypeScript en azul, JavaScript en amarillo, CSS en rosa, etc.)
- **Botones de colapsar/expandir** todo el árbol
- **Editor con resaltado de sintaxis** para leer el código
- Arranque con directorios **colapsados por defecto** para mantener la vista limpia

![Visor de código](https://images.mnstatic.com/Tools/files/af1143cdcdb15e885f5a0ccd196e83009d58fbf4698b08a60ec38dfd19d4de19.jpg)
<!-- @info title="📸 Captura pendiente" "Reemplazar con captura del visor de código mostrando un proyecto abierto" -->

## Notas de Versión

La ventana de Notas de Versión muestra el historial completo de versiones organizado por versión mayor (v8, v7, v6...). Incluye:

- **Barra lateral navegable** con el árbol de versiones
- **Buscador a texto completo** que encuentra cualquier término en cualquier versión
- **Resultados ordenados** por versión más reciente primero
- **Resaltado** del término buscado en el texto

Se abre automáticamente cuando actualizas a una nueva versión, y el botón del cohete (🚀) permanece visible en la barra superior durante toda la sesión.
