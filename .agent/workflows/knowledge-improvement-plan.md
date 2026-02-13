---
description: Plan de mejora radical del sistema de Base de Conocimientos IA
---

# 🧠 Plan de Mejora Radical — Knowledge Base v2.0

## Diagnóstico del Problema Actual

El sistema actual extrae conocimiento de **cada** interacción chat de forma indiscriminada.
El prompt de extracción (en `knowledge_handlers.ts:106-140`) es demasiado permisivo:
- No distingue entre **convenciones estables** y **decisiones puntuales**
- No tiene contexto del conocimiento YA existente → genera duplicados semánticos
- No clasifica la **durabilidad** del conocimiento (permanente vs temporal)
- No detecta **contradicciones** con entradas existentes
- La deduplicación es por string exacto (`toLowerCase()`), no semántica
- No hay mecanismo de **expiración** o **decaimiento** de confianza
- No hay filtro de **ruido estructural** (paths, layouts, medidas CSS)

---

## Fase 1: Mejorar el Prompt de Extracción (Impacto Alto, Esfuerzo Bajo)

### Archivo: `src/ipc/handlers/knowledge_handlers.ts`

### 1.1 — Añadir reglas de exclusión explícitas al prompt

Modificar `extractKnowledgeWithAI()` (línea 106-140) para incluir reglas claras de **qué NO extraer**:

```
**QUÉ NO EXTRAER (NUNCA):**
- Rutas de archivos o imports específicos (ej: "importar desde ../../shared/")
- Medidas CSS o valores pixel concretos (ej: "botón de 56px", "max-w-sm")
- Layouts o disposiciones de columnas de una pantalla específica
- Nombres de campos de base de datos o tablas concretas
- Textos de contenido, copy o SEO
- Cambios temporales de refactoring (ej: "eliminar sección X", "renombrar Y a Z")
- Decisiones de diseño visual para una pantalla particular
- Configuraciones de duración de toasts, atajos de teclado, tamaños de preview
- Cualquier cosa que sea un DETALLE DE IMPLEMENTACIÓN, no una CONVENCIÓN
```

### 1.2 — Pedir al modelo que clasifique la durabilidad

Añadir un campo `durability` al output del extractor:

```typescript
// Nuevo campo en la extracción
durability: "permanent" | "project-phase" | "temporary"
```

Solo guardar automáticamente las entradas con durabilidad `permanent`.
Las `project-phase` se guardan con `enabled: false` para revisión manual.
Las `temporary` se descartan.

### 1.3 — Inyectar conocimiento existente en el prompt de extracción

Actualmente el extractor NO sabe qué ya existe. Modificar para incluir las entradas actuales:

```typescript
// Dentro de extractKnowledgeWithAI, antes de llamar al modelo:
const existingEntries = await db.query.knowledgeEntries.findMany({
    where: and(
        eq(knowledgeEntries.appId, appId),
        eq(knowledgeEntries.enabled, true),
    ),
});

const existingContext = existingEntries.map(e => `- [${e.category}] ${e.content}`).join('\n');
```

Y añadir al prompt:
```
**CONOCIMIENTO YA EXISTENTE:**
${existingContext}

- NO repitas conocimiento que ya existe (ni paráfrasis)
- Si detectas una CONTRADICCIÓN con algo existente, devuelve la nueva versión con confidence >= 95 y añade un campo "replaces": "contenido existente que contradice"
```

---

## Fase 2: Deduplicación Semántica (Impacto Alto, Esfuerzo Medio)

### Archivo: `src/ipc/handlers/knowledge_handlers.ts`

### 2.1 — Reemplazar deduplicación por string exacto con similitud semántica

Actualmente (líneas 300-306, 361-367):
```typescript
const existingContents = new Set(
    existing.map((e) => e.content.toLowerCase()),
);
const newEntries = candidates.filter(
    (c) => !existingContents.has(c.content.toLowerCase()),
);
```

**Opción A (simple, sin embeddings):** Usar similitud de tokens (Jaccard/Dice) como filtro rápido:

```typescript
function isSemanticallyDuplicate(newContent: string, existingContent: string): boolean {
    const normalize = (s: string) => s.toLowerCase()
        .replace(/[^\w\sáéíóúñ]/g, '')
        .split(/\s+/)
        .filter(w => w.length > 2);
    
    const newTokens = new Set(normalize(newContent));
    const existingTokens = new Set(normalize(existingContent));
    
    const intersection = [...newTokens].filter(t => existingTokens.has(t));
    const union = new Set([...newTokens, ...existingTokens]);
    
    const jaccard = intersection.length / union.size;
    return jaccard > 0.6; // Umbral de similitud
}
```

