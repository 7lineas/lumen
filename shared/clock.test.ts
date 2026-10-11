import { describe, expect, it } from "vitest";
import { formatClock, secondsSince, secondsUntil } from "./clock";

describe("formatClock", () => {
  it("formats minutes and seconds with two digits", () => {
    expect(formatClock(0)).toBe("00:00");
    expect(formatClock(5)).toBe("00:05");
    expect(formatClock(65)).toBe("01:05");
    expect(formatClock(599)).toBe("09:59");
  });

  it("adds hours from one hour up", () => {
    expect(formatClock(3600)).toBe("1:00:00");
    expect(formatClock(3725)).toBe("1:02:05");
  });

  it("never goes negative", () => {
    expect(formatClock(-3)).toBe("00:00");
  });
});

describe("secondsUntil and secondsSince", () => {
  it("counts a countdown down, rounding up", () => {
    expect(secondsUntil(10_000, 0)).toBe(10);
    expect(secondsUntil(10_000, 200)).toBe(10);
    expect(secondsUntil(10_000, 9_800)).toBe(1);
    expect(secondsUntil(10_000, 12_000)).toBe(0);
  });

  it("counts elapsed time, rounding down", () => {
    expect(secondsSince(1_000, 1_000)).toBe(0);
    expect(secondsSince(1_000, 2_999)).toBe(1);
    expect(secondsSince(1_000, 500)).toBe(0);
  });
});
