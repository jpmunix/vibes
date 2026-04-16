## ✨ Novedades

### 🏎️ Modo Turbo
- Nuevo modo de chat **Turbo** para velocidad máxima. Edita y crea código al instante sin terminal ni verificaciones.
- Disponible en el selector de modo del chat y en ajustes como modo predeterminado.
- Se oculta automáticamente el selector de razonamiento cuando Turbo está activo.

### 🧠 Selector dual Razonamiento + Autonomía
- El selector de razonamiento del chat ahora incluye un panel dual con control de **Autonomía** (pasos del agente).
- Presets disponibles: Ligero (20), Estándar (30), Pro (50), Experto (70).
- Soporte para valores custom desde los ajustes.

### 🔧 Herramientas MCP
- Gestión completa de servidores MCP desde ajustes: añadir, editar y eliminar.
- Las herramientas MCP dinámicas (Context7, etc.) se renderizan con badges interactivos en el chat.
- Corrección de bug al eliminar servidores MCP del estado.

### 📋 Copiar mensajes
- Ahora puedes copiar los mensajes del usuario directamente desde el chat.

## 🛠 Mejoras

- **Selector de tecnología compacto**: muestra solo el icono del framework, los nombres aparecen al desplegar.
- **Presets de pasos actualizados**: nuevos valores por defecto más equilibrados (Ligero 20, Estándar 30, Pro 50, Experto 70).
- **Core actualizado** con mejoras de estabilidad.
- **Eliminación del modo Inteligente**: simplificada la arquitectura eliminando la clasificación automática de intención por LLM.

## 🐛 Correcciones

- Corregido el routing del modo Turbo que caía por el flujo legacy en vez del pipeline OpenCode.
- Corregido que el panel de aprobación de propuestas aparecía innecesariamente en modos que escriben directamente.
- Corregido problema con los iconos de servicios conectados que se visualizaban como un cuadrado blanco.
- Corregida la sincronización del sidebar de ajustes al hacer scroll hasta el final.
