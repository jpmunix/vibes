import { z } from "zod";
import {
  defineContract,
  defineEvent,
  createClient,
  createEventClient,
} from "../contracts/core";

// =============================================================================
// System Schemas
// =============================================================================

export const NodeSystemInfoSchema = z.object({
  nodeVersion: z.string().nullable(),
  nodeDownloadUrl: z.string(),
});

export type NodeSystemInfo = z.infer<typeof NodeSystemInfoSchema>;

export const SystemDebugInfoSchema = z.object({
  nodeVersion: z.string().nullable(),
  nodePath: z.string().nullable(),
  telemetryId: z.string(),
  telemetryConsent: z.string(),
  telemetryUrl: z.string(),
  vibesVersion: z.string(),
  platform: z.string(),
  architecture: z.string(),
  logs: z.string(),
  selectedLanguageModel: z.string(),
});

export type SystemDebugInfo = z.infer<typeof SystemDebugInfoSchema>;

export const SelectNodeFolderResultSchema = z.object({
  path: z.string().nullable(),
  canceled: z.boolean(),
  selectedPath: z.string().nullable(),
});

export type SelectNodeFolderResult = z.infer<
  typeof SelectNodeFolderResultSchema
>;

export const SelectAppFolderResultSchema = z.object({
  path: z.string().nullable(),
  name: z.string().nullable(),
});

export const SelectAppLocationResultSchema = z.object({
  path: z.string().nullable(),
  canceled: z.boolean(),
});

export const SaveBackupResultSchema = z.object({
  success: z.boolean(),
  url: z.string().optional(),
});

export const UserBudgetInfoSchema = z
  .object({
    usedCredits: z.number(),
    totalCredits: z.number(),
    budgetResetDate: z.date(),
    redactedUserId: z.string(),
    isTrial: z.boolean(),
  })
  .nullable();

export type UserBudgetInfo = z.infer<typeof UserBudgetInfoSchema>;

export const TelemetryEventPayloadSchema = z.object({
  eventName: z.string(),
  properties: z.record(z.string(), z.any()).optional(),
});

export type TelemetryEventPayload = z.infer<typeof TelemetryEventPayloadSchema>;

export const ForceCloseDetectedPayloadSchema = z.object({
  performanceData: z
    .object({
      timestamp: z.number(),
      memoryUsageMB: z.number(),
      cpuUsagePercent: z.number().optional(),
      systemMemoryUsageMB: z.number().optional(),
      systemMemoryTotalMB: z.number().optional(),
      systemCpuPercent: z.number().optional(),
    })
    .optional(),
  appVersion: z.string().optional(),
  platform: z.string().optional(),
  recentLogs: z.string().optional(),
});

export const OpenRouterCreditsSchema = z.object({
  totalCredits: z.number(),
  totalUsage: z.number(),
  availableCredits: z.number(),
  label: z.string().optional(),
});

export type OpenRouterCredits = z.infer<typeof OpenRouterCreditsSchema>;

// =============================================================================
// System Contracts
// =============================================================================

