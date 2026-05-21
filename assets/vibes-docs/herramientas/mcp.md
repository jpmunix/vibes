---
title: Servidores MCP
---

# Servidores MCP

MCP (Model Context Protocol) es un estándar abierto que permite conectar **herramientas externas** al agente de IA, ampliando sus capacidades más allá de las incluidas por defecto.

## ¿Qué es un servidor MCP?

Un servidor MCP es un programa que expone herramientas específicas (funciones) que el agente puede invocar. Ejemplos:

- Un servidor que lee documentación de una API específica
- Un servidor que se conecta a tu sistema de tickets (Jira, Linear)
- Un servidor que accede a un servicio propio de tu empresa

## Configurar servidores MCP

Desde **Ajustes → Herramientas MCP** puedes:

1. **Añadir** servidores proporcionando nombre y configuración (comando + argumentos)
2. **Activar/desactivar** servidores individuales
3. **Eliminar** servidores que ya no necesites

### Formato de configuración

Cada servidor MCP se define con:

```json
{
  "command": "npx",
  "args": ["-y", "@example/mcp-server"],
  "env": {
    "API_KEY": "tu-clave"
  }
}
```

## Añadir vía Deep Link

También puedes añadir servidores MCP mediante un **deep link**. Algunos proveedores de herramientas MCP ofrecen un botón "Añadir a Vibes" que instala el servidor automáticamente.

<!-- @info "Los servidores MCP se ejecutan como procesos locales en tu máquina. Vibes los gestiona automáticamente: los arranca cuando los necesita y los detiene al cerrar." -->

<!-- @warning "Solo instala servidores MCP de fuentes de confianza. Un servidor MCP tiene acceso a las herramientas que declara, y el agente puede invocarlas durante la conversación." -->
