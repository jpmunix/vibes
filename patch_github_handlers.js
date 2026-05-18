const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'src/ipc/handlers/github_handlers.ts');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  'import { getEffectivePrompt } from "@/prompts";',
  'import { getSystemPrompt } from "@/ipc/utils/prompt_utils";'
);

content = content.replace(
  'const systemPrompt = getEffectivePrompt("auto_commit_message", settings);',
  'const systemPrompt = await getSystemPrompt("auto_commit_message", settings.userId);'
);
content = content.replace(
  'const systemPrompt = getEffectivePrompt("auto_commit_message", settings);',
  'const systemPrompt = await getSystemPrompt("auto_commit_message", settings.userId);'
);

fs.writeFileSync(file, content);
console.log('Patched github_handlers.ts');
