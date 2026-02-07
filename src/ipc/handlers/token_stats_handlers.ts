import { createTypedHandler } from "./base";
import { tokenStatsContracts } from "../types/token_stats";
import { readTokenStats } from "../utils/token_stats_logger";

export function registerTokenStatsHandlers() {
  createTypedHandler(tokenStatsContracts.getTokenStats, async () => {
    return readTokenStats(300);
  });
}
