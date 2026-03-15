¡Gran actualización con cambios fundamentales! Vibes estrena identidad propia, un nuevo motor de agente IA y una experiencia de arranque completamente renovada.

## 🚀 Integración completa del agente OpenCode

### 1. Nuevo motor de agente IA
El corazón de Vibes ahora es **OpenCode**, un agente de código local de última generación que reemplaza al antiguo sistema Crush/Dyad.

- **Modos de chat renombrados**: "Agente" (OpenCode), "Agente legacy", "Planificar" y "Preguntar", con posibilidad de alternar entre ellos.
- **Streaming en tiempo real**: Procesamiento de eventos SSE para mostrar respuestas del agente en vivo, incluyendo estado de herramientas, edición de archivos y bloques de razonamiento.
- **Soporte de adjuntos**: Imágenes como `FilePartInput`, texto en línea y subida directa al codebase.
- **Inyección de entorno**: Las variables de integración (Bunny DB/Storage, PocketBase) se inyectan automáticamente en `process.env` para que el agente pueda consultar servicios directamente desde bash.
- **Compactación automática de contexto**: Modo auto + prune para gestionar conversaciones largas sin perder coherencia.
- **Badges de uso de tokens**: Separados y siempre visibles para monitorizar el consumo por mensaje.

### 2. Diagnósticos del agente
- Canales IPC para health-check y test-run accesibles desde las DevTools.
- Verificación de instalación, versión y claves API desde el frontend.

---

## 🎨 Identidad Vibes

### 3. Rebranding completo de Dyad a Vibes
Se han reemplazado **todas** las referencias a "Dyad" por "Vibes" en el codebase completo: componentes, textos, configuración y documentación.

- **Eliminación de Dyad Pro**: Todas las restricciones y funcionalidad legacy de Dyad Pro han sido eliminadas.
- **Eliminación de licencia FSL**: Se ha retirado la documentación y archivo de licencia Fair Source License.
- **Limpieza de componentes**: Eliminados todos los componentes deprecados de Dyad (chat, UI, etc.).

---

## ✨ Experiencia de arranque y UI premium

### 4. Splash screen e instalador automático de OpenCode CLI
Al iniciar la app se muestra una pantalla de splash que, además de dar una primera impresión pulida, ejecuta de forma transparente la instalación/actualización del CLI de OpenCode si es necesario.

### 5. Skeleton de carga para la ventana principal
Nuevo componente `MainWindowSkeleton` que muestra un esqueleto animado durante la carga inicial, eliminando el flash de contenido vacío.

### 6. Animaciones premium en chat y sidebar
- Micro-animaciones avanzadas en el input del chat y en el sidebar.
- Contenedor de controles de ventana (Windows) ajustado a la altura completa.

---

## 🛠 Mejoras técnicas y limpieza

### 7. Utilidad `normalizeLegacyTags`
Nueva función para normalizar etiquetas de formato legacy (`<dyad-write>`, `<dyad-read>`, etc.), asegurando compatibilidad hacia atrás con proyectos existentes.

### 8. Prevención de escrituras obsoletas en settings
Los ajustes ahora se re-leen desde disco antes de cada escritura, eliminando un bug donde datos stale podían sobrescribir cambios recientes.

### 9. Limpieza general del repositorio
- Eliminados workflows de GitHub Actions y issue templates que ya no se usan.
- Eliminados worker scripts y archivos relacionados en desuso.
- Eliminado `OpenCodePermissionsSettings` (permisos gestionados de forma simplificada).

### 10. Mejoras en la interacción con apps
- Funcionalidad "Abrir chat" directamente desde el listado de apps para iniciar conversaciones contextuales.
- Duración y timestamps persistentes en mensajes del chat.
- Undo/redo y restauración de versiones de mensajes del agente (`revertLastOpenCodeMessage`, `destroyOpenCodeSession`).
- Mejor seguimiento temporal de eventos en streams en tiempo real.

---

#### ✨ ¡Disfruta las vibraciones de esta nueva actualización! ✨
