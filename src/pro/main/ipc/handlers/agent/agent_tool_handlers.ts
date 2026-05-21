/**
 * IPC handlers for agent tool consent management
 */

import {
  getAllAgentToolConsents,
  setAgentToolConsent,
  resolveAgentToolConsent,
  TOOL_DEFINITIONS,
  getDefaultConsent,
  type AgentToolName,
} from "./tool_definitions";
import { resolveAskUserResponse } from "./tools/ask_user";
import { createTypedHandler } from "@/ipc/handlers/base";
import { agentContracts } from "@/ipc/types/agent";
import log from "electron-log";

const logger = log.scope("agent_tool_handlers");

export function registerAgentToolHandlers() {
  // Get list of available tools with their consent settings
  createTypedHandler(agentContracts.getTools, async () => {
    const consents = getAllAgentToolConsents();
    return TOOL_DEFINITIONS.map((tool) => ({
      name: tool.name,
      description: tool.description,
      isAllowedByDefault: getDefaultConsent(tool.name) === "always",
      consent: consents[tool.name],
    }));
  });

  // Set consent for a single tool
  createTypedHandler(agentContracts.setConsent, async (_event, params) => {
    setAgentToolConsent(params.toolName as AgentToolName, params.consent);
  });

  // Handle consent response from renderer
  createTypedHandler(agentContracts.respondToConsent, async (_event, params) => {
    resolveAgentToolConsent(params.requestId, params.decision);
  });

  // Handle ask_user response from renderer
  createTypedHandler(agentContracts.respondToAskUser, async (_event, params) => {
    resolveAskUserResponse(params.requestId, params.response);
  });
}
