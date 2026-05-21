const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'src/components/admin_window/UserPreferencesEditor.tsx');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  '                ) : (\n                    <input',
  `                ) : pref.key.startsWith("prompt:") ? (
                    <textarea
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground text-sm font-mono placeholder:text-muted-foreground/50 focus:border-primary focus:ring-0 outline-none transition-colors resize-y min-h-[120px]"
                        rows={Math.min(20, editValue.split("\\n").length + 2)}
                        spellCheck={false}
                        autoFocus
                    />
                ) : (
                    <input`
);

fs.writeFileSync(file, content);
console.log('Patched textarea');
