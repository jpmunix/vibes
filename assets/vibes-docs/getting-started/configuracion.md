---
title: Configuración Inicial
---

# Configuración Inicial

Antes de empezar a trabajar con Vibes, necesitas configurar algunos elementos básicos.

## 1. API Key de OpenRouter

Vibes utiliza **OpenRouter** como puerta de acceso a los mejores modelos de IA del mercado. Necesitarás una API key:

1. Ve a [openrouter.ai](https://openrouter.ai) y crea una cuenta
2. Genera una API key desde el panel de control
3. En Vibes, abre **Ajustes** y pega tu API key en la sección **OpenRouter**

<!-- @info "OpenRouter te permite usar modelos de Anthropic, Google, Meta, Mistral y muchos más desde una sola API key." -->

### Modelos gratuitos

Si no quieres gastar al principio, Vibes soporta todos los modelos gratuitos de OpenRouter. Busca los que tienen la etiqueta **:free** en el selector de modelo del chat.

## 2. Selección de Modelos

Vibes usa un sistema de **dos modelos** para optimizar coste y calidad:

| Rol | Para qué se usa | Recomendación |
|---|---|---|
| **Modelo principal** | Conversación, planificación, código | Claude Sonnet 4, Gemini 2.5 Pro |
| **Modelo ejecutor** | Títulos, resúmenes, tareas ligeras | Gemini 2.5 Flash, GPT-4o mini |

Puedes cambiar ambos modelos desde **Ajustes → Agente**.

<!-- @tip "Puedes cambiar el modelo del chat sobre la marcha usando el selector en la cabecera del chat, sin afectar tu configuración global." -->

## 3. Verificar Node.js

Vibes necesita **Node.js** instalado para ejecutar tus aplicaciones. Verifica la instalación desde **Ajustes → Sistema** o desde tu terminal:

```bash
node --version
# Debe mostrar v18.0.0 o superior
```

<!-- @warning "Sin Node.js instalado podrás chatear con el agente, pero no podrás ejecutar ni previsualizar aplicaciones." -->

## 4. Integraciones opcionales

Puedes conectar servicios externos desde **Ajustes → Integraciones**:

| Servicio | Para qué |
|---|---|
| **GitHub** | Push/pull de repositorios, control de versiones remoto |
| **Vercel** | Despliegue con un click a producción |
| **Supabase** | Base de datos y autenticación serverless |
| **Neon** | Base de datos PostgreSQL serverless |

Cada integración se configura de forma independiente y es completamente opcional.

## Siguiente paso

Una vez configurado, estás listo para crear tu primera aplicación. Dirígete a **Tu Primer Proyecto** para un paso a paso guiado.
