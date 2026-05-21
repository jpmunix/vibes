---
title: Ajustes del Flujo de Trabajo
---

# Ajustes del Flujo de Trabajo

Configura cómo se comporta Vibes durante tu sesión de desarrollo. Todos estos ajustes están en **Ajustes → Flujo de trabajo**.

## Modo de chat predeterminado

Elige qué modo de chat se activa por defecto al crear una nueva app:

- **Agente**: el agente puede ejecutar herramientas (recomendado)
- **Plan**: solo planifica, no ejecuta
- **Preguntar**: solo responde preguntas

## Confirmar cambios en Git

Cuando está activado, el agente hace commits automáticos en Git después de cada cambio. Cada commit incluye un mensaje descriptivo generado por la IA.

## Expandir vista previa

Controla si la vista previa se abre automáticamente cuando el agente modifica código:

| Opción | Comportamiento |
|---|---|
| **Desactivado** | Solo se abre manualmente |
| **Derecha** | Se abre a la derecha del chat |
| **Izquierda** | Se abre a la izquierda del chat |

## Notificaciones de respuesta

Si está activado, recibes una **notificación nativa del sistema** cuando el agente termina de generar una respuesta y la ventana no tiene el foco.

## Sonido de notificación

Complementa la notificación visual con un **sonido** al completar la respuesta. Especialmente útil en macOS donde las notificaciones pueden no funcionar con apps no firmadas.

## Búsqueda web

Permite al agente **buscar en internet** cuando necesita información actualizada que no tiene en su entrenamiento. Útil para APIs recientes, documentación nueva o noticias.

<!-- @tip "Si trabajas en un proyecto con tecnologías muy recientes (frameworks nuevos, APIs en beta), activa la búsqueda web para que el agente tenga información actualizada." -->
