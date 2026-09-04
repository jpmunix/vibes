import { describe, expect, it } from "vitest";
import { formatActivityDuration } from "./FlowActivityStream";

describe("FlowThinkBlock collapse contract", () => {
  it("uses the shared duration formatter for thought summaries", () => {
    expect(formatActivityDuration(26_000)).toBe("26s");
    expect(formatActivityDuration(72_000)).toBe("1m 12s");
  });
});
