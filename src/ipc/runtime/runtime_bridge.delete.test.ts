/**
 * B6 hardening (Slice 2.1.1): Unit tests for deleteRuntimeSession.
 *
 * The runtime_host module pulls in Electron (`app.getPath`), so we mock
 * it entirely and inject a controllable fake Runtime. The function we
 * test only cares about three behaviours:
 *   1. If there is NO active session for the chatId, no-op (no deleteSession
 *      call, no throw) — covers the "delete a chat whose session is
 *      already finished" case.
 *   2. The chatId mapping is dropped after the call (idempotency).
 *   3. getRuntime() failure is surfaced (the function does not silently
 *      swallow a misconfigured runtime).
 *
 * The "active handle exists" path is harder to exercise without
 * driving handleRuntimeStream end-to-end. The contract test in
 * runtime_bridge.contract.test.ts will exercise that path when we
 * wire the slice 2.1.3 callers (version_handlers, chat_handlers, etc.).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Runtime } from "@vibes/runtime";

const fakeRuntime = {
  deleteSession: vi.fn(async (_id: string) => {}),
} as unknown as Runtime & {
  deleteSession: ReturnType<typeof vi.fn>;
};

const getRuntimeMock = vi.fn(() => fakeRuntime);

vi.mock("./runtime_host", () => ({
  getRuntime: () => getRuntimeMock(),
}));

import { deleteRuntimeSession, getActiveRuntimeSession } from "./runtime_bridge";

beforeEach(() => {
  fakeRuntime.deleteSession.mockClear();
  getRuntimeMock.mockClear();
});

describe("deleteRuntimeSession (no-active-handle path)", () => {
  it("is a no-op when the chatId has no active session", async () => {
    await deleteRuntimeSession(999);
    expect(fakeRuntime.deleteSession).not.toHaveBeenCalled();
  });

  it("does not throw when there is nothing to delete", async () => {
    await expect(deleteRuntimeSession(42)).resolves.toBeUndefined();
  });

  it("leaves the active-session map empty for the chatId", async () => {
    await deleteRuntimeSession(7);
    expect(getActiveRuntimeSession(7)).toBeUndefined();
  });
});
