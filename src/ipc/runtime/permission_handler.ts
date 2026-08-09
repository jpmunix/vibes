/**
 * Capa 2: Permission handler extracted from opencode_adapter.ts.
 *
 * Handles the `opencode-permission:respond` IPC channel — the renderer's
 * answer to a permission banner. The channel name is kept for UI compatibility;
 * only the OpenCode branch has been removed.
 *
 * Slice 3.6: when the user picks "always", persist the corresponding pill
 * in `permissions.tools[toolId] = "allow"` so the next request for the same
 * tool doesn't prompt again.
 */

import log from "electron-log";
import { createTypedHandler } from "../handlers/base";
import { agentContracts } from "../types/agent";
import {
  respondRuntimePermission,
  getPendingRuntimePermissionToolId,
} from "./permission_state";
import { writeSettings, readSettings } from "../../main/settings";
import type { PermissionsConfig } from "../../lib/schemas";

const logger = log.scope("runtime_permission");

/**
 * Map a runtime toolId to the corresponding pill key in `permissions.tools`.
 * Shell-style tools share the `shell` pill. All other tools use their toolId
 * directly (since the schema now uses toolIds as keys).
 */
function toolIdToPillKey(toolId: string): keyof NonNullable<PermissionsConfig["tools"]> | null {
  // Known tools in the schema. For unknown tools, we don't persist — the
  // user can configure them manually via Settings.
  const TOOL_PILL_MAP: Record<string, keyof NonNullable<PermissionsConfig["tools"]>> = {
    read_file: "read_file",
    write_file: "write_file",
    edit_file: "edit_file",
    glob: "glob",
    grep: "grep",
    shell: "shell",
    bash: "shell",
    webfetch: "webfetch",
    websearch: "websearch",
    task: "task",
    skill: "skill",
  };
  return TOOL_PILL_MAP[toolId] ?? null;
}

export function registerPermissionHandler() {
  createTypedHandler(
    agentContracts.respondToPermission,
    async (_event, params) => {
      const { requestId, response } = params;
      logger.info(
        `[Permission] Received UI response for ${requestId}: ${response}`,
      );

      // Slice 3.6: persist "always" before resolving, so the next request
      // for the same tool will short-circuit via the resolver.
      if (response === "always") {
        const toolId = getPendingRuntimePermissionToolId(requestId);
        if (toolId) {
          const pillKey = toolIdToPillKey(toolId);
          if (pillKey) {
            try {
              const prev = readSettings();
              writeSettings({
                ...prev,
                permissions: {
                  ...(prev.permissions ?? {}),
                  tools: {
                    ...(prev.permissions?.tools ?? {}),
                    [pillKey]: "allow",
                  },
                },
              });
              logger.info(
                `[Permission] Persisted "always" → permissions.tools.${pillKey} = "allow" (from ${toolId})`,
              );
            } catch (err) {
              logger.error(
                `[Permission] Failed to persist "always" for ${toolId}: ${String(err)}`,
              );
            }
          } else {
            logger.warn(
              `[Permission] No pill mapping for toolId ${toolId} — not persisting`,
            );
          }
        }
      }

      if (respondRuntimePermission(requestId, response)) return;

      logger.warn(
        `[Permission] No pending resolver for ${requestId} — already timed out?`,
      );
    },
  );
}
