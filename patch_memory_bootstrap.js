const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'src/ipc/utils/memory_bootstrap.ts');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  'import { getEffectivePrompt } from "../../prompts";',
  'import { getSystemPrompt } from "../../ipc/utils/prompt_utils";'
);

content = content.replace(
  'const onboardingPrompt = getEffectivePrompt("memory_onboarding", settings);',
  'const onboardingPrompt = await getSystemPrompt("memory_onboarding", settings.userId);'
);

fs.writeFileSync(file, content);
console.log('Patched memory_bootstrap.ts');
