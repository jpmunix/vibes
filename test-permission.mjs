import { createOpencodeClient } from '@opencode-ai/sdk/v2';
const client = createOpencodeClient({});
console.log("type of permission methods:", typeof client.permission.respond, typeof client.permission.reply);
// Make a dummy request to list to see the endpoint
try { await client.permission.list({ path: { sessionID: "test" } }); } catch(e) { console.log(e.message) }