**Opción B (avanzada, con embeddings):** Reutilizar el sistema de embeddings que ya tiene el proyecto (MiniLM) para comparar vectores de similitud. Umbral de coseno >= 0.85 = duplicado.

### 2.2 — Detección de contradicciones

Si el extractor devuelve un campo `replaces`, buscar la entrada existente y:
1. Desactivar la entrada vieja (`enabled: false`)
2. Crear la nueva con una nota de que "reemplaza a #ID"

Añadir campo `supersededBy` a la tabla:
```sql
ALTER TABLE knowledge_entries ADD COLUMN superseded_by INTEGER REFERENCES knowledge_entries(id);
```

---

## Fase 3: Gobernanza y Ciclo de Vida (Impacto Medio, Esfuerzo Medio)

### 3.1 — Decaimiento de confianza

Las entradas auto-extraídas que nunca se confirman manualmente deberían perder confianza con el tiempo.

```typescript
// Ejecutar periódicamente (ej: cada 24h o al abrir la app)
async function decayUnconfirmedKnowledge(appId: number) {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 días
    
    await db
        .update(knowledgeEntries)
        .set({ 
            confidence: sql`MAX(confidence - 5, 30)` 
        })
        .where(and(
            eq(knowledgeEntries.appId, appId),
            eq(knowledgeEntries.source, "auto-extracted"),
            lt(knowledgeEntries.updatedAt, cutoff),
            gt(knowledgeEntries.confidence, 30),
        ));
}
```

### 3.2 — Límite máximo de entradas activas

Añadir un hard cap de entradas por app (ej: 50). Si se supera:
1. Ordenar por `confidence ASC`
2. Desactivar las de menor confianza hasta estar en el límite

Esto fuerza al sistema a mantener solo lo más relevante.

### 3.3 — Schema: Añadir campos de metadata

```sql
ALTER TABLE knowledge_entries ADD COLUMN durability TEXT DEFAULT 'permanent'; 
-- 'permanent', 'project-phase', 'temporary'

ALTER TABLE knowledge_entries ADD COLUMN superseded_by INTEGER;

ALTER TABLE knowledge_entries ADD COLUMN last_confirmed_at INTEGER;
-- Se actualiza cuando el usuario confirma/edita manualmente
```

---

## Fase 4: UI/UX del Panel de Conocimientos (Impacto Medio, Esfuerzo Medio)

### Archivo: `src/components/KnowledgeBaseModal.tsx`

### 4.1 — Bandeja de entrada de conocimiento pendiente

En lugar de auto-activar todo lo extraído, crear una sección "Pendiente de revisión":
- Entradas con `source: 'auto-extracted'` y `confidence < 85` se muestran en bandeja
- El usuario puede aprobar (→ confidence 100), editar, o descartar
- Badge con contador en el botón de Knowledge Base

### 4.2 — Indicadores de salud

Mostrar en el header del modal:
- **Entradas activas**: X / 50 máximo
- **Pendientes de revisión**: N
- **Contradicciones detectadas**: N (con highlight visual)

### 4.3 — Fusión asistida

Cuando se detectan entradas similares, ofrecer botón de "Fusionar" que:
1. Muestra las 2+ entradas similares
2. Sugiere una versión consolidada (via IA)
3. Desactiva las originales y crea la fusionada

### 4.4 — Botón "Limpiar ruido"

Un botón que ejecuta un análisis IA de todas las entradas activas y sugiere:
- Cuáles son ruido y deberían desactivarse
- Cuáles son redundantes y deberían fusionarse
- Cuáles se contradicen

---

## Fase 5: Optimización del Prompt de Inyección (Impacto Medio, Esfuerzo Bajo)

### Archivo: `src/ipc/handlers/knowledge_handlers.ts` → `buildKnowledgePrompt()`

### 5.1 — Priorización por relevancia

Actualmente se inyectan TODAS las entradas habilitadas ordenadas por confianza.
Mejorar con:

```typescript
// Limitar a top 30 entradas activas por confianza
// Las reglas (🚫) siempre se incluyen sin importar el ranking
const entries = await db.query.knowledgeEntries.findMany({
    where: and(
        eq(knowledgeEntries.appId, appId),
        eq(knowledgeEntries.enabled, true),
    ),
    orderBy: [desc(knowledgeEntries.confidence)],
    limit: 50,
});

// Siempre incluir reglas críticas
const rules = entries.filter(e => e.category === 'rule');
const rest = entries.filter(e => e.category !== 'rule').slice(0, 30 - rules.length);
const finalEntries = [...rules, ...rest];
```

