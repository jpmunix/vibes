const fs = require('fs');
const path = require('path');

const srcFile = path.join(__dirname, 'src/prompts/index.ts');
const targetFile = path.join(__dirname, 'src/prompts/defaults.ts');

const oldContent = fs.readFileSync(targetFile, 'utf8');

// Extract DEFAULT_PROMPTS from the old content
const defaultPromptsMatch = oldContent.match(/export const DEFAULT_PROMPTS[\s\S]*?^};\n/m);

if (defaultPromptsMatch) {
  let newContent = `import { PromptId } from "./index";\n\n`;
  newContent += defaultPromptsMatch[0];
  fs.writeFileSync(targetFile, newContent);
  console.log('Created defaults.ts');
}

// Fix migrate_prompts.ts
const scriptFile = path.join(__dirname, 'scripts/migrate_prompts.ts');
let scriptContent = fs.readFileSync(scriptFile, 'utf8');
scriptContent = scriptContent.replace(
  'import { DEFAULT_PROMPTS, PROMPT_LABELS, PROMPT_DESCRIPTIONS, PromptId } from "../src/prompts/index";',
  'import { PROMPT_LABELS, PROMPT_DESCRIPTIONS, PromptId } from "../src/prompts/index";\nimport { DEFAULT_PROMPTS } from "../src/prompts/defaults";'
);
fs.writeFileSync(scriptFile, scriptContent);
console.log('Fixed migrate_prompts.ts');
