const fs = require('fs');
const path = require('path');

const mappings = [
  // text-gray-900 dark:text-white -> text-foreground
  { regex: /text-gray-900\s+dark:text-white/g, replacement: "text-foreground" },
  { regex: /text-gray-900\s+dark:text-gray-100/g, replacement: "text-foreground" },
  // text-gray-700 dark:text-gray-300 -> text-foreground
  { regex: /text-gray-700\s+dark:text-gray-300/g, replacement: "text-foreground" },
  // text-gray-500 dark:text-gray-400 -> text-muted-foreground
  { regex: /text-gray-500\s+dark:text-gray-400/g, replacement: "text-muted-foreground" },
  { regex: /text-gray-600\s+dark:text-gray-400/g, replacement: "text-muted-foreground" },
  // text-gray-400 dark:text-gray-500 -> text-muted-foreground
  { regex: /text-gray-400\s+dark:text-gray-500/g, replacement: "text-muted-foreground/70" },
  // single grays
  { regex: /text-gray-900/g, replacement: "text-foreground" },
  { regex: /text-gray-800/g, replacement: "text-foreground" },
  { regex: /text-gray-700/g, replacement: "text-foreground" },
  { regex: /text-gray-600/g, replacement: "text-muted-foreground" },
  { regex: /text-gray-500/g, replacement: "text-muted-foreground" },
  { regex: /text-gray-400/g, replacement: "text-muted-foreground/70" },
  { regex: /text-gray-300/g, replacement: "text-muted-foreground/50" },
];

function processDirectory(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      processDirectory(fullPath);
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      let originalContent = content;
      for (const mapping of mappings) {
        content = content.replace(mapping.regex, mapping.replacement);
      }
      if (content !== originalContent) {
        fs.writeFileSync(fullPath, content);
        console.log(`Updated: ${fullPath}`);
      }
    }
  }
}

processDirectory(path.join(__dirname, 'src'));
