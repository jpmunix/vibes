import { createOpencodeClient } from "@opencode-ai/sdk/dist/v2/client.gen";
const client = createOpencodeClient({ baseUrl: "" });
// Check types of reply args
type ReplyParams = Parameters<typeof client.permission.reply>[0];
const p: ReplyParams = {
    path: { requestID: "xx" },
    body: { reply: "once" }
};
console.log("OK");
