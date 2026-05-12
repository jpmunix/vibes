---
title: Permisos del Agente
---

# Permisos del Agente

Controla exactamente qué puede y qué no puede hacer el agente. Cada herramienta se puede configurar de forma independiente.

## Niveles de permiso

Para cada herramienta del agente puedes elegir entre tres niveles:

| Nivel | Comportamiento |
|---|---|
| **Siempre** | La herramienta se ejecuta sin confirmación |
| **Preguntar** | El agente muestra un banner pidiendo tu aprobación antes de ejecutar |
| **Nunca** | La herramienta está completamente deshabilitada |

## Herramientas configurables

Desde **Ajustes → Agente → Permisos del Agente**:

| Herramienta | Qué hace | Default |
|---|---|---|
| **Editar archivos** | Crear, modificar y eliminar archivos del proyecto | Siempre |
| **Terminal** | Ejecutar comandos en bash/shell | Preguntar |
| **Acceso web** | Descargar contenido de URLs | Siempre |
| **Búsqueda web** | Buscar información en internet | Siempre |
| **Diagnósticos LSP** | Análisis estático de errores | Siempre |

## Reglas granulares para Terminal

La terminal tiene reglas adicionales por tipo de comando:

### Patrones de comandos

Puedes definir patrones personalizados que se bloquean o permiten automáticamente. Por ejemplo, bloquear `rm -rf /` o permitir `npm install`.

### Reglas de Git por nivel de riesgo

| Categoría | Comandos | Default |
|---|---|---|
| **Staging** | `git add`, `git commit` | Configurable |
| **Destructivas locales** | `git reset`, `git checkout`, `git restore`, `git clean`, `git rebase` | Configurable |
| **Remotas** | `git push`, `git push --force` | Configurable |

<!-- @warning "Configurar operaciones destructivas de Git en 'Siempre' significa que el agente podrá hacer reset, rebase o force-push sin pedirte confirmación. Asegúrate de que confías en el contexto antes de habilitarlo." -->

## Banner de confirmación

Cuando una herramienta está en modo **Preguntar**, el agente muestra un banner en el chat con:

- La acción que quiere ejecutar
- Botones para **aprobar** o **rechazar**
- Opción de **recordar la decisión** para futuras sesiones

![Banner de permisos](https://images.mnstatic.com/Tools/files/af1143cdcdb15e885f5a0ccd196e83009d58fbf4698b08a60ec38dfd19d4de19.jpg)
<!-- @info title="📸 Captura pendiente" "Reemplazar con captura del banner de permisos mostrando una acción pendiente de aprobación" -->
