---
title: Sistema de Memoria
---

# Sistema de Memoria

El agente de Vibes tiene **memoria persistente**: recuerda hechos, decisiones y preferencias entre sesiones. No necesitas repetir contexto cada vez que abres un chat nuevo.

## Cómo funciona

El agente almacena automáticamente información relevante:

- **Decisiones técnicas**: "El proyecto usa PostgreSQL con Prisma"
- **Preferencias**: "El usuario prefiere TypeScript y CSS modules"
- **Estado del proyecto**: "La autenticación está implementada, falta el dashboard"
- **Contexto importante**: "El endpoint de la API es /api/v2"

## Memoria automática

El sistema gestiona las memorias sin que tengas que hacer nada:

- Al **eliminar o archivar** un chat, el agente extrae la información clave automáticamente antes de que desaparezca
- Las memorias se **compactan** periódicamente: datos antiguos se fusionan en resúmenes más limpios

## Panel de Memoria

Accede al panel de memoria desde la barra de herramientas de la app (icono 🧠) o desde **Ajustes → Memoria**.

![Panel de memoria](https://images.mnstatic.com/Tools/files/af1143cdcdb15e885f5a0ccd196e83009d58fbf4698b08a60ec38dfd19d4de19.jpg)
<!-- @info title="📸 Captura pendiente" "Reemplazar con captura del panel de memoria mostrando memorias con filtros" -->

### Funcionalidades del panel

| Función | Descripción |
|---|---|
| **Ver memorias** | Lista completa con preview del contenido |
| **Filtrar** | Por relevancia, fecha o estado |
| **Ordenar** | Cronológico o por relevancia |
| **Compactar** | Fusiona memorias antiguas en resúmenes más limpios |
| **Eliminar** | Borra memorias individuales que ya no sean relevantes |

## Condensar un chat

Si una conversación se ha vuelto demasiado larga, puedes usar la opción **Resumir** desde el selector de chats:

1. El agente analiza todo el historial
2. Extrae decisiones, estado actual y próximos pasos
3. Abre un **chat nuevo** con ese resumen como punto de partida

El resultado: contexto limpio, sin ruido, sin perder información importante.

<!-- @tip "Compactar memorias manualmente es útil cuando llevas muchas sesiones en un proyecto y el contexto se ha fragmentado en muchas entradas pequeñas." -->

## Configurar la memoria

Desde **Ajustes → Memoria** puedes personalizar:

- Las instrucciones que el agente usa para gestionar las memorias
- El comportamiento de extracción automática
- Los prompts de compactación
