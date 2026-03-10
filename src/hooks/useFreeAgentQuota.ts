/**
 * Free agent quota hook — INERT after Pro elimination.
 * Returns always-safe values so consumers don't break.
 * TODO: Remove this hook and all its consumers in a future cleanup.
 */
export function useFreeAgentQuota() {
  return {
    quotaStatus: undefined,
    isLoading: false,
    error: null,
    invalidateQuota: () => {},
    isQuotaExceeded: false,
    messagesUsed: 0,
    messagesLimit: 999,
    messagesRemaining: 999,
    hoursUntilReset: null,
    resetTime: null,
  };
}
