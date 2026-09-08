import { describe, expect, it } from "vitest";
import {
  formatActivityDuration,
  parseDurationMs,
  computeFlowActivityCollapsed,
} from "./FlowActivityStream";

describe("formatActivityDuration", () => {
  it("formats sub-minute durations as Ns", () => {
    expect(formatActivityDuration(0)).toBe("0s");
    expect(formatActivityDuration(999)).toBe("1s");
    expect(formatActivityDuration(26_000)).toBe("26s");
    expect(formatActivityDuration(59_499)).toBe("59s");
  });

  it("formats minute+second durations as Mm Ss when seconds are non-zero", () => {
    expect(formatActivityDuration(60_000)).toBe("1m");
    expect(formatActivityDuration(72_500)).toBe("1m 13s");
    expect(formatActivityDuration(125_000)).toBe("2m 5s");
  });

  it("clamps negative durations to 0s", () => {
    expect(formatActivityDuration(-100)).toBe("0s");
  });
});

describe("parseDurationMs", () => {
  it("parses the duration-ms attribute from the worker payload", () => {
    expect(parseDurationMs({ "duration-ms": "1234" })).toBe(1234);
    expect(parseDurationMs({ "duration-ms": "0" })).toBe(0);
  });

  it("returns undefined when the attribute is missing (historical messages)", () => {
    expect(parseDurationMs({})).toBeUndefined();
    expect(parseDurationMs(undefined)).toBeUndefined();
  });

  it("rejects garbage values instead of inventing a duration", () => {
    expect(parseDurationMs({ "duration-ms": "abc" })).toBeUndefined();
    expect(parseDurationMs({ "duration-ms": "-5" })).toBeUndefined();
  });
});

describe("computeFlowActivityCollapsed", () => {
  const base = {
    collapsedByStream: false,
    isStreaming: true,
    expandedByUser: null,
  };

  it("keeps the panel expanded during streaming when there is no prose after", () => {
    expect(
      computeFlowActivityCollapsed({ ...base, hasProseAfter: false }),
    ).toBe(false);
  });

  it("collapses when prose arrives during streaming (the bug: module scroll stays open)", () => {
    expect(
      computeFlowActivityCollapsed({ ...base, hasProseAfter: true }),
    ).toBe(true);
  });

  it("collapses when the stream ends without prose after", () => {
    expect(
      computeFlowActivityCollapsed({ ...base, isStreaming: false }),
    ).toBe(true);
  });

  it("respects an explicit user expansion even when prose arrives", () => {
    expect(
      computeFlowActivityCollapsed({
        ...base,
        hasProseAfter: true,
        expandedByUser: true,
      }),
    ).toBe(false);
  });

  it("respects an explicit user collapse during streaming", () => {
    expect(
      computeFlowActivityCollapsed({
        ...base,
        expandedByUser: false,
      }),
    ).toBe(true);
  });

  it("collapsedByStream wins over a user expansion when the stream truly ends", () => {
    // The sticky flag is set by the layout effect on the true→false transition.
    expect(
      computeFlowActivityCollapsed({
        ...base,
        isStreaming: false,
        collapsedByStream: true,
        expandedByUser: true,
      }),
    ).toBe(true);
  });
});
