---
title: Modelos de IA
---

# Modelos de IA

Vibes se conecta a **OpenRouter** para darte acceso a decenas de modelos de IA de los principales proveedores.

## Sistema de dos modelos

En lugar de configurar un modelo para cada tarea interna, Vibes simplifica con dos roles:

### Modelo principal (Estratega)

Se usa para:
- Conversación con el agente en modo Agente
- Planificación en modo Plan
- Respuestas en modo Preguntar
- Exploración y razonamiento complejo

**Recomendaciones**: Claude Sonnet 4, Claude Opus 4, Gemini 2.5 Pro

### Modelo ejecutor

Se usa para tareas internas automáticas:
- Generar títulos para apps y chats
- Crear resúmenes al condensar conversaciones
- Compactar memorias
- Tareas ligeras en segundo plano

**Recomendaciones**: Gemini 2.5 Flash, GPT-4o mini

Configura ambos desde **Ajustes → Agente**.

## Selector de modelo en el chat

En la cabecera de cada chat hay un **selector de modelo** que te permite cambiar el modelo sobre la marcha:

![Selector de modelo](https://images.mnstatic.com/Tools/files/af1143cdcdb15e885f5a0ccd196e83009d58fbf4698b08a60ec38dfd19d4de19.jpg)
<!-- @info title="📸 Captura pendiente" "Reemplazar con captura del selector de modelo desplegado" -->

- En modo **Agente**: muestra el modelo de agente
- En modo **Plan** o **Preguntar**: cambia automáticamente al modelo estratega
- El cambio es **transitorio** — no se guarda en ajustes globales
- Al volver a modo Agente, recupera tu modelo habitual

## Gestionar modelos disponibles

Desde **Ajustes → OpenRouter → Modelos habilitados** puedes:

- **Activar/desactivar** modelos individuales del catálogo
- Los modelos desactivados no aparecen en el selector del chat
- El catálogo filtra automáticamente modelos irrelevantes para desarrollo

<!-- @tip "Los modelos con etiqueta :free son completamente gratuitos. Ideal para experimentar o para tareas que no necesitan máxima calidad." -->

## Controles avanzados

| Ajuste | Ubicación | Efecto |
|---|---|---|
| **Esfuerzo de razonamiento** | Ajustes → Agente | Controla cuánto "piensa" el modelo antes de responder |
| **Verbosidad** | Ajustes → Agente | Cuánto detalle incluye en las respuestas |
| **Búsqueda web** | Ajustes → Flujo de trabajo | Permite al modelo buscar en internet |
| **Modo Cavernas** | Ajustes → Agente | Fuerza respuestas ultra-breves para ahorrar tokens |

## Ver el gasto

Si quieres monitorizar el coste, activa **Mostrar gasto en chats** desde **Ajustes → OpenRouter**. Se mostrará:

- **Coste acumulado** en la cabecera del chat
- **Coste por mensaje** en el footer de cada respuesta del agente

Los datos de gasto se guardan siempre internamente, independientemente de si los muestras o no.
