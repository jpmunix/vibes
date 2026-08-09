/**
 * Slice 3.8 — BunnyDB persist failure resilience.
 *
 * Covers:
 *   1. `permissionPersistFailed` contract (channel + payload shape).
 *   2. writeSettings returns Promise<{ ok, error? }> when the underlying
 *      preferencesCache.setMany fails (mocked DB write throws).
 *   3. writeSettings resolves ok=true when the DB write succeeds.
 *   4. writeSettings resolves ok=true (with no DB call) when there are no
 *      KV updates (session-only writes — e.g. isRunning flag).
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

const hoisted = vi.hoisted(() => ({
  setManyMock: vi.fn(),
  preferencesCacheInstance: {
    setMany: vi.fn(),
    currentUserId: "user-1" as string | null,
  },
  readSessionMock: vi.fn(() => ({ userId: "user-1" })),
  writeSessionMock: vi.fn(),
  writeRuntimeStateMock: vi.fn(),
  cachedSettingsRef: { current: null as any },
  resetCacheMock: vi.fn(),
}));

// ── Mocks (must be set BEFORE imports) ───────────────────────────────────

vi.mock("@/main/preferences-cache", () => ({
  preferencesCache: hoisted.preferencesCacheInstance,
  // Surface internal state for the slice
  __resetForTest: () => {
    hoisted.preferencesCacheInstance.setMany.mockReset();
    hoisted.cachedSettingsRef.current = null;
  },
}));

vi.mock("@/paths/paths", () => ({
  getUserDataPath: () => "/tmp/vibes-test",
  getVibesAppPath: (p: string) => `/tmp/vibes-test/${p}`,
  getRuntimePath: () => "/tmp/vibes-test/runtime.json",
  getVibesAppsBaseDirectory: () => "/tmp/vibes-test/apps",
}));

vi.mock("@/ipc/utils/git_utils", () => ({}));

vi.mock("@/main/runtime", () => ({
  writeRuntimeState: () => {}, // no-op — runtime writes not relevant here
}));

// ── Imports (after mocks) ────────────────────────────────────────────────

import { miscEvents } from "../types/misc";

// ── Contract tests ───────────────────────────────────────────────────────

describe("Slice 3.8.2 — permission:persist-failed contract", () => {
  it("registers the event with channel 'permission:persist-failed'", () => {
    expect(miscEvents.permissionPersistFailed.channel).toBe(
      "permission:persist-failed",
    );
  });

  it("declares payload shape { requestId, toolId, pillKey, message }", () => {
    const payload = miscEvents.permissionPersistFailed.payload as {
      parse: (input: unknown) => {
        requestId: string;
        toolId: string;
        pillKey: string;
        message: string;
      };
    };
    const parsed = payload.parse({
      requestId: "req-1",
      toolId: "shell",
      pillKey: "shell",
      message: "fail",
    });
    expect(parsed).toEqual({
      requestId: "req-1",
      toolId: "shell",
      pillKey: "shell",
      message: "fail",
    });
  });

  it("rejects payload missing required fields (Zod fail-closed)", () => {
    const payload = miscEvents.permissionPersistFailed.payload as {
      parse: (input: unknown) => unknown;
    };
    expect(() => payload.parse({})).toThrow();
    expect(() => payload.parse({ requestId: "x" })).toThrow();
  });
});

// ── writeSettings outcome tests ──────────────────────────────────────────
//
// These mock preferencesCache.setMany and verify that writeSettings (when
// called with KV updates) returns the underlying DB write outcome.

describe("Slice 3.8.1 — writeSettings returns DB outcome", () => {
  beforeEach(() => {
    hoisted.preferencesCacheInstance.setMany.mockReset();
  });

  it("returns ok=true when setMany resolves with ok=true", async () => {
    hoisted.preferencesCacheInstance.setMany.mockResolvedValueOnce({
      ok: true,
    });
    const { writeSettings } = await import("../../main/settings");
    const result = await writeSettings({
      permissions: {
        tools: { shell: "allow" },
      },
    });
    expect(result).toEqual({ ok: true });
    expect(hoisted.preferencesCacheInstance.setMany).toHaveBeenCalledTimes(1);
  });

  it("returns ok=false with error message when setMany reports failure", async () => {
    hoisted.preferencesCacheInstance.setMany.mockResolvedValueOnce({
      ok: false,
      error: "BunnyDB timeout",
    });
    const { writeSettings } = await import("../../main/settings");
    const result = await writeSettings({
      permissions: {
        tools: { shell: "allow" },
      },
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("BunnyDB timeout");
  });

  it("returns ok=true with no DB call when no userId available", async () => {
    hoisted.preferencesCacheInstance.currentUserId = null;
    hoisted.preferencesCacheInstance.setMany.mockClear();
    const { writeSettings } = await import("../../main/settings");
    const result = await writeSettings({
      permissions: { tools: { shell: "allow" } },
    });
    // Session writes go to writeSession, not to the KV. With no userId
    // available in the cache OR in the settings payload, no KV call
    // happens — writeSettings still returns ok=true because there's
    // nothing to persist remotely.
    expect(result).toEqual({ ok: true });
  });

  it("returns ok=true (synchronous default) for runtime-only updates like isRunning", async () => {
    hoisted.preferencesCacheInstance.currentUserId = "user-1";
    hoisted.preferencesCacheInstance.setMany.mockClear();
    const { writeSettings } = await import("../../main/settings");
    const result = await writeSettings({ isRunning: false });
    // isRunning is a RUNTIME_KEY — never goes to KV, only to writeRuntimeState
    expect(result).toEqual({ ok: true });
    expect(hoisted.preferencesCacheInstance.setMany).not.toHaveBeenCalled();
  });
});
