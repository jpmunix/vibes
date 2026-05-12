---
title: Terminal
---

# Terminal

Vibes incluye una terminal integrada para cada proyecto, accesible desde la barra de herramientas.

## Acceso

Click en el icono de terminal (⌨️) en la barra de herramientas de la vista de detalles de la app. Se abre en una ventana secundaria.

## Funcionalidades

- **Shell completo**: ejecuta cualquier comando como lo harías en una terminal normal
- **Directorio del proyecto**: se abre automáticamente en la carpeta del proyecto activo
- **Historial**: los comandos anteriores están disponibles
- **Variables de entorno**: hereda las variables de entorno de tu sistema

## El agente y la terminal

El agente puede ejecutar comandos en la terminal como parte de su trabajo:

- Instalar dependencias (`npm install`, `pip install`)
- Ejecutar scripts (`npm run build`, `python manage.py migrate`)
- Gestionar procesos

Los permisos de terminal se controlan desde **Ajustes → Agente → Permisos del Agente**. Puedes elegir que el agente ejecute comandos libremente o que te pida confirmación.

<!-- @warning "Los comandos que ejecuta el agente se ejecutan con los mismos permisos que tu usuario del sistema. Revisa los permisos si trabajas con datos sensibles." -->

## Consola de la app

Además de la terminal del sistema, hay una **Consola de la app** (icono 📋) que muestra específicamente los logs del servidor de desarrollo: errores de compilación, warnings, y output del framework.
