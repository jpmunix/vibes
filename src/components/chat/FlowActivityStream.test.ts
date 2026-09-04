import { describe, expect, it } from "vitest";
import { formatActivityDuration } from "./FlowActivityStream";

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
