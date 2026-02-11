# Sistema de Base de Conocimientos IA (v1.0)

El Sistema de Base de Conocimientos permite que el asistente aprenda de forma autónoma las reglas, patrones y convenciones específicas de cada proyecto conforme interactúas con él. Estas reglas se persisten por cada aplicación y se inyectan automáticamente en el prompt del sistema para asegurar la consistencia del código generado.

## Características Principales

### 1. Aprendizaje Continuo (Auto-Learning)
Vibes analiza cada conversación en segundo plano para identificar directivas implícitas o explícitas.
- **Detección de reglas**: Si dices "siempre usa nuestro componente de Dialog", el sistema crea una entrada automáticamente.
- **Detección de patrones**: Si creas un nuevo componente, el sistema lo registra como un componente personalizado disponible.
- **Silencioso**: La extracción ocurre de forma asíncrona (fire-and-forget) sin retrasar las respuestas del chat.

### 2. Categorización de Conocimiento
Las entradas se organizan en 5 categorías para una mejor densidad en el prompt:
- 📐 **Convención**: Estándares de código (ej: "Usar CamelCase para archivos TSX").
- 🔁 **Patrón**: Soluciones recurrentes (ej: "Usar React Query para todas las peticiones").
- ⚙️ **Preferencia**: Gustos del desarrollador (ej: "Prefiero CSS puro sobre Tailwind").
- 🚫 **Regla**: Restricciones críticas (ej: "Nunca usar `any`").
- 🧩 **Componente**: Inventario de componentes propios para evitar duplicación.

### 3. Inyección de Contexto Comprimido
Vibes inyecta un bloque `<knowledge_base>` ultra-denso en el System Prompt. Este bloque está diseñado para ocupar el mínimo espacio posible (+-500 tokens) mientras mantiene la máxima "atención" del modelo.

## Interfaz de Usuario

### Panel de Base de Conocimientos
Ubicado en la vista de **Detalles de la Aplicación**, este panel permite:
- **Visualización**: Ver qué ha aprendido la IA.
- **Gestión**: Activar/desactivar reglas específicas sin borrarlas.
- **Edición**: Borrar reglas obsoletas o mal extraídas.
- **Añadir Manualmente**: Definir reglas de forma proactiva antes de empezar a programar.

### Configuración del Modelo
En **Ajustes → Modelos y Conectividad**, puedes elegir qué modelo se encarga de la extracción de conocimiento.
- **Modelo por defecto**: `GPT-4o Mini` (o GPT-4.1) por su balance entre coste y capacidad de razonamiento.

## Detalles Técnicos

### Persistencia
Los datos se guardan en la tabla `knowledge_entries` de la base de datos local (SQLite/Drizzle). Cada entrada tiene:
- `app_id`: Relación con la aplicación.
- `source`: `manual`, `auto-extracted` (por heurística) o `inferred`.
- `confidence`: Puntuación de 0-100 para priorizar reglas sólidas.
- `enabled`: Toggle para activar/desactivar.

### Flujo de Datos
1. **Request**: Al enviar un mensaje, se recuperan todas las reglas `enabled` de la app.
2. **Prompt Builder**: Se agrupan por categoría y se comprimen en un formato Markdown minimalista.
3. **Response**: Al recibir la respuesta del asistente, se dispara el proceso de extracción en background.
4. **Extractor**: Aplica heurísticas de lenguaje natural para detectar intenciones de reglas o convenciones.

## Mejores Prácticas
- **Usa lenguaje directo**: Si quieres que la IA aprenda algo rápido, dile específicamente: "Recuerda que en este proyecto siempre usamos X para Y".
- **Limpia periódicamente**: Si la IA extrae algo incorrectamente, puedes desactivarlo desde el panel de Detalles de la App.
- **Combina con AI_RULES.md**: La base de conocimientos complementa el archivo `AI_RULES.md` estático, añadiendo una capa de memoria dinámica y evolutiva.
