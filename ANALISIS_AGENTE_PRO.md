# Análisis Exhaustivo: Problemas de Eficiencia del Agente Pro

## 🔴 PROBLEMAS CRÍTICOS IDENTIFICADOS

### 1. **CONTEXTO MASIVO SIN FILTRADO INTELIGENTE**

#### Problema Principal:

El agente carga **TODA LA CODEBASE** en cada request, sin importar la relevancia:

```typescript
// src/ipc/handlers/chat_stream_handlers.ts:709-712
let { formattedOutput: codebaseInfo, files } = await extractCodebase({
  appPath,
  chatContext,
});
```

**Consecuencias:**

- ✗ Se envían **TODOS los archivos** del proyecto (~60-200+ archivos)
- ✗ Cada archivo se formatea como XML: `<dyad-file path="...">content</dyad-file>`
- ✗ Token count masivo: ~50k-200k tokens solo en codebase
- ✗ El modelo debe procesar todo esto CADA VEZ

#### Evidencia del Código:

**extractCodebase()** lee recursivamente TODO:

```typescript
// src/utils/codebase.ts:249-310
async function collectFiles(dir: string, baseDir: string): Promise<string[]> {
  // Recorre RECURSIVAMENTE todo el directorio
  const entries = await fsAsync.readdir(dir, { withFileTypes: true });

  // Solo excluye node_modules, .git, dist, build
  if (entry.isDirectory() && EXCLUDED_DIRS.includes(entry.name)) {
    return;
  }

  // Incluye TODO lo demás que matchee las extensiones
  files.push(fullPath);
}
```

**Archivos incluidos por defecto:**

```typescript
// src/utils/codebase.ts:14-50
const ALLOWED_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".css",
  ".html",
  ".md",
  ".astro",
  ".vue",
  ".svelte",
  ".json",
  ".yml",
  ".yaml",
  ".xml",
  ".plist",
  ".kt",
  ".java",
  ".gradle",
  ".swift",
  ".py",
  ".php",
];
// Esto es MASIVO
```

---

### 2. **RANKING LOCAL INEFICIENTE**

#### El "Smart Context Local" es Primitivo:

```typescript
// src/ipc/utils/local_ranker.ts:7-43
export function rankFilesLocally({
  prompt,
  files,
  maxResults = 60,
}: {
  prompt: string;
  files: CodebaseFile[];
  maxResults?: number;
}): RankedFile[] {
  const terms = prompt.toLowerCase().split(/\s+/).filter(Boolean);

  // ❌ Simple keyword matching en path y content
  for (const term of terms) {
    if (pathLower.includes(term)) {
      score += 6; // Bonus por path
    }
    const matches = contentLower.split(term).length - 1;
    score += Math.min(matches, 6); // Bonus por contenido
  }

  // ❌ Bonus arbitrario por tamaño
  const lengthBonus = Math.max(0, 4 - Math.floor(file.content.length / 4000));
  score += lengthBonus;
}
```

**Problemas:**

- ✗ **NO usa embeddings** ni semantic search
- ✗ **NO entiende contexto** (solo keywords)
- ✗ Ranking super básico (suma de matches)
- ✗ Se ejecuta DESPUÉS de cargar todo en memoria
- ✗ Sigue enviando 60 archivos al LLM (demasiado)

#### Cuándo se Activa:

```typescript
// src/ipc/handlers/chat_stream_handlers.ts:715-750
const useLocalContext =
  (!isEngineEnabled || disableRemoteEngine) &&
  settings.enableProSmartFilesContextMode &&
  settings.enableLocalSmartContext !== false;

if (useLocalContext) {
  // Solo DESPUÉS de cargar TODO
  ranked = rankFilesLocally({
    prompt: req.prompt,
    files, // ← Ya tiene TODOS los archivos
    maxResults: 60, // ← Envía 60 archivos (mucho)
  });

  if (ranked && ranked.length > 0) {
    files = ranked;
    codebaseInfo = buildCodebaseXml(ranked);
  }
}
```

---

### 3. **CONTEXTO VERSIONADO DUPLICA INFORMACIÓN**

#### Deep Context Mode Genera Overhead Masivo:

```typescript
// src/ipc/handlers/chat_stream_handlers.ts:1182-1188
if (isDeepContextEnabled) {
  versionedFiles = await getVersionedFiles({
    files,
    chatMessages,
    appPath,
  });
}
```

**Qué hace:**

