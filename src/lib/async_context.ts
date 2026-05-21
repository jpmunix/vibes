import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestContext {
  userId?: string;
}

export const requestContextStorage = new AsyncLocalStorage<RequestContext>();

export function getContextUserId(): string | undefined {
  return requestContextStorage.getStore()?.userId;
}
