const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'src/components/admin_window/UserPreferencesEditor.tsx');
let content = fs.readFileSync(file, 'utf8');

// Insert renderKey helper at the start of PrefRow
content = content.replace(
  '    const [saving, setSaving] = useState(false);',
  `    const [saving, setSaving] = useState(false);

    const renderKey = () => (
        <div className="flex flex-col gap-0.5">
            {pref.displayName ? (
                <>
                    <span className="typo-caption text-foreground font-medium line-clamp-1" title={pref.displayName}>{pref.displayName}</span>
                    <span className="text-[10px] text-muted-foreground/60 break-all" title={pref.key}>{pref.key}</span>
                </>
            ) : (
                <span className="typo-caption text-muted-foreground break-all">{pref.key}</span>
            )}
        </div>
    );`
);

// Replace all occurrences of `<span className="typo-caption text-muted-foreground break-all">{pref.key}</span>` with `{renderKey()}`
content = content.replaceAll(
  '<span className="typo-caption text-muted-foreground break-all">{pref.key}</span>',
  '{renderKey()}'
);

// Also replace the one in the expanded panel (JSON/string editor) which has slightly different classes
content = content.replace(
  '<span className="typo-caption text-muted-foreground font-medium">{pref.key}</span>',
  '{renderKey()}'
);

fs.writeFileSync(file, content);
console.log('Patched PrefRow successfully');
