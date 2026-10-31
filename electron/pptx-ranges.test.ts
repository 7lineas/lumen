import { describe, expect, it } from "vitest";
import { planSlideRanges } from "./pptx-ranges";

describe("planSlideRanges", () => {
  it("keeps small decks in one open-ended range", () => {
    expect(planSlideRanges(5, 300, 4)).toEqual([{ first: 1, last: 300 }]);
  });

  it("splits into contiguous ranges and leaves the last one open-ended", () => {
    expect(planSlideRanges(24, 300, 3)).toEqual([
      { first: 1, last: 8 },
      { first: 9, last: 16 },
      { first: 17, last: 300 },
    ]);
  });

  it("never gives a worker fewer than four slides", () => {
    expect(planSlideRanges(9, 300, 4)).toEqual([
      { first: 1, last: 5 },
      { first: 6, last: 300 },
    ]);
  });

  it("covers every slide exactly once", () => {
    for (const total of [1, 7, 13, 50, 299]) {
      const ranges = planSlideRanges(total, 300, 3);
      expect(ranges[0]!.first).toBe(1);
      expect(ranges.at(-1)!.last).toBe(300);
      for (let i = 1; i < ranges.length; i++)
        expect(ranges[i]!.first).toBe(ranges[i - 1]!.last + 1);
    }
  });

  it("respects maxSlides", () => {
    expect(planSlideRanges(500, 300, 1)).toEqual([{ first: 1, last: 300 }]);
  });
});
