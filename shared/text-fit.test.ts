import { describe, it, expect } from "vitest";
import { fitFontSize } from "./text-fit";

function linearFit(start: number, fits: (size: number) => boolean, floor = 28): number {
  let size = start;
  let guard = 500;
  while (guard-- > 0 && size > floor && !fits(size)) size -= 2;
  return size;
}

describe("fitFontSize", () => {
  it("matches the 2px linear walk for every threshold", () => {
    for (const start of [20, 28, 29, 30, 31, 60, 61, 96, 120, 151]) {
      for (let max = 0; max <= start + 4; max++) {
        const fits = (s: number) => s <= max;
        expect(fitFontSize(start, fits)).toBe(linearFit(start, fits));
      }
    }
  });

  it("measures once when the start size fits", () => {
    let calls = 0;
    expect(fitFontSize(96, () => (calls++, true))).toBe(96);
    expect(calls).toBe(1);
  });

  it("does not measure at or below the floor", () => {
    let calls = 0;
    expect(fitFontSize(28, () => (calls++, false))).toBe(28);
    expect(calls).toBe(0);
  });

  it("uses logarithmic measurements", () => {
    let calls = 0;
    expect(fitFontSize(200, (s) => (calls++, s <= 40))).toBe(40);
    expect(calls).toBeLessThanOrEqual(8);
  });
});
