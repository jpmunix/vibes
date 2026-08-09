/**
 * B6: Unit tests for permission_state.ts — the fail-closed permission gate
 * state shared by the runtime bridge and the IPC permission handler.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  respondRuntimePermission,
  waitForRuntimePermissionResponse,
  rejectAllPendingRuntimePermissions,
  pendingRuntimePermissionCount,
  setSessionUIContext,
  getSessionUIContext,
  clearSessionUIContext,
  RUNTIME_PERMISSION_TIMEOUT_MS,
} from "./permission_state";

afterEach(() => {
  // Leave global state clean between tests.
  rejectAllPendingRuntimePermissions();
});

describe("respondRuntimePermission", () => {
  it("resolves a pending request and returns true", async () => {
    const ac = new AbortController();
    const pending = waitForRuntimePermissionResponse("req-1", ac.signal, 60_000);
    expect(pendingRuntimePermissionCount()).toBe(1);

    expect(respondRuntimePermission("req-1", "once")).toBe(true);
    await expect(pending).resolves.toBe("once");
    expect(pendingRuntimePermissionCount()).toBe(0);
  });

  it("returns false for unknown requestIds (OpenCode owns those)", () => {
    expect(respondRuntimePermission("opencode-req", "once")).toBe(false);
  });

  it("normalizes unknown vocabulary to reject (fail-closed)", async () => {
    const ac = new AbortController();
    const pending = waitForRuntimePermissionResponse("req-2", ac.signal, 60_000);
    respondRuntimePermission("req-2", "yolo");
    await expect(pending).resolves.toBe("reject");
  });

  it("accepts always", async () => {
    const ac = new AbortController();
    const pending = waitForRuntimePermissionResponse("req-3", ac.signal, 60_000);
    respondRuntimePermission("req-3", "always");
    await expect(pending).resolves.toBe("always");
  });
});

describe("waitForRuntimePermissionResponse", () => {
  it("resolves reject when already aborted before waiting", async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(waitForRuntimePermissionResponse("req-4", ac.signal)).resolves.toBe(
      "reject",
    );
    expect(pendingRuntimePermissionCount()).toBe(0);
  });

  it("resolves reject when the signal aborts while waiting", async () => {
    const ac = new AbortController();
    const pending = waitForRuntimePermissionResponse("req-5", ac.signal, 60_000);
    ac.abort();
    await expect(pending).resolves.toBe("reject");
    expect(pendingRuntimePermissionCount()).toBe(0);
  });

  it("auto-rejects on timeout (fail-closed)", async () => {
    vi.useFakeTimers();
    try {
      const ac = new AbortController();
      const pending = waitForRuntimePermissionResponse("req-6", ac.signal, 1_000);
      vi.advanceTimersByTime(1_001);
      await expect(pending).resolves.toBe("reject");
      expect(pendingRuntimePermissionCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("default timeout is 5 minutes (parity with adapter)", () => {
    expect(RUNTIME_PERMISSION_TIMEOUT_MS).toBe(5 * 60 * 1000);
  });
});

describe("rejectAllPendingRuntimePermissions", () => {
  it("rejects every pending request (quit/cancel)", async () => {
    const ac = new AbortController();
    const p1 = waitForRuntimePermissionResponse("req-a", ac.signal, 60_000);
    const p2 = waitForRuntimePermissionResponse("req-b", ac.signal, 60_000);
    expect(pendingRuntimePermissionCount()).toBe(2);

    rejectAllPendingRuntimePermissions();

    await expect(p1).resolves.toBe("reject");
    await expect(p2).resolves.toBe("reject");
    expect(pendingRuntimePermissionCount()).toBe(0);
  });
});

describe("session UI context registry", () => {
  it("stores and clears the chatId+sender for a session", () => {
    const sender = { send: vi.fn() } as any;
    setSessionUIContext("sess-1", { chatId: 7, sender });
    expect(getSessionUIContext("sess-1")).toEqual({ chatId: 7, sender });

    clearSessionUIContext("sess-1");
    expect(getSessionUIContext("sess-1")).toBeUndefined();
  });
});
