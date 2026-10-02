import { describe, expect, it } from "vitest";
import { rangeFromVerseClick } from "./stage";

describe("rangeFromVerseClick", () => {
  it("stages a single verse", () => {
    const { range, anchor } = rangeFromVerseClick(null, "JHN", 3, 16, false);
    expect(range.start.verse).toBe(16);
    expect(range.end.verse).toBe(16);
    expect(anchor.verse).toBe(16);
  });

  it("extends a range with shift in the same chapter", () => {
    const first = rangeFromVerseClick(null, "JHN", 3, 16, false);
    const second = rangeFromVerseClick(first.anchor, "JHN", 3, 18, true);
    expect(second.range.start.verse).toBe(16);
    expect(second.range.end.verse).toBe(18);
    expect(second.anchor.verse).toBe(16);
  });

  it("ignores shift when the chapter changes", () => {
    const first = rangeFromVerseClick(null, "JHN", 3, 16, false);
    const second = rangeFromVerseClick(first.anchor, "JHN", 4, 1, true);
    expect(second.range.start.chapter).toBe(4);
    expect(second.range.end.verse).toBe(1);
  });
});