```typescript
// src/ipc/utils/versioned_codebase_context.ts:97-126
export async function processChatMessagesWithVersionedFiles({
  files,
  chatMessages,
  appPath,
}) {
  const fileIdToContent: Record<string, string> = {};

  for (const file of files) {
    // ❌ Genera hash SHA-256 para CADA archivo
    const fileId = crypto
      .createHash("sha256")
      .update(file.content)
      .digest("hex");

    fileIdToContent[fileId] = file.content;
    // ❌ Crea referencias adicionales
  }

  // ❌ Luego parsea TODOS los mensajes del chat
  for (
    let messageIndex = 0;
    messageIndex < chatMessages.length;
    messageIndex++
  ) {
    // Extrae archivos de cada mensaje
    // Obtiene versiones de git para cada archivo
  }
}
```

**Problemas:**

- ✗ Procesa TODOS los archivos + TODOS los mensajes del chat
- ✗ Hace git checkout de versiones anteriores de archivos
- ✗ Genera estructuras de datos masivas (fileIdToContent)
- ✗ Aumenta latencia pre-LLM significativamente

---

### 4. **SYSTEM PROMPT GIGANTE**

#### Prompts Extremadamente Largos:

```typescript
// src/prompts/system_prompt.ts:61-320
export const BUILD_SYSTEM_PREFIX = `
<role> You are Dyad, an AI editor... </role>

# App Preview / Commands
[~200 líneas de instrucciones detalladas]

# Guidelines
[~100 líneas más]

# Examples
[~150 líneas de ejemplos de código completos]
`;

export const BUILD_SYSTEM_POSTFIX = `
Directory names MUST be all lower-case...
[~50 líneas más]
`;
```

**System Prompt Total:**

- BUILD_SYSTEM_PREFIX: ~2,500 tokens
- AI_RULES (DEFAULT): ~400 tokens
- BUILD_SYSTEM_POSTFIX: ~300 tokens
- TURBO_EDITS_V2_SYSTEM_PROMPT: ~1,000 tokens
- Theme prompt (opcional): ~200 tokens
- **TOTAL: ~4,500 tokens SOLO en system prompt**

#### Local Agent Prompt Similar:

```typescript
// src/prompts/local_agent_prompt.ts:185-201
export const LOCAL_AGENT_SYSTEM_PROMPT = `
${ROLE_BLOCK}
${APP_COMMANDS_BLOCK}
${GENERAL_GUIDELINES_BLOCK}
${TOOL_CALLING_BLOCK}
${PRO_TOOL_CALLING_BEST_PRACTICES_BLOCK}
${PRO_FILE_EDITING_TOOL_SELECTION_BLOCK}
${PRO_DEVELOPMENT_WORKFLOW_BLOCK}
[[AI_RULES]]
`;
```

**Total: ~5,000-6,000 tokens** para local agent mode

---

### 5. **HISTORIAL DE CHAT SIN LÍMITE EFECTIVO**

```typescript
// src/ipc/handlers/chat_stream_handlers.ts:846-881
const maxChatTurns = isDeepContextEnabled
  ? 201 // ❌ 201 turnos = ~400 mensajes!
  : (settings.maxChatTurnsInContext || MAX_CHAT_TURNS_IN_CONTEXT) + 1;

let limitedMessageHistory = messageHistory;
if (messageHistory.length > maxChatTurns * 2) {
  recentMessages = messageHistory
    .filter((msg) => msg.role !== "system")
    .slice(-maxChatTurns * 2);

  limitedMessageHistory = [...recentMessages];
}
```

**Problemas:**

- ✗ Deep Context permite **201 turnos = 402 mensajes**
- ✗ Cada mensaje puede tener miles de tokens
- ✗ Mensajes contienen respuestas del LLM con código completo
- ✗ Se acumula fácilmente 50k-100k tokens solo en historial

---

### 6. **TAGS XML VERBOSOS**

Cada archivo se envuelve en tags XML pesados:

```typescript
// src/ipc/utils/local_ranker.ts:45-52
export function buildCodebaseXml(files: CodebaseFile[]): string {
  return files
    .map(
      (file) =>
        `<dyad-file path="${file.path}">\n${file.content}\n</dyad-file>\n`,
    )
    .join("\n");
}
```

**Overhead:**

- Cada archivo: `<dyad-file path="src/...">\n` + contenido + `</dyad-file>\n`
- Para 60 archivos: ~1,500 tokens adicionales solo en tags
- Más tags en respuestas: `<dyad-write>`, `<dyad-read>`, `<dyad-search-replace>`, etc.

