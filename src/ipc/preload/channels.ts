/**
 * Channel Definitions for Preload Script
 *
 * This file derives the list of valid IPC channels from contract definitions.
 * It serves as the single source of truth for the preload script's channel whitelist.
 *
 * All channels are now derived from contracts - no legacy channels remain.
 */

import {
  getInvokeChannels,
  getReceiveChannels,
  getStreamChannels,
} from "../contracts/core";

import { agentContracts, agentEvents } from "../types/agent";
import { appContracts } from "../types/app";
import { bunnyContracts } from "../types/bunny";
import { pocketbaseContracts } from "../types/pocketbase";
import { backupContracts } from "../types/backup";
import { capacitorContracts } from "../types/capacitor";
import { chatContracts, chatStreamContract } from "../types/chat";
import { firebaseContracts } from "../types/firebase";
import { chatLogsContracts } from "../types/chat_logs";
import { contextContracts } from "../types/context";



import { gitContracts, githubContracts, githubEvents } from "../types/github";
import { helpContracts, helpStreamContract } from "../types/help";
import { importContracts } from "../types/import";
import { languageModelContracts } from "../types/language-model";
import { mcpContracts, mcpEvents } from "../types/mcp";
import { miscContracts, miscEvents } from "../types/misc";
import { neonContracts } from "../types/neon";

import { promptContracts } from "../types/prompts";
import { proposalContracts } from "../types/proposals";
// Import all contracts
import { settingsContracts } from "../types/settings";
import { supabaseContracts } from "../types/supabase";
import { systemContracts, systemEvents } from "../types/system";
import { templateContracts } from "../types/templates";
import { todoContracts } from "../types/todo";
import { tokenStatsContracts } from "../types/token_stats";
import { vercelContracts } from "../types/vercel";
import { versionContracts } from "../types/version";
import { visualEditingContracts } from "../types/visual-editing";

import { aiQueryLogContracts } from "../contracts/ai_query_logs";

import { authContracts } from "../types/auth";
import { designContracts } from "../types/design";
import { memoryContracts } from "../types/memory";


// =============================================================================
// Invoke Channels (derived from all contracts)
// =============================================================================

const CHAT_STREAM_CHANNELS = getStreamChannels(chatStreamContract);
const HELP_STREAM_CHANNELS = getStreamChannels(helpStreamContract);



// Test-only channels (handler only registered in E2E test builds, but channel always allowed)
const TEST_INVOKE_CHANNELS = [
  "test:simulateQuotaTimeElapsed",
  "test:set-node-mock",
] as const;

// OpenCode AI integration — diagnostic channels
const OPENCODE_INVOKE_CHANNELS = [
  "opencode:health-check",
  "opencode:test-run",
  "opencode:extract-env",
] as const;

/**
 * All valid invoke channels derived from contracts.
 * Used by preload.ts to whitelist IPC channels.
 */
export const VALID_INVOKE_CHANNELS = [
  // Core domains
  ...getInvokeChannels(settingsContracts),
  ...getInvokeChannels(appContracts),
  ...getInvokeChannels(chatContracts),

  ...getInvokeChannels(todoContracts),
  ...getInvokeChannels(agentContracts),


  // Stream invoke channels
  CHAT_STREAM_CHANNELS.invoke,
  HELP_STREAM_CHANNELS.invoke,



  // Integrations
  ...getInvokeChannels(githubContracts),
  ...getInvokeChannels(gitContracts),
  ...getInvokeChannels(mcpContracts),
  ...getInvokeChannels(vercelContracts),
  ...getInvokeChannels(supabaseContracts),
  ...getInvokeChannels(neonContracts),
  ...getInvokeChannels(firebaseContracts),

  // Features
  ...getInvokeChannels(systemContracts),
  ...getInvokeChannels(versionContracts),
  ...getInvokeChannels(languageModelContracts),
  ...getInvokeChannels(promptContracts),
  ...getInvokeChannels(templateContracts),
  ...getInvokeChannels(proposalContracts),
  ...getInvokeChannels(importContracts),
  ...getInvokeChannels(helpContracts),
  ...getInvokeChannels(capacitorContracts),
  ...getInvokeChannels(contextContracts),
  ...getInvokeChannels(visualEditingContracts),
  ...getInvokeChannels(miscContracts),

  ...getInvokeChannels(tokenStatsContracts),
  ...getInvokeChannels(chatLogsContracts),

  ...getInvokeChannels(backupContracts),
  ...getInvokeChannels(bunnyContracts),
  ...getInvokeChannels(pocketbaseContracts),
  // knowledgeContracts — KB removed
  ...getInvokeChannels(aiQueryLogContracts),
  ...getInvokeChannels(memoryContracts),

  ...getInvokeChannels(authContracts),

  ...getInvokeChannels(designContracts),


  // Test-only channels
  ...TEST_INVOKE_CHANNELS,

  // Crush (ex-OpenCode) diagnostic channels
  ...OPENCODE_INVOKE_CHANNELS,

  // Git commit message streaming (direct ipcMain.handle, not via contracts)
  "github:generate-commit-message-stream",

  // OpenCode permission response (renderer -> main)
  "opencode-permission:respond",
] as const;

// =============================================================================
// Receive Channels (derived from all event contracts + stream events)
// =============================================================================

/**
 * All valid receive channels derived from contracts.
 * Used by preload.ts to whitelist IPC channels.
 */
export const VALID_RECEIVE_CHANNELS = [
  // Stream receive channels
  ...CHAT_STREAM_CHANNELS.receive,
  ...HELP_STREAM_CHANNELS.receive,



  // Event channels
  ...getReceiveChannels(agentEvents),
  ...getReceiveChannels(githubEvents),
  ...getReceiveChannels(mcpEvents),
  ...getReceiveChannels(systemEvents),
  ...getReceiveChannels(miscEvents),


  // Additional chat events
  "chat:model:selected",
  "chat:model:selecting",

  // Cross-window navigation
  "navigate-to-route",

  // Git commit message streaming
  "git:commit-message-start",
  "git:commit-message-token",
  "git:commit-message-done",
  "git:commit-message-error",

  // Backend-initiated settings updates (e.g. permission persistence)
  "settings:updated-from-backend",
] as const;

// =============================================================================
// Type Exports
// =============================================================================

export type ValidInvokeChannel = (typeof VALID_INVOKE_CHANNELS)[number];
export type ValidReceiveChannel = (typeof VALID_RECEIVE_CHANNELS)[number];
