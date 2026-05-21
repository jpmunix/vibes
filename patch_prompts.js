const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'src/prompts/index.ts');
let content = fs.readFileSync(file, 'utf8');

// Remove DEFAULT_PROMPTS
content = content.replace(/export const DEFAULT_PROMPTS[\s\S]*?^};\n/m, '');

// Remove getEffectivePrompt
content = content.replace(/export function getEffectivePrompt[\s\S]*?^}\n/m, '');

fs.writeFileSync(file, content);
console.log('Patched index.ts');
