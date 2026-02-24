import { isBasicAgentMode } from "./src/lib/schemas";

const settings = {
  selectedModel: "gpt-4",
  selectedChatMode: "cloud"
} as any;

console.log("isBasicAgentMode:", isBasicAgentMode(settings));
