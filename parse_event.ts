import { PermissionRequest, EventPermissionAsked } from "@opencode-ai/sdk/dist/v2/gen/types.gen";
const ev: EventPermissionAsked = {
  type: "permission.asked",
  properties: {
    id: "req123",
    sessionID: "sess123",
    permission: "edit",
    patterns: [],
    metadata: {},
    always: ["ask", "allow", "deny"]
  }
};
console.log(ev);
