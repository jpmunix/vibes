# AI Knowledge Base (Base de Conocimientos IA) — v2.0

## Overview

The Knowledge Base allows the AI to **automatically learn** project-specific conventions, patterns, preferences, and rules from conversations, and apply them consistently across all future interactions.

### What Changed in v2.0

- **Smarter extraction**: The AI now explicitly excludes implementation details, file paths, CSS values, and transient decisions
- **Durability classification**: Every extracted entry is classified as `permanent`, `project-phase`, or `temporary`
- **Semantic deduplication**: Uses Jaccard token similarity (threshold ≥ 0.55) instead of exact string matching
- **Contradiction detection**: New entries that contradict existing ones supersede them automatically
- **Confidence decay**: Auto-extracted entries lose confidence over time if not manually confirmed
- **Entry cap**: Maximum 50 active entries per app, lowest-confidence entries are auto-disabled
- **Noise filters**: 20+ regex patterns filter implementation details before storage
- **Pending review**: Low-confidence and `project-phase` entries go to a review queue instead of being auto-activated
- **Health analysis**: AI-powered analysis to detect noise, redundancies, and contradictions in existing entries

## Features

- **Continuous Learning**: The AI extracts knowledge from every conversation (max 2 entries per interaction)
- **Knowledge Categories**:
  - 📐 **Convention** — Code standards (e.g., "use camelCase for TSX files")
  - 🔁 **Pattern** — Recurring architectural patterns (e.g., "use React Query for all API requests")
  - ⚙️ **Preference** — Stable dev preferences (e.g., "prefer CSS modules over Tailwind")
  - 🚫 **Rule** — Absolute prohibitions (e.g., "NEVER use `any` type")  
  - 🧩 **Component** — Mandatory project components (e.g., "use our custom Dialog, not `confirm()`")
- **Context-Aware**: The extractor sees existing knowledge and avoids semantic duplicates and contradictions
- **Compressed Prompt Injection**: Active entries are injected into the system prompt in a dense format
- **Pending Review Queue**: Low-confidence entries require manual approval before activation

## UI

The Knowledge Base is accessible from **Application Details → Base de Conocimientos IA** button.

### Tabs
- **Activas**: Enabled entries grouped by category. Rules always appear regardless of cap.
- **Pendientes**: Auto-extracted entries that need review (low confidence or `project-phase` durability)

### Actions
- **Limpiar ruido**: AI-powered analysis that flags noise, redundancies, and contradictions
- **Aprobar todas / Descartar todas**: Bulk actions for pending entries
- **Manual add/edit/toggle/delete**: Full CRUD on individual entries

### Health Indicators
- Active count vs MAX_ENTRIES cap (50)  
- Pending review count with pulse animation
- Inline flags: 🟥 Noise, 🟡 Contradiction, 🟠 Redundant

## Technical Details

### Data

Stored in the `knowledge_entries` SQLite table (Drizzle ORM):

| Column | Type | Description |
|--------|------|-------------|
| `id` | integer | Primary key |
| `app_id` | integer | FK to apps |
| `category` | text | convention, pattern, preference, rule, component |
| `content` | text | The actual knowledge text |
| `source` | text | manual, auto-extracted, inferred |
| `confidence` | integer | 0-100 score |
| `enabled` | boolean | Whether the entry is active |
| `durability` | text | permanent, project-phase, temporary |
| `superseded_by` | integer | ID of entry that replaced this one |
| `last_confirmed_at` | timestamp | When user last manually confirmed |
| `created_at` | timestamp | Creation time |
| `updated_at` | timestamp | Last update time |

### Flow

1. **Request** → Retrieve enabled rules → Compress → Inject into system prompt → AI response
2. **After Response** → Background extraction → Noise filter → Semantic dedup → Durability check → Store (active or pending)
3. **On App Open** → Run confidence decay on stale auto-extracted entries
4. **Manual Action** → Health analysis → Flag noise/redundancies/contradictions

### Knowledge Model

The extraction model uses the main selected model (configurable in Settings). Temperature is set to 0.2 for deterministic extraction.

### Noise Filtering Pipeline

1. **AI-level**: Explicit exclusion rules in the extraction prompt (paths, CSS, layouts, copy, refactoring actions)
2. **Heuristic-level**: 20+ regex patterns catch remaining noise before database insertion
3. **Durability-level**: `temporary` entries are discarded; `project-phase` go to pending review
4. **Confidence-level**: Entries below 85% confidence go to pending review
5. **Semantic dedup**: Jaccard similarity ≥ 0.55 = duplicate
6. **Entry cap**: Max 50 active entries; lowest-confidence entries auto-disabled

## Best Practices

- **Use direct, declarative language** when teaching: "Siempre usar X" or "Nunca hacer Y"
- **Review pending entries periodically** to approve good ones and discard noise
- **Run health analysis** occasionally to clean up accumulated entries
- **Manual entries have confidence 100** and never decay
- **Complement with static `AI_RULES.md`** for project-wide rules that shouldn't change