---

## 📊 CÁLCULO ESTIMADO DE TOKENS POR REQUEST

### Escenario Típico (Pro Mode, Deep Context):

| Componente                                  | Tokens             |
| ------------------------------------------- | ------------------ |
| System Prompt                               | 5,000              |
| Codebase (60 archivos @ 500 tokens avg)     | 30,000             |
| XML Tags overhead                           | 1,500              |
| Chat History (50 mensajes @ 500 tokens avg) | 25,000             |
| Mentioned Apps (opcional)                   | 10,000             |
| Supabase Context (opcional)                 | 3,000              |
| Theme Prompt                                | 200                |
| User prompt actual                          | 100                |
| **TOTAL INPUT**                             | **~74,800 tokens** |

### Con Versioned Files (Deep Context):

- Agrega overhead de git hashes: +2,000 tokens
- File reference structures: +3,000 tokens
- **TOTAL: ~80,000 tokens**

### Output:

- Respuesta típica del LLM: 2,000-5,000 tokens
- Con código: 5,000-15,000 tokens
- **TOTAL OUTPUT: ~5,000-15,000 tokens**

### **POR REQUEST: 75k-95k tokens (input + output)**

---

## 🚫 POR QUÉ EL AGENTE ES "INÚTIL"

### 1. **Contexto Saturado = Peor Razonamiento**

- El modelo recibe demasiada información irrelevante
- Pierde el foco en lo importante
- Hallucinations aumentan con contexto largo

### 2. **Latencia Alta**

- Cargar toda la codebase: 1-3 segundos
- Versioned files + git operations: +2-4 segundos
- LLM processing (75k tokens): 10-30 segundos
- **Total: 15-40 segundos por respuesta**

### 3. **Respuestas Genéricas**

- Con tanto contexto, el modelo "escanea" superficialmente
- No profundiza en archivos específicos
- Respuestas vagas o incorrectas

### 4. **Costo Excesivo**

- 75k tokens input @ $2.50/1M = $0.19 por request
- 10k tokens output @ $10/1M = $0.10 por request
- **~$0.30 por mensaje**
- Con Claude Opus: **~$1.50 por mensaje**

---

## ✅ SOLUCIONES PROPUESTAS

### 🎯 **SOLUCIÓN 1: Sistema de Indexación Local con Embeddings**

**Implementar búsqueda semántica LOCAL (sin servidor externo):**

#### Opción A: SQLite con vector extension

```bash
npm install better-sqlite3 sqlite-vss
```

```typescript
// src/ipc/utils/vector_index.ts
import Database from "better-sqlite3";
import { embed } from "./embeddings"; // Ver opción B

interface VectorIndex {
  addFile(path: string, content: string): Promise<void>;
  search(query: string, k: number): Promise<string[]>;
}

export class LocalVectorIndex implements VectorIndex {
  private db: Database.Database;

  constructor(appPath: string) {
    this.db = new Database(path.join(appPath, ".dyad", "vector_index.db"));
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS file_embeddings USING vss0(
        embedding(768)
      );
      CREATE TABLE IF NOT EXISTS file_metadata (
        id INTEGER PRIMARY KEY,
        path TEXT UNIQUE,
        content_hash TEXT,
        last_indexed INTEGER
      );
    `);
  }

  async addFile(filePath: string, content: string): Promise<void> {
    const hash = crypto.createHash("sha256").update(content).digest("hex");

    // Check if file changed
    const existing = this.db
      .prepare("SELECT content_hash FROM file_metadata WHERE path = ?")
      .get(filePath);

    if (existing?.content_hash === hash) return; // Skip if unchanged

    // Generate embedding (chunks if needed)
    const chunks = this.chunkContent(content, 1000);
    const embeddings = await Promise.all(chunks.map((chunk) => embed(chunk)));

    // Store in database
    this.db.transaction(() => {
      this.db
        .prepare(
          "DELETE FROM file_embeddings WHERE rowid IN (SELECT id FROM file_metadata WHERE path = ?)",
        )
        .run(filePath);
      this.db.prepare("DELETE FROM file_metadata WHERE path = ?").run(filePath);

      const info = this.db
        .prepare(
          "INSERT INTO file_metadata (path, content_hash, last_indexed) VALUES (?, ?, ?)",
        )
        .run(filePath, hash, Date.now());

      for (const embedding of embeddings) {
        this.db
          .prepare(
            "INSERT INTO file_embeddings (rowid, embedding) VALUES (?, ?)",
          )
          .run(info.lastInsertRowid, embedding);
      }
    })();
  }

  async search(query: string, k: number = 10): Promise<string[]> {
    const queryEmbedding = await embed(query);

    const results = this.db
      .prepare(
        `
      SELECT fm.path, vss_distance(fe.embedding, ?) as distance
      FROM file_embeddings fe
      JOIN file_metadata fm ON fe.rowid = fm.id
      ORDER BY distance
      LIMIT ?
    `,
      )
      .all(queryEmbedding, k);

    return results.map((r) => r.path);
  }

  private chunkContent(content: string, maxChars: number): string[] {
    // Smart chunking by functions/classes/paragraphs
    const chunks: string[] = [];
    let current = "";

    for (const line of content.split("\n")) {
      if (current.length + line.length > maxChars && current.length > 0) {
        chunks.push(current);
        current = "";
      }
      current += line + "\n";
    }

    if (current) chunks.push(current);
    return chunks;
  }
}
```

#### Opción B: Embeddings Locales con Transformers.js

```bash
npm install @xenova/transformers
```

```typescript
// src/ipc/utils/embeddings.ts
import { pipeline, env } from "@xenova/transformers";

