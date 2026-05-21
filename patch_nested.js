const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'src/components/admin_window/UserPreferencesEditor.tsx');
let content = fs.readFileSync(file, 'utf8');

// 1. Add NestedCategory component at the top
content = content.replace(
  '// ── Category grouping ───────────────────────────────────────────────────────',
  `// ── Nested Category ─────────────────────────────────────────────────────────

function NestedCategory({ title, entries, onSave, onDelete, allModels }: any) {
    const [isCollapsed, setIsCollapsed] = React.useState(true);
    return (
        <div className="border-b border-border/20 last:border-0 bg-muted/5">
            <button
                type="button"
                className="w-full flex items-center justify-between px-5 py-2 hover:bg-muted/20 transition-colors cursor-pointer"
                onClick={() => setIsCollapsed(!isCollapsed)}
            >
                <span className="typo-caption text-foreground font-medium flex items-center gap-2">
                    {title}
                    <span className="text-muted-foreground/60">({entries.length})</span>
                </span>
                <ChevronDown
                    size={12}
                    className={cn(
                        "text-muted-foreground/50 transition-transform duration-150",
                        isCollapsed && "-rotate-90",
                    )}
                />
            </button>
            {!isCollapsed && (
                <div className="divide-y divide-border/20 border-t border-border/10 bg-background">
                    {entries.map((pref: any) => (
                        <PrefRow key={pref.key} pref={pref} onSave={onSave} onDelete={onDelete} allModels={allModels} />
                    ))}
                </div>
            )}
        </div>
    );
}

// ── Category grouping ───────────────────────────────────────────────────────`
);

// 2. Add React prefix to useState since it's imported as { useState } maybe? No, we can just use useState. But it's safer to use React.useState or import React. Let's just fix the import if necessary, but actually we can just use React.useState if React is imported.
// Wait, React is usually imported in these files, let's just use `useState` because it's imported at the top!
content = content.replace('React.useState(true)', 'useState(true)');

// 3. Restore CATEGORY_ORDER and CATEGORY_LABELS
content = content.replace(
  '    other: { icon: Package, label: "Otros" },',
  '    prompts: { icon: Bot, label: "Prompts y Contexto" },\n    other: { icon: Package, label: "Otros" },'
);
content = content.replace(
  'const CATEGORY_ORDER: string[] = ["models", "keys", "appearance", "behavior", "internal", "other"];',
  'const CATEGORY_ORDER: string[] = ["models", "keys", "appearance", "behavior", "prompts", "internal", "other"];'
);

// 4. Update categorizeKey
content = content.replace(
  'function categorizeKey(key: string): string {',
  `function categorizeKey(key: string): string {
    if (key.startsWith("prompt:")) return "prompts";`
);

// 5. Update fetchPrefs mapping
content = content.replace(
  '                category: (p as any).displayCategory || categorizeKey(p.key),',
  `                category: categorizeKey(p.key),
                subCategory: (p as any).displayCategory === "Prompts y Contexto" ? undefined : (p as any).displayCategory,`
);

// 6. Update entries mapping inside !isCollapsed
const oldEntriesMapping = `                                {entries.map((pref) => (
                                    <PrefRow
                                        key={pref.key}
                                        pref={pref}
                                        onSave={handleSave}
                                        onDelete={handleDelete}
                                        allModels={allModels}
                                    />
                                ))}`;

const newEntriesMapping = `                                {(() => {
                                    const subGroups = new Map<string, PrefEntry[]>();
                                    const standalone: PrefEntry[] = [];
                                    
                                    for (const pref of entries) {
                                        if ((pref as any).subCategory) {
                                            if (!subGroups.has((pref as any).subCategory)) subGroups.set((pref as any).subCategory, []);
                                            subGroups.get((pref as any).subCategory)!.push(pref);
                                        } else {
                                            standalone.push(pref);
                                        }
                                    }
                                    
                                    const elements = [];
                                    
                                    const sortedSubCats = Array.from(subGroups.keys()).sort();
                                    for (const subCat of sortedSubCats) {
                                        elements.push(
                                            <NestedCategory key={subCat} title={subCat} entries={subGroups.get(subCat)!} onSave={handleSave} onDelete={handleDelete} allModels={allModels} />
                                        );
                                    }
                                    
                                    for (const pref of standalone) {
                                        elements.push(
                                            <PrefRow key={pref.key} pref={pref} onSave={handleSave} onDelete={handleDelete} allModels={allModels} />
                                        );
                                    }
                                    
                                    return elements;
                                })()}`;

content = content.replace(oldEntriesMapping, newEntriesMapping);

fs.writeFileSync(file, content);
console.log('Patched nesting successfully');
