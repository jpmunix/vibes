---
title: Despliegue
---

# Despliegue

Vibes permite desplegar tus aplicaciones a plataformas de hosting directamente desde la interfaz.

## Vercel

La integración con Vercel permite desplegar con un click:

1. Conecta tu cuenta de Vercel desde **Ajustes → Integraciones → Vercel**
2. Abre la vista de detalles de tu app
3. Usa la opción de deploy en el menú de la app
4. Vibes sube el código y genera un enlace de producción

<!-- @tip "Cada deploy genera una URL única de preview. Puedes compartirla para que otros revisen los cambios antes de ir a producción." -->

## Supabase

Si tu app usa base de datos o autenticación:

1. Conecta Supabase desde **Ajustes → Integraciones → Supabase**
2. El agente puede crear tablas, configurar autenticación y escribir consultas
3. Todo se sincroniza automáticamente con tu proyecto de Supabase

## Neon

Para proyectos que necesitan PostgreSQL serverless:

1. Conecta Neon desde **Ajustes → Integraciones → Neon**
2. El agente puede gestionar bases de datos y branches de Neon

## GitHub

Aunque no es un servicio de hosting, la integración con GitHub te permite:

- **Push** automático de cambios
- Gestión de **branches** y **pull requests**
- Sincronización del repositorio remoto

Configúralo desde **Ajustes → Integraciones → GitHub**.
