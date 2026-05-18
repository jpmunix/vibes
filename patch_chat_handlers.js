const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'src/ipc/handlers/chat_handlers.ts');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  'const { getEffectivePrompt } = await import("../../prompts");',
  'const { getSystemPrompt } = await import("../../ipc/utils/prompt_utils");'
);

content = content.replace(
  'const chatTitleSystemPrompt = getEffectivePrompt("chat_title", settings);',
  'const chatTitleSystemPrompt = await getSystemPrompt("chat_title", settings.userId);'
);

fs.writeFileSync(file, content);
console.log('Patched chat_handlers.ts');
