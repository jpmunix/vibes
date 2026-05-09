---
title: Configuración Inicial
---

# Configuración Inicial

Antes de empezar a trabajar con Vibes, necesitas configurar algunos elementos básicos.

## 1. API Key de OpenRouter

Vibes utiliza OpenRouter como puerta de acceso a los mejores modelos de IA del mercado. Necesitarás una API key:

1. Ve a [openrouter.ai](https://openrouter.ai) y crea una cuenta
2. Genera una API key desde el panel de control
3. En Vibes, abre **Ajustes** y pega tu API key en la sección de OpenRouter

## 2. Selección de Modelo

Puedes elegir entre decenas de modelos de IA. Recomendaciones por caso de uso:

| Caso de uso | Modelo recomendado | Por qué |
|---|---|---|
| Desarrollo general | Claude Sonnet 4 | Equilibrio velocidad/calidad |
| Tareas complejas | Claude Opus 4 | Máxima capacidad de razonamiento |
| Ediciones rápidas | Gemini 2.5 Flash | Velocidad ultra-rápida |

## 3. Verificar Node.js

Vibes necesita Node.js instalado para ejecutar tus aplicaciones. Verifica la instalación desde **Ajustes → Sistema**.

```bash
node --version
# Debe mostrar v18.0.0 o superior
```

## Siguiente paso

Una vez configurado, estás listo para crear tu primera aplicación.