// Disable remote models, use local cache
env.allowLocalModels = true;
env.allowRemoteModels = false;

let embedder: any = null;

export async function initEmbeddings() {
  if (!embedder) {
    // Use small, fast model (e.g., all-MiniLM-L6-v2: 80MB, 384 dims)
    embedder = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  }
  return embedder;
}

export async function embed(text: string): Promise<Float32Array> {
  const model = await initEmbeddings();
  const output = await model(text, { pooling: "mean", normalize: true });
  return output.data;
}
```

#### Integración:

```typescript
// src/ipc/utils/smart_context.ts
import { LocalVectorIndex } from "./vector_index";
import { CodebaseFile } from "@/utils/codebase";

export async function getSmartContext({
  appPath,
  prompt,
  maxFiles = 15, // ✅ Reducido de 60
}: {
  appPath: string;
  prompt: string;
  maxFiles?: number;
}): Promise<CodebaseFile[]> {
  const index = new LocalVectorIndex(appPath);

  // Search semantically similar files
  const relevantPaths = await index.search(prompt, maxFiles);

  // Load only relevant files
  const files = await Promise.all(
    relevantPaths.map(async (path) => ({
      path,
      content: await readFileWithCache(join(appPath, path)),
    })),
  );

  return files.filter((f) => f.content != null);
}
```

**Beneficios:**

- ✅ Búsqueda semántica real (entiende conceptos)
- ✅ 100% local, sin llamadas externas
- ✅ Rápido: <500ms para búsqueda
- ✅ Reduce archivos de 60 → 10-15
- ✅ **Ahorro: ~35k tokens por request**

---

### 🎯 **SOLUCIÓN 2: Lazy Loading de Archivos**

**Solo enviar paths al LLM inicialmente, dejar que pida archivos específicos:**

```typescript
// src/ipc/handlers/chat_stream_handlers.ts

// Enviar solo estructura inicial
const fileTree = await buildFileTree(appPath);
const initialContext = `
<codebase-structure>
${fileTree}
</codebase-structure>

To read a file, use: <dyad-read path="file/path.ts" />
`;

// El LLM pide archivos cuando los necesita
// Esto ya existe parcialmente en local-agent mode
```

**System Prompt Actualizado:**

```
Instead of receiving all file contents upfront, you'll see the file structure.
When you need to read a file, use <dyad-read path="..." />.
Only request files that are directly relevant to the user's task.
```

**Beneficios:**

- ✅ Reduce input inicial a ~5k tokens
- ✅ El modelo solo lee lo que necesita
- ✅ Más "agéntico" (decide qué leer)
- ✅ **Ahorro: ~30k-40k tokens por request**

---

### 🎯 **SOLUCIÓN 3: Cacheo Agresivo de Prompt**

**Usar prompt caching de Anthropic/OpenAI:**

```typescript
// src/ipc/utils/get_model_client.ts

// Split prompt into cacheable sections
const cacheablePrompt = {
  system: [
    {
      type: "text",
      text: systemPrompt,
      cache_control: { type: "ephemeral" }, // Cache 5 min
    },
    {
      type: "text",
      text: codebaseStructure, // File tree, no contents
      cache_control: { type: "ephemeral" },
    },
  ],
};

