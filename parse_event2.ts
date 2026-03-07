import { createOpencodeClient } from "@opencode-ai/sdk/v2";
const client = createOpencodeClient({});
console.log(client.question?.reply?.toString() || "no question tool");
