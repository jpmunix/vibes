# Implementación del Playground de Embeddings MiniLM

## Resumen

Se ha implementado un playground interactivo en la sección de Experimentos de la configuración que permite probar el modelo de embeddings all-MiniLM-L6-v2 y la búsqueda semántica contra el codebase actual.

## Archivos Creados

### 1. Frontend

**`src/components/EmbeddingsPlayground.tsx`**

- Componente de diálogo modal para el playground
- Interfaz para introducir consultas de búsqueda
- Visualización de:
  - Vector de embeddings generado (384 dimensiones)
  - Estadísticas del índice (archivos, chunks, tamaño)
  - Resultados de búsqueda semántica con scores de similaridad
  - Snippets de código de los archivos encontrados

### 2. Backend - IPC

**`src/ipc/types/embeddings.ts`**

- Contratos IPC para el playground de embeddings
- Tres endpoints:
  - `getEmbeddings`: Genera embeddings para un texto dado
  - `searchSimilarFiles`: Busca archivos similares en el codebase
  - `getIndexStats`: Obtiene estadísticas del índice vectorial
- Cliente IPC con métodos wrapper para facilitar uso desde frontend

**`src/ipc/handlers/embeddings_handlers.ts`**

- Handlers IPC para los tres endpoints
- `handleGetEmbeddings`: Usa el sistema de embeddings existente
- `handleSearchSimilarFiles`: Usa el indexador incremental para búsquedas
- `handleGetIndexStats`: Obtiene stats del índice SQLite

**`src/ipc/handlers/embeddings_handlers_register.ts`**

- Registra los handlers IPC con validación de entrada/salida usando Zod

### 3. Integración

**Modificaciones en `src/pages/settings.tsx`:**

- Añadido estado `isEmbeddingsPlaygroundOpen` en componente `SettingsPage`
- Nuevo botón "Abrir Playground" en la sección de Experimentos
- Diálogo `<EmbeddingsPlayground>` integrado en el componente principal

**Modificaciones en `src/ipc/ipc_host.ts`:**

- Importado y registrado `registerEmbeddingsHandlers()`

**Modificaciones en `src/ipc/types/index.ts`:**

- Exportado `embeddingsContracts` y `embeddingsClient`
- Añadido `embeddings` al objeto `ipc` unificado

**Modificaciones en `src/ipc/preload/channels.ts`:**

- Importado `embeddingsContracts`
- Añadidos canales de embeddings a `VALID_INVOKE_CHANNELS`

## Funcionalidades

### 1. Generación de Embeddings

- Convierte texto en vectores de 384 dimensiones
- Usa el modelo all-MiniLM-L6-v2 existente
- Muestra las primeras 20 dimensiones del vector generado

### 2. Búsqueda Semántica

- Busca archivos similares en el codebase basándose en el significado semántico
- Muestra hasta 10 resultados más relevantes
- Cada resultado incluye:
  - Ruta del archivo
  - Score de similaridad (0-100%)
  - Snippet del contenido (primeras 200 caracteres)

### 3. Estadísticas del Índice

- Muestra total de archivos indexados
- Muestra total de chunks en el índice
- Muestra tamaño del índice vectorial en MB

## Uso

1. Abrir Settings (Ajustes)
2. Navegar a la sección "Experimentos"
3. Click en botón "Abrir Playground"
4. Introducir una consulta de búsqueda (ej: "función de autenticación")
5. Presionar "Buscar" o Enter
6. Ver resultados:
   - Vector de embeddings generado
   - Estadísticas del índice vectorial
   - Archivos más similares con scores y snippets

## Requisitos

- Tener una aplicación abierta (usa el `appPath` actual)
- El índice vectorial se construye automáticamente en background si no existe
- Primera búsqueda puede tardar más mientras se indexa el codebase

## Arquitectura

El playground reutiliza completamente la infraestructura de búsqueda semántica ya implementada:

- **Embeddings**: `src/ipc/utils/embeddings.ts` (Transformers.js + MiniLM)
- **Índice Vectorial**: `src/ipc/utils/vector_index.ts` (SQLite con embeddings)
- **File Watcher**: `src/ipc/utils/file_watcher.ts` (Indexación incremental)
- **Contexto Semántico**: `src/ipc/utils/semantic_context.ts` (API unificada)

No se añadió código duplicado - el playground simplemente expone esta funcionalidad existente a través de una interfaz visual para testing y debugging.

## Beneficios

1. **Testing interactivo** del sistema de embeddings y búsqueda semántica
2. **Debugging** de la calidad de los resultados de búsqueda
3. **Visualización** de cómo funcionan los embeddings
4. **Validación** de que el índice está actualizado y funcionando correctamente
5. **Exploración** de la similaridad semántica entre diferentes consultas

## Siguiente Pasos (Opcionales)

- [ ] Añadir visualización gráfica de los embeddings (ej: t-SNE, PCA)
- [ ] Comparar múltiples consultas simultáneamente
- [ ] Exportar resultados de búsqueda
- [ ] Historial de búsquedas recientes
- [ ] Configuración de parámetros (maxResults, similarity threshold)
- [ ] Modo de comparación: búsqueda semántica vs keyword matching