// Only AI_RULES, theme, and codebase structure change rarely
// Rest of conversation is not cached
```

**Beneficios:**

- ✅ Cache hit = 90% descuento en tokens
- ✅ System prompt (~5k tokens) casi gratis
- ✅ Codebase structure (~2k tokens) casi gratis
- ✅ **Ahorro: ~$0.15 por request con cache hit**

---

### 🎯 **SOLUCIÓN 4: Comprimir System Prompt**

**Reducir dramáticamente el system prompt:**

```typescript
// src/prompts/system_prompt_v2.ts

export const COMPACT_SYSTEM_PROMPT = `
You are Dyad, an AI code editor. Users see live preview while you edit.

## Core Actions
- Read files: <dyad-read path="..." />
- Write files: <dyad-write path="..." description="...">content</dyad-write>
- Search & replace: <dyad-search-replace path="...">
    <search>old text</search>
    <replace>new text</replace>
  </dyad-search-replace>
- Install deps: <dyad-add-dependency packages="pkg1 pkg2" />
- Rename: <dyad-rename from="..." to="..." />
- Delete: <dyad-delete path="..." />

## Rules
1. Only change what user requests
2. Write complete, working code (no TODOs)
3. Read files before editing
4. Verify changes with type checks
5. Keep explanations brief

## Tech Stack
${AI_RULES}
`;

// ~1,500 tokens vs 5,000 tokens
```

**Beneficios:**

- ✅ Reduce system prompt de 5k → 1.5k tokens
- ✅ Más fácil para el modelo procesar
- ✅ **Ahorro: ~3.5k tokens por request**

---

### 🎯 **SOLUCIÓN 5: Streaming Incremental de Contexto**

**Enviar contexto en pasos, solo lo necesario:**

```typescript
// Paso 1: Prompt inicial minimal
const step1 = await streamText({
  system: COMPACT_SYSTEM_PROMPT,
  messages: [{ role: "user", content: userPrompt }],
  // No codebase context
});

// Si el LLM indica que necesita más contexto:
if (step1.response.includes("need to read")) {
  const requestedFiles = parseFilesFromResponse(step1.response);

  // Paso 2: Enviar solo archivos solicitados
  const step2 = await streamText({
    messages: [
      ...previousMessages,
      { role: "assistant", content: step1.response },
      {
        role: "user",
        content: `Here are the files:\n${loadFiles(requestedFiles)}`,
      },
    ],
  });
}
```

**Beneficios:**

- ✅ Request inicial: ~8k tokens
- ✅ Requests subsecuentes solo con archivos necesarios
- ✅ Reduce dramáticamente tokens promedio
- ✅ **Ahorro: ~40k-50k tokens por request**

---

### 🎯 **SOLUCIÓN 6: Índice Incremental en Background**

**Indexar archivos modificados automáticamente:**

```typescript
// src/ipc/utils/file_watcher.ts
import chokidar from "chokidar";

export class IncrementalIndexer {
  private watcher: chokidar.FSWatcher;
  private index: LocalVectorIndex;
  private pendingFiles: Set<string> = new Set();
  private indexTimer: NodeJS.Timeout | null = null;

  constructor(appPath: string) {
    this.index = new LocalVectorIndex(appPath);

    this.watcher = chokidar.watch(appPath, {
      ignored: /(node_modules|\.git|dist|build)/,
      persistent: true,
    });

    this.watcher.on("change", (filePath) => {
      this.pendingFiles.add(filePath);
      this.scheduleIndex();
    });
  }

  private scheduleIndex() {
    if (this.indexTimer) clearTimeout(this.indexTimer);

    // Batch index after 2 seconds of no changes
    this.indexTimer = setTimeout(async () => {
      for (const filePath of this.pendingFiles) {
        const content = await readFileWithCache(filePath);
        if (content) {
          await this.index.addFile(filePath, content);
        }
      }
      this.pendingFiles.clear();
    }, 2000);
  }
}

