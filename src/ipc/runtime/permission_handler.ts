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

const logger = log.scope("runtime_permission");

/**
 * Map a runtime toolId to the corresponding pill key in `permissions.tools`.
 * The schema is now an open `Record<string, PermissionDecision>`, so every
 * toolId maps directly to itself — shell-style aliases (bash/sh/exec) funnel
 * to the `shell` key so they share the pill.
 */
function toolIdToPillKey(toolId: string): string | null {
  // Shell aliases share the `shell` pill; everything else uses its toolId.
  const SHELL_ALIASES = new Set(["bash", "sh", "exec"]);
  if (SHELL_ALIASES.has(toolId)) return "shell";
  return toolId;
}

export function registerPermissionHandler() {
  createTypedHandler(
    agentContracts.respondToPermission,
    async (_event, params) => {
      const { requestId, response } = params;
      logger.info(
        `[Permission] Received UI response for ${requestId}: ${response}`,
      );

      // Slice 3.8.2: persist "always" BEFORE resolving, so the next request
      // for the same tool will short-circuit via the resolver. Await the DB
      // outcome so we can surface failures to the renderer.
      if (response === "always") {
        const toolId = getPendingRuntimePermissionToolId(requestId);
        if (toolId) {
          const pillKey = toolIdToPillKey(toolId);
          if (pillKey) {
            let persistOk = true;
            try {
              const prev = readSettings();
              const result = await writeSettings({
                ...prev,
                permissions: {
                  ...(prev.permissions ?? {}),
                  tools: {
                    ...(prev.permissions?.tools ?? {}),
                    [pillKey]: "allow",
                  },
                },
              });
              if (result.ok) {
                logger.info(
                  `[Permission] Persisted "always" → permissions.tools.${pillKey} = "allow" (from ${toolId})`,
                );
              } else {
                persistOk = false;
                logger.error(
                  `[Permission] DB persist failed for ${toolId}: ${result.error}`,
                );
              }
            } catch (err) {
              persistOk = false;
              logger.error(
                `[Permission] Failed to persist "always" for ${toolId}: ${String(err)}`,
              );
            }

            // Slice 3.8.3: tell the renderer so it can show a toast. The
            // in-memory cache update already happened (fire-and-forget from
            // the renderer's POV), so the user's pill IS active for this
            // session — they just need to know it won't survive a restart.
            if (!persistOk) {
              try {
                // Lazy-import electron to avoid breaking renderer imports
                // if this module is imported from a context without it.
                const { BrowserWindow } = await import("electron");
                const { safeSend } = await import("../utils/safe_sender");
                for (const win of BrowserWindow.getAllWindows()) {
                  safeSend(win.webContents, "permission:persist-failed", {
                    requestId,
                    toolId,
                    pillKey,
                    message:
                      "No se pudo guardar tu preferencia en el servidor. La regla se aplica en esta sesión, pero no se recordará al reiniciar.",
                  });
                }
              } catch (sendErr) {
                logger.warn(
                  `[Permission] Could not emit persist-failed event: ${String(sendErr)}`,
                );
              }
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
