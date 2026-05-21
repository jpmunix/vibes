const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'src/ipc/handlers/app_handlers.ts');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  'import { getEffectivePrompt } from "../../prompts";',
  'import { getSystemPrompt } from "../../ipc/utils/prompt_utils";'
);

content = content.replace(
  'content: getEffectivePrompt("app_title_short", settings),',
  'content: await getSystemPrompt("app_title_short", settings.userId),'
);

content = content.replace(
  'content: getEffectivePrompt("app_name_pro", settings),',
  'content: await getSystemPrompt("app_name_pro", settings.userId),'
);

fs.writeFileSync(file, content);
console.log('Patched app_handlers.ts');