// Start watcher when app opens
// src/ipc/handlers/app_handlers.ts
const indexer = new IncrementalIndexer(appPath);
```

**Beneficios:**

- ✅ Índice siempre actualizado
- ✅ No bloquea requests del usuario
- ✅ Búsquedas instantáneas

---

## 📈 IMPACTO ESPERADO

### Con TODAS las optimizaciones implementadas:

| Métrica           | Antes  | Después    | Mejora             |
| ----------------- | ------ | ---------- | ------------------ |
| **Tokens Input**  | 75,000 | 12,000     | **84% reducción**  |
| **Tokens Output** | 8,000  | 8,000      | -                  |
| **Costo por msg** | $0.30  | $0.05      | **83% ahorro**     |
| **Latencia**      | 25s    | 8s         | **68% más rápido** |
| **Calidad**       | ⭐⭐   | ⭐⭐⭐⭐⭐ | **Mejor foco**     |

### Implementando solo las soluciones más simples (1, 4, 5):

| Métrica           | Antes  | Después | Mejora             |
| ----------------- | ------ | ------- | ------------------ |
| **Tokens Input**  | 75,000 | 25,000  | **67% reducción**  |
| **Costo por msg** | $0.30  | $0.10   | **67% ahorro**     |
| **Latencia**      | 25s    | 12s     | **52% más rápido** |

---

## 🛠️ PLAN DE IMPLEMENTACIÓN RECOMENDADO

### Fase 1 (Quick Wins - 1 día):

1. ✅ Comprimir system prompt (Solución 4)
2. ✅ Reducir maxFiles de 60 → 20 en local ranker
3. ✅ Deshabilitar versioned files por defecto

**Resultado esperado: -30k tokens, +40% velocidad**

### Fase 2 (Embeddings Locales - 2-3 días):

1. ✅ Integrar @xenova/transformers
2. ✅ Implementar LocalVectorIndex con SQLite
3. ✅ Reemplazar rankFilesLocally con semantic search

**Resultado esperado: -25k tokens adicionales, +50% relevancia**

### Fase 3 (Lazy Loading - 2 días):

1. ✅ Modificar system prompt para lazy loading
2. ✅ Enviar solo file tree inicialmente
3. ✅ Mejorar dyad-read tool en local agent

**Resultado esperado: -20k tokens adicionales, mejor control**

### Fase 4 (Optimizaciones Avanzadas - 3-4 días):

1. ✅ Implementar prompt caching
2. ✅ File watcher + incremental indexing
3. ✅ Streaming incremental de contexto

**Resultado esperado: -$0.20 por mensaje, siempre actualizado**

---

## 🔧 CÓDIGO DE REFERENCIA PARA EMPEZAR

### Quick Win: Reducir System Prompt

```typescript
// src/prompts/system_prompt_compact.ts
export const COMPACT_BUILD_PROMPT = `You are Dyad, an AI code editor for React apps.

## Actions
- <dyad-write path="...">code</dyad-write> - Create/update files
- <dyad-read path="..." /> - Read files (use before editing)
- <dyad-search-replace path="..."><search>old</search><replace>new</replace></dyad-search-replace>
- <dyad-add-dependency packages="pkg1 pkg2" />
- <dyad-rename from="..." to="..." />
- <dyad-delete path="..." />

## Rules
1. Read before editing
2. Only change what's requested
3. Complete implementations (no TODOs)
4. Brief explanations
5. Set chat summary: <dyad-chat-summary>title</dyad-chat-summary>

${AI_RULES}
`;
```

### Quick Win: Reducir Archivos Enviados

```typescript
// src/ipc/handlers/chat_stream_handlers.ts:735
// Cambiar de 60 → 15
ranked = rankFilesLocally({
  prompt: req.prompt,
  files,
  maxResults: 15, // ← Cambiar aquí
});
```

### Quick Win: Deshabilitar Versioned Files

```typescript
// src/ipc/handlers/chat_stream_handlers.ts:1182
// Comentar o añadir flag
const useVersionedFiles = false; // ← Desactivar temporalmente

if (isDeepContextEnabled && useVersionedFiles) {
  versionedFiles = await getVersionedFiles({
    files,
    chatMessages,
    appPath,
  });
}
```

---

## 📋 CONCLUSIONES

El agente Pro tiene problemas fundamentales de arquitectura:

1. **Demasiado contexto** = modelo confundido + lento + caro
2. **No hay búsqueda inteligente** = archivos irrelevantes incluidos
3. **System prompts masivos** = desperdicio de tokens
4. **Sin cacheo** = re-procesa todo cada vez

Las soluciones propuestas son:

- ✅ **Implementables localmente** (sin servidores externos)
- ✅ **Compatibles con OpenRouter** (solo usa su API para LLM)
- ✅ **Incrementales** (implementa en fases)
- ✅ **Alto impacto** (67-84% reducción de tokens)

**Recomendación inmediata:** Implementar Fase 1 (Quick Wins) hoy mismo. Verás mejoras inmediatas.
