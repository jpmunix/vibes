const fs = require('fs');
const path = require('path');

const mappings = [
  { regex: /dark:hover:text-gray-200/g, replacement: "dark:hover:text-foreground" },
  { regex: /dark:text-gray-200/g, replacement: "dark:text-foreground" },
  { regex: /dark:text-gray-100/g, replacement: "dark:text-foreground" },
  { regex: /hover:bg-gray-200/g, replacement: "hover:bg-accent" },
  { regex: /dark:hover:bg-gray-700/g, replacement: "dark:hover:bg-accent" },
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
