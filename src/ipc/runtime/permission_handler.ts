/**
 * Capa 2: Permission handler extracted from opencode_adapter.ts.
 *
 * Handles the `opencode-permission:respond` IPC channel — the renderer's
 * answer to a permission banner. The channel name is kept for UI compatibility;
 * only the OpenCode branch has been removed.
 */

import log from "electron-log";
import { createTypedHandler } from "../handlers/base";
import { agentContracts } from "../types/agent";
import { respondRuntimePermission } from "./permission_state";

const logger = log.scope("runtime_permission");

export function registerPermissionHandler() {
  createTypedHandler(
    agentContracts.respondToPermission,
    async (_event, params) => {
      const { requestId, response } = params;
      logger.info(
        `[Permission] Received UI response for ${requestId}: ${response}`,
      );

      if (respondRuntimePermission(requestId, response)) return;

      logger.warn(
        `[Permission] No pending resolver for ${requestId} — already timed out?`,
      );
    },
  );
}
