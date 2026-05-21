const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'src/pro/main/ipc/handlers/agent/tools/engine_fetch.ts');
if (fs.existsSync(file)) {
  let content = fs.readFileSync(file, 'utf8');

  content = content.replace(
    'import { getEffectivePrompt } from "@/prompts";',
    'import { getSystemPrompt } from "@/ipc/utils/prompt_utils";'
  );

  content = content.replace(
    'content: getEffectivePrompt("turbo_edit_system", settings),',
    'content: await getSystemPrompt("turbo_edit_system", settings.userId),'
  );

  fs.writeFileSync(file, content);
  console.log('Patched engine_fetch.ts');
} else {
  console.log('File does not exist');
}
