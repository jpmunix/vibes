---
title: Modos de Chat
---

# Modos de Chat

Vibes ofrece tres modos de conversación diferentes, cada uno optimizado para un tipo de tarea.

## Modo Agente

El modo por defecto y más potente. El agente puede:

- **Editar archivos** de tu proyecto directamente
- **Ejecutar comandos** en la terminal
- **Buscar en internet** información actualizada
- **Diagnosticar errores** usando análisis estático (LSP)
- **Gestionar Git** (commits, branches, push)

Cada acción que el agente toma es visible en el chat. En la vista **Flow** verás los pasos intermedios (herramientas usadas, archivos editados), mientras que en la vista **Zen** solo verás el resultado final limpio.

<!-- @info "El modo Agente usa el modelo que tengas seleccionado en el picker del chat. Puedes cambiarlo sobre la marcha." -->

## Modo Plan

Cambia al modo **Plan** cuando necesites que el agente piense antes de actuar. En este modo:

- El agente **no ejecuta ninguna herramienta** — solo razona y propone
- Usa automáticamente el **modelo estratega** (configurado en Ajustes)
- Ideal para planificar features complejas, analizar arquitectura o revisar código

El resultado se puede guardar como un **artefacto** para consultarlo después.

## Modo Preguntar (Ask)

El modo más ligero. Ideal para:

- Preguntas rápidas sobre código, APIs o conceptos
- Pedir explicaciones de errores o logs
- Obtener snippets de código sin que el agente toque tus archivos

Al igual que Plan, usa el modelo estratega y no ejecuta herramientas.

## Cambiar de modo

Usa el **selector de modo** en la cabecera del chat. El cambio es inmediato y no afecta al historial de la conversación.

![Selector de modo](https://images.mnstatic.com/Tools/files/af1143cdcdb15e885f5a0ccd196e83009d58fbf4698b08a60ec38dfd19d4de19.jpg)
<!-- @info title="📸 Captura pendiente" "Reemplazar con captura del selector de modo (Agent/Plan/Ask)" -->

<!-- @tip "Puedes configurar el modo por defecto que se usa al crear nuevas apps desde Ajustes → Flujo de trabajo → Modo de chat predeterminado." -->

## Vistas de renderizado

Independientemente del modo, puedes elegir cómo se muestra la respuesta:

| Vista | Qué muestra |
|---|---|
| **Completo** | Todo: herramientas, código, razonamiento |
| **Flow** | Texto del agente con bloques de pensamiento colapsables |
| **Zen** | Solo la prosa final, sin ruido técnico |

Configúralo desde **Ajustes → Agente → Vista del chat**.