export const systemContracts = {
  // Window controls
  minimizeWindow: defineContract({
    channel: "window:minimize",
    input: z.void(),
    output: z.void(),
  }),

  maximizeWindow: defineContract({
    channel: "window:maximize",
    input: z.void(),
    output: z.void(),
  }),

  isWindowMaximized: defineContract({
    channel: "window:is-maximized",
    input: z.void(),
    output: z.boolean(),
  }),

  closeWindow: defineContract({
    channel: "window:close",
    input: z.void(),
    output: z.void(),
  }),

  // Platform info
  getSystemPlatform: defineContract({
    channel: "get-system-platform",
    input: z.void(),
    output: z.string(),
  }),

  getSystemDebugInfo: defineContract({
    channel: "get-system-debug-info",
    input: z.void(),
    output: SystemDebugInfoSchema,
  }),

  getAppVersion: defineContract({
    channel: "get-app-version",
    input: z.void(),
    output: z.object({ version: z.string() }),
  }),

  // Node.js
  getNodejsStatus: defineContract({
    channel: "nodejs-status",
    input: z.void(),
    output: NodeSystemInfoSchema,
  }),

  selectNodeFolder: defineContract({
    channel: "select-node-folder",
    input: z.void(),
    output: SelectNodeFolderResultSchema,
  }),

  getNodePath: defineContract({
    channel: "get-node-path",
    input: z.void(),
    output: z.string().nullable(),
  }),

  // File/folder selection
  selectAppFolder: defineContract({
    channel: "select-app-folder",
    input: z.void(),
    output: SelectAppFolderResultSchema,
  }),

  saveTextToFile: defineContract({
    channel: "save-text-to-file",
    input: z.object({
      content: z.string(),
      defaultName: z.string().optional(),
      filters: z
        .array(z.object({ name: z.string(), extensions: z.array(z.string()) }))
        .optional(),
    }),
    output: z.object({
      filePath: z.string().nullable(),
      canceled: z.boolean(),
    }),
  }),

  // External
  openExternalUrl: defineContract({
    channel: "open-external-url",
    input: z.string(),
    output: z.void(),
  }),

  showItemInFolder: defineContract({
    channel: "show-item-in-folder",
    input: z.string(),
    output: z.void(),
  }),

  openFilePath: defineContract({
    channel: "open-file-path",
    input: z.string(),
    output: z.void(),
  }),

  // Session
  clearSessionData: defineContract({
    channel: "clear-session-data",
    input: z.void(),
    output: z.void(),
  }),

  resetAll: defineContract({
    channel: "reset-all",
    input: z.void(),
    output: z.void(),
  }),

  reloadEnvPath: defineContract({
    channel: "reload-env-path",
    input: z.void(),
    output: z.void(),
  }),


  // Upload
  uploadToSignedUrl: defineContract({
    channel: "upload-to-signed-url",
    input: z.object({
      url: z.string(),
      contentType: z.string(),
      data: z.any(),
    }),
    output: z.void(),
  }),

  // Screenshot
  takeScreenshot: defineContract({
    channel: "take-screenshot",
    input: z
      .object({
        rect: z
          .object({
            x: z.number(),
            y: z.number(),
            width: z.number(),
            height: z.number(),
          })
          .optional(),
      })
      .optional(),
    output: z.string(),
  }),

  // Restart
  restartVibes: defineContract({
    channel: "restart-vibes",
    input: z.void(),
    output: z.void(),
  }),

  // Restart OpenCode server (applies config changes like LSP without quitting the app)
  restartOpenCodeServer: defineContract({
    channel: "system:restart-opencode-server",
    input: z.void(),
    output: z.void(),
  }),

  // OpenRouter credits
  getOpenRouterCredits: defineContract({
    channel: "system:get-openrouter-credits",
    input: z.void(),
    output: OpenRouterCreditsSchema,
  }),

  // Database viewer window
  openDatabaseWindow: defineContract({
    channel: "window:open-database",
    input: z.object({ appId: z.number() }),
    output: z.void(),
  }),

  // Git viewer window — lazy, only opened on demand
  openGitWindow: defineContract({
    channel: "window:open-git",
    input: z.object({
      appId: z.number(),
      commitHash: z.string().optional(),
      theme: z.enum(["light", "dark", "system"]).optional(),
      themeIntensity: z.number().optional(),
    }),
    output: z.void(),
  }),

  // Chat window (P18 — dedicated chat+preview for performance isolation)
  openChatWindow: defineContract({
    channel: "window:open-chat",
    input: z.object({
      appId: z.number(),
      chatId: z.number().optional(),
      prompt: z.string().optional(),
      chatMode: z.string().optional(),
      attachments: z.array(z.object({
        name: z.string(),
        type: z.string(),
        data: z.string(),
        attachmentType: z.enum(["upload-to-codebase", "chat-context"]),
      })).optional(),
      theme: z.enum(["light", "dark", "system"]).optional(),
      themeIntensity: z.number().optional(),
    }),
    output: z.void(),
  }),

  // Message window — dedicated debug window for viewing a specific message in full mode
  openMessageWindow: defineContract({
    channel: "window:open-message",
    input: z.object({
      appId: z.number(),
      chatId: z.number(),
      messageId: z.number(),
      theme: z.enum(["light", "dark", "system"]).optional(),
      themeIntensity: z.number().optional(),
    }),
    output: z.void(),
  }),

  // Retrieve and clear pending prompt data stored by openChatWindow
  getPendingChatPrompt: defineContract({
    channel: "window:get-pending-chat-prompt",
    input: z.number(), // chatId
    output: z.object({
      prompt: z.string(),
      attachments: z.array(z.object({
        name: z.string(),
        type: z.string(),
        data: z.string(),
        attachmentType: z.enum(["upload-to-codebase", "chat-context"]),
      })).optional(),
    }).nullable(),
  }),

  // Update checker — fetch remote version from CDN (avoids CORS in renderer)
  checkRemoteVersion: defineContract({
    channel: "system:check-remote-version",
    input: z.void(),
    output: z.string().nullable(),
  }),

  // Console viewer window — dedicated window for server logs
  openConsoleWindow: defineContract({
    channel: "window:open-console",
    input: z.object({
      appId: z.number(),
      theme: z.enum(["light", "dark", "system"]).optional(),
      themeIntensity: z.number().optional(),
    }),
    output: z.void(),
  }),

  // Code viewer window — dedicated file explorer + editor
  openCodeWindow: defineContract({
    channel: "window:open-code",
    input: z.object({
      appId: z.number(),
      theme: z.enum(["light", "dark", "system"]).optional(),
      themeIntensity: z.number().optional(),
    }),
    output: z.void(),
  }),

  // Cross-window navigation: tells the main window to navigate to a route
  navigateMainWindow: defineContract({
    channel: "window:navigate-main",
    input: z.object({
      route: z.string(),
      search: z.record(z.string(), z.any()).optional(),
    }),
    output: z.void(),
  }),

  // Version info for the settings popover
  getVersionInfo: defineContract({
    channel: "system:get-version-info",
    input: z.void(),
    output: z.object({
      vibes: z.string(),
      opencode: z.string().nullable(),
      node: z.string(),
      electron: z.string(),
      platform: z.string(),
      arch: z.string(),
    }),
  }),

  // Memory viewer window — dedicated diagnostic panel for agent memories
  openMemoryWindow: defineContract({
    channel: "window:open-memory",
    input: z.object({
      appId: z.number(),
      theme: z.enum(["light", "dark", "system"]).optional(),
      themeIntensity: z.number().optional(),
    }),
    output: z.void(),
  }),

  // Admin panel window — restricted to authorized admin user
  openAdminWindow: defineContract({
    channel: "window:open-admin",
    input: z.object({
      theme: z.enum(["light", "dark", "system"]).optional(),
      themeIntensity: z.number().optional(),
    }),
    output: z.void(),
  }),

  // Playground window — model comparison tool
  openPlaygroundWindow: defineContract({
    channel: "window:open-playground",
    input: z.object({
      theme: z.enum(["light", "dark", "system"]).optional(),
      themeIntensity: z.number().optional(),
    }),
    output: z.void(),
  }),

  // Log file path — returns the absolute path to the electron-log file
  getLogFilePath: defineContract({
    channel: "system:get-log-file-path",
    input: z.void(),
    output: z.string(),
  }),

  // Send a console log entry to the chat window that owns this appId
  sendConsoleLogToChat: defineContract({
    channel: "system:send-console-log-to-chat",
    input: z.object({ appId: z.number(), formattedLog: z.string() }),
    output: z.void(),
  }),

  // Purge orphaned OpenCode sessions (admin diagnostic)
  purgeOpenCodeSessions: defineContract({
    channel: "system:purge-opencode-sessions",
    input: z.object({ dryRun: z.boolean() }),
    output: z.object({
      totalInOpenCode: z.number(),
      knownInVibes: z.number(),
      orphaned: z.number(),
      deleted: z.number(),
      errors: z.number(),
      report: z.string(),
    }),
  }),

  // ── Documentation system ──────────────────────────────────────────────────

  // Read the full documentation tree structure (recursive)
  getDocTree: defineContract({
    channel: "docs:get-tree",
    input: z.object({ baseDir: z.string().optional() }).optional(),
    output: z.object({
      root: z.any(), // DocTreeNode — recursive, validated at runtime
    }),
  }),

  // Read a single documentation page by relative path
  getDocPage: defineContract({
    channel: "docs:get-page",
    input: z.object({ relativePath: z.string(), baseDir: z.string().optional() }),
    output: z.object({
      markdown: z.string(),
      meta: z.object({
        title: z.string(),
        icon: z.string().optional(),
        description: z.string().optional(),
      }),
    }),
  }),

  // Full-text search across all documentation pages
  searchDocs: defineContract({
    channel: "docs:search",
    input: z.object({ query: z.string(), baseDir: z.string().optional() }),
    output: z.array(z.object({
      relativePath: z.string(),
      title: z.string(),
      snippet: z.string(),
      matchStart: z.number(),
      matchLength: z.number(),
      anchor: z.string().optional(),
      sectionTitle: z.string().optional(),
    })),
  }),

  // Documentation window — dedicated docs viewer
  openDocsWindow: defineContract({
    channel: "window:open-docs",
    input: z.object({
      theme: z.enum(["light", "dark", "system"]).optional(),
      themeIntensity: z.number().optional(),
    }),
    output: z.void(),
  }),

  // Release notes window — dedicated release notes viewer
  openReleaseNotesWindow: defineContract({
    channel: "window:open-release-notes",
    input: z.object({
      theme: z.enum(["light", "dark", "system"]).optional(),
      themeIntensity: z.number().optional(),
    }),
    output: z.void(),
  }),
} as const;

// =============================================================================
// System Event Contracts
// =============================================================================

export const systemEvents = {
  telemetryEvent: defineEvent({
    channel: "telemetry:event",
    payload: TelemetryEventPayloadSchema,
  }),

  forceCloseDetected: defineEvent({
    channel: "force-close-detected",
    payload: ForceCloseDetectedPayloadSchema,
  }),

  consoleLogToChat: defineEvent({
    channel: "console-log-to-chat",
    payload: z.object({ appId: z.number(), formattedLog: z.string() }),
  }),
} as const;

// =============================================================================
// System Client
// =============================================================================

export const systemClient = createClient(systemContracts);
export const systemEventClient = createEventClient(systemEvents);
