const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'src/ipc/handlers/chat_stream_handlers.ts');
let content = fs.readFileSync(file, 'utf8');

content = content.replace('import { getEffectivePrompt } from "../../prompts";\n', '');

fs.writeFileSync(file, content);
console.log('Patched chat_stream_handlers.ts');
