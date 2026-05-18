const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'src/ipc/utils/memory_context_builder.ts');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  'import { getEffectivePrompt } from "../../prompts";',
  'import { getSystemPrompt } from "../../ipc/utils/prompt_utils";'
);

content = content.replace(
  'const selectionPrompt = getEffectivePrompt("memory_selection", settings)',
  'const selectionPrompt = await getSystemPrompt("memory_selection", settings.userId);'
);

fs.writeFileSync(file, content);
console.log('Patched memory_context_builder.ts');