### 5.2 — Formato más denso

Cambiar de formato lista Markdown a formato más compacto:

```
<knowledge_base>
📐 camelCase para archivos TSX | React Query para peticiones | ...
🔁 usePageConfig para traducciones | Supabase translations pattern | ...
🚫 NUNCA usar any | NUNCA alert() nativo | ...
🧩 Button, Card, Modal, ImagePicker, EmptyState, RichTextEditor
</knowledge_base>
```

Esto reduce tokens ~40% manteniendo la información.

---

## Fase 6: Validación Post-Extracción (Impacto Alto, Esfuerto Bajo)

### 6.1 — Filtros heurísticos antes de guardar

Añadir una función `isNoiseEntry()` que filtre antes de insertar:

```typescript
function isNoiseEntry(content: string): boolean {
    const noisePatterns = [
        // Rutas de archivos
        /(?:src|components|pages|shared|admin)\//i,
        /\.\.\//,
        /import.*from/i,
        // Medidas CSS
        /\d+px/,
        /max-w-/,
        /col-span-/,
        /grid-cols-/,
        // Layouts específicos
        /columna[s]?\s*(partida|dividida)/i,
        /disposición\s*(vertical|horizontal)/i,
        // Contenido/textos
        /texto.*debe.*ser/i,
        /cambiar.*texto/i,
        /mostrar.*en\s+español/i,
        // Acciones temporales
        /^(eliminar|borrar|quitar|mover|renombrar)\s/i,
        /^(añadir|agregar)\s.*a\s(la tabla|el formulario)/i,
        // Demasiado específico a una pantalla
        /en\s+(la sección|el admin|\/admin\/|la modal|la página)/i,
    ];
    
    return noisePatterns.some(pattern => pattern.test(content));
}
```

---

## Orden de Implementación Recomendado

| Prioridad | Fase | Esfuerzo | Impacto |
|-----------|------|----------|---------|
| 🟢 1 | Fase 1.1 — Exclusiones en prompt | 30 min | ⭐⭐⭐⭐⭐ |
| 🟢 2 | Fase 6.1 — Filtros heurísticos | 30 min | ⭐⭐⭐⭐⭐ |
| 🟢 3 | Fase 1.3 — Contexto existente | 1h | ⭐⭐⭐⭐ |
| 🟡 4 | Fase 5.2 — Formato más denso | 30 min | ⭐⭐⭐ |
| 🟡 5 | Fase 2.1 — Dedup semántica (Jaccard) | 1h | ⭐⭐⭐⭐ |
| 🟡 6 | Fase 1.2 — Durabilidad | 1h | ⭐⭐⭐ |
| 🟡 7 | Fase 3.2 — Límite de entradas | 30 min | ⭐⭐⭐ |
| 🔵 8 | Fase 4.1 — Bandeja pendientes UI | 2h | ⭐⭐⭐ |
| 🔵 9 | Fase 3.1 — Decaimiento | 1h | ⭐⭐ |
| 🔵 10 | Fase 3.3 — Schema migration | 1h | ⭐⭐ |
| 🔵 11 | Fase 2.2 — Contradicciones | 2h | ⭐⭐⭐ |
| ⚪ 12 | Fase 4.2-4.4 — UI avanzada | 3h | ⭐⭐ |
| ⚪ 13 | Fase 5.1 — Priorización | 30 min | ⭐⭐ |

**Tiempo total estimado: ~15h de desarrollo**

---

## Resumen Ejecutivo

El problema NO es que el sistema extraiga conocimiento. El problema es que:

1. **No sabe qué excluir** → Se arregla con el prompt mejorado (Fase 1.1) y filtros heurísticos (Fase 6.1)
2. **No sabe qué ya tiene** → Se arregla inyectando contexto existente (Fase 1.3)
3. **No distingue temporal de permanente** → Se arregla con durabilidad (Fase 1.2)
4. **No detecta duplicados semánticos** → Se arregla con Jaccard/embeddings (Fase 2.1)
5. **No tiene límites** → Se arregla con caps y decaimiento (Fase 3)
6. **No involucra al usuario** → Se arregla con bandeja de revisión (Fase 4.1)

Con solo las **Fases 1.1, 6.1, y 1.3** (~2h de trabajo) se eliminaría el **80% del ruido** que estás viendo.
