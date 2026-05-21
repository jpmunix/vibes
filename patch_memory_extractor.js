const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'src/ipc/utils/memory_extractor.ts');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  'import { getEffectivePrompt } from "../../prompts";',
  'import { getSystemPrompt } from "../../ipc/utils/prompt_utils";'
);

content = content.replace(
  'const synthesisPrompt = getEffectivePrompt("memory_synthesis", settings);',
  'const synthesisPrompt = await getSystemPrompt("memory_synthesis", settings.userId);'
);
content = content.replace(
  'const synthesisPrompt = getEffectivePrompt("memory_synthesis", settings);',
  'const synthesisPrompt = await getSystemPrompt("memory_synthesis", settings.userId);'
); // replace second occurrence

fs.writeFileSync(file, content);
console.log('Patched memory_extractor.ts');
