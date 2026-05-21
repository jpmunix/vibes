const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'src/components/admin_window/UserPreferencesEditor.tsx');
let content = fs.readFileSync(file, 'utf8');

// 1. Add "prompts" to Category type and CATEGORY_LABELS
content = content.replace(
  'type Category = "models" | "keys" | "appearance" | "behavior" | "internal" | "other";',
  'type Category = "models" | "keys" | "appearance" | "behavior" | "internal" | "other" | "prompts";'
);

content = content.replace(
  '    other: { icon: Package, label: "Otros" },',
  '    other: { icon: Package, label: "Otros" },\n    prompts: { icon: Bot, label: "Prompts y Contexto" },'
);

content = content.replace(
  'const CATEGORY_ORDER: Category[] = ["models", "keys", "appearance", "behavior", "internal", "other"];',
  'const CATEGORY_ORDER: Category[] = ["models", "keys", "appearance", "behavior", "prompts", "internal", "other"];'
);

// 2. Update categorizeKey function
content = content.replace(
  'function categorizeKey(key: string): Category {\n    // ── Models & providers ──',
  `function categorizeKey(key: string): Category {
    if (key.startsWith("prompt:")) return "prompts";
    // ── Models & providers ──`
);

// 3. Update detectValueType function so it shows as JSON or text.
// The prompts are sometimes JSON or just long text. By default, detectValueType returns "string" for long text.
// Wait, prompt keys start with "prompt:". We can force them to be "json" or "string" as usual.
// detectValueType will just fall through to string which is fine (it uses pretty print fallback).
// Wait, no changes needed for detectValueType! Long text is rendered with pretty-printing if it parses, or as string fallback.
// Actually, string fallback doesn't allow editing with textarea!
// The UserPreferencesEditor only provides "inline within the compact row" for string.
// Let's see how long text is edited.
// Ah, the UserPreferencesEditor doesn't have a textarea editor! For string, it just does a standard inline input:
/*
    // Fallback editor for string, secret, json, etc.
    return (
        <div className="flex items-center gap-2 p-4 bg-muted/10">
            ...
            <input value={editValue} ... />
        </div>
    );
*/
// Let's replace the fallback editor with textarea if it's a prompt or a long string.
