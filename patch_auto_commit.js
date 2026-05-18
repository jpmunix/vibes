const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'src/ipc/utils/auto_commit_message.ts');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  'import { getEffectivePrompt } from "@/prompts";',
  'import { getSystemPrompt } from "@/ipc/utils/prompt_utils";'
);

content = content.replace(
  'const systemPrompt = getEffectivePrompt("auto_commit_message", settings);',
  'const systemPrompt = await getSystemPrompt("auto_commit_message", settings.userId);'
);

fs.writeFileSync(file, content);
console.log('Patched auto_commit_message.ts');
