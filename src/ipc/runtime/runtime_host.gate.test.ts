/**
 * B6: Unit tests for the Vibes permission gate in runtime_host.ts — the piece
 * that decides allow/deny/ask per tool call and talks to the existing
 * `opencode-permission:*` UI contract.
 *
 * `electron` and `settings` are mocked; permission_state runs for real so the
 * full ask → renderer-response round-trip is exercised.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("electron", () => ({
  app: { getPath: () => "/tmp/fake-userdata" },
}));

vi.mock("../../main/settings", () => ({
  readSettings: vi.fn(() => ({})),
}));

import { createVibesPermissionGate } from "./runtime_host";
import { readSettings } from "../../main/settings";
import {
  setSessionUIContext,
  clearSessionUIContext,
  respondRuntimePermission,
  rejectAllPendingRuntimePermissions,
} from "./permission_state";
import type { PermissionRequest } from "@vibes/runtime";

const gate = createVibesPermissionGate();
const signal = new AbortController().signal;

function request(toolId: string, sessionId = "sess-1"): PermissionRequest {
  return {
    requestId: `req-${toolId}-${Math.random().toString(36).slice(2)}`,
    sessionId,
    toolCallId: "tc-1",
    toolId,
    args: { cmd: "ls" },
    ts: Date.now(),
  };
}

function senderSpy() {
  const calls: Array<{ channel: string; args: unknown[] }> = [];
  return {
    calls,
    sender: {
      isDestroyed: () => false,
      send: (channel: string, ...args: unknown[]) => calls.push({ channel, args }),
    } as any,
  };
}

afterEach(() => {
  rejectAllPendingRuntimePermissions();
  clearSessionUIContext("sess-1");
});

describe("createVibesPermissionGate — Slice 3.3 cascade", () => {
  // Defaults: read_* → allow. Vibes owns the policy.
  it.each(["read_file", "glob", "grep"])(
    "auto-allows %s via Vibes default (not a runtime bypass)",
    async (toolId) => {
      await expect(gate.requestPermission(request(toolId), signal)).resolves.toBe("allow");
    },
  );

  // Mutating defaults → ask (no pill set). Without a session UI context,
  // the gate fails closed with "deny" (not "ask"). To verify the "ask"
  // path actually reaches the UI, the round-trip test below sets up the
  // session UI context.
  it.each(["write_file", "edit_file", "shell"])(
    "denies %s via Vibes default + fail-closed when no UI context",
    async (toolId) => {
      await expect(gate.requestPermission(request(toolId), signal)).resolves.toBe("deny");
    },
  );
});

describe("createVibesPermissionGate — settings pills (Slice 3.2 keys)", () => {
  beforeEach(() => {
    const { sender } = senderSpy();
    setSessionUIContext("sess-1", { chatId: 1, sender });
  });

  it('pill "allow" (permissions.tools.shell) resolves immediately without asking the UI', async () => {
    vi.mocked(readSettings).mockReturnValueOnce({
      permissions: { tools: { shell: "allow" } },
    } as any);
    const { calls, sender } = senderSpy();
    setSessionUIContext("sess-1", { chatId: 1, sender });

    await expect(gate.requestPermission(request("shell"), signal)).resolves.toBe("allow");
    expect(calls).toHaveLength(0); // never asked the renderer
  });

  it('pill "deny" (permissions.tools.write_file) rejects immediately', async () => {
    vi.mocked(readSettings).mockReturnValueOnce({
      permissions: { tools: { write_file: "deny" } },
    } as any);
    await expect(gate.requestPermission(request("write_file"), signal)).resolves.toBe("deny");
  });

  // Slice 3.3: sub-pill takes priority over default pill.
  it('shell sub-pill "rm: deny" wins over default shell ask', async () => {
    vi.mocked(readSettings).mockReturnValueOnce({
      permissions: { shellSubPills: { rm: "deny" } },
    } as any);
    const rmReq = {
      ...request("shell"),
      args: { command: "rm -rf /tmp/foo" },
    };
    await expect(gate.requestPermission(rmReq, signal)).resolves.toBe("deny");
  });

  // Slice 3.3: custom rule wins over default.
  it('custom rule "ls: allow" matches by prefix', async () => {
    vi.mocked(readSettings).mockReturnValueOnce({
      permissions: {
        customRules: [{ id: "r1", pattern: "ls", permission: "allow" }],
      },
    } as any);
    const lsReq = {
      ...request("shell"),
      args: { command: "ls -la /tmp" },
    };
    await expect(gate.requestPermission(lsReq, signal)).resolves.toBe("allow");
  });
});

describe("createVibesPermissionGate — fail-closed without UI", () => {
  it("denies when there is no window to ask", async () => {
    // No session UI context registered.
    await expect(gate.requestPermission(request("shell"), signal)).resolves.toBe("deny");
  });
});

describe("createVibesPermissionGate — ask round-trip", () => {
  it("sends opencode-permission:request and maps once/always → allow", async () => {
    vi.mocked(readSettings).mockReturnValueOnce({
      permissions: { tools: { shell: "ask" } },
    } as any);
    const { calls, sender } = senderSpy();
    setSessionUIContext("sess-1", { chatId: 42, sender });

    const req = request("shell");
    const pending = gate.requestPermission(req, signal);

    // The UI received the exact OpenCode-compatible payload.
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]!.channel).toBe("opencode-permission:request");
    expect(calls[0]!.args[0]).toMatchObject({
      requestId: req.requestId,
      sessionId: req.sessionId,
      chatId: 42,
      toolName: "shell",
    });

    // Renderer answers "once" → the gate allows.
    respondRuntimePermission(req.requestId, "once");
    await expect(pending).resolves.toBe("allow");
  });

  it("maps reject → deny", async () => {
    vi.mocked(readSettings).mockReturnValueOnce({} as any); // unset pill = ask
    const { sender } = senderSpy();
    setSessionUIContext("sess-1", { chatId: 1, sender });

    const req = request("write_file");
    const pending = gate.requestPermission(req, signal);
    respondRuntimePermission(req.requestId, "reject");
    await expect(pending).resolves.toBe("deny");
  });

  it("denies when the session signal aborts while waiting", async () => {
    vi.mocked(readSettings).mockReturnValueOnce({} as any);
    const { sender } = senderSpy();
    setSessionUIContext("sess-1", { chatId: 1, sender });

    const ac = new AbortController();
    const pending = gate.requestPermission(request("shell"), ac.signal);
    ac.abort();
    await expect(pending).resolves.toBe("deny");
  });
});
