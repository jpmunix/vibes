---
title: Vista Previa
---

# Vista Previa

La vista previa te permite ver tu aplicación ejecutándose en tiempo real mientras la desarrollas.

## Apertura automática

La vista previa puede abrirse automáticamente cuando el agente realiza cambios. Configúralo desde **Ajustes → Flujo de trabajo → Expandir vista previa**:

| Opción | Comportamiento |
|---|---|
| **Desactivado** | Solo se abre manualmente |
| **Derecha** | Se abre automáticamente a la derecha del chat |
| **Izquierda** | Se abre automáticamente a la izquierda del chat |

## Controles

La cabecera de la vista previa incluye:

![Controles de vista previa](https://images.mnstatic.com/Tools/files/af1143cdcdb15e885f5a0ccd196e83009d58fbf4698b08a60ec38dfd19d4de19.jpg)
<!-- @info title="📸 Captura pendiente" "Reemplazar con captura de la cabecera de la vista previa con la URL y botones" -->

- **Barra de URL**: muestra la dirección local (editable para navegar dentro de la app)
- **Recargar**: fuerza una recarga completa
- **Abrir en navegador**: abre la app en Chrome/Firefox
- **Menú de herramientas**: acceso directo al visor de código, terminal, Git, etc.

## Recarga en caliente

Vibes configura automáticamente **Hot Module Replacement (HMR)** para que los cambios se reflejen al instante sin perder el estado de la aplicación.

<!-- @info "La recarga es automática cuando el agente modifica archivos. No necesitas recargar manualmente en la mayoría de los casos." -->

## Servidores de desarrollo

Cuando abres una app que tiene un servidor de desarrollo, Vibes lo **arranca automáticamente**. Los servidores se **detienen automáticamente** al cerrar la app o salir de Vibes, evitando procesos huérfanos.

<!-- @warning "Si cierras Vibes de forma inesperada, los servidores se terminarán en el próximo arranque. No quedarán procesos zombie." -->
