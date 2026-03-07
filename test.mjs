import { createOpencodeClient } from '@opencode-ai/sdk/v2';
const client = createOpencodeClient({});
console.log(client.permission.reply.toString());
