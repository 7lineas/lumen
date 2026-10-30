import { describe, it, expect } from "vitest";
import {
  parseReference,
  normalizeSearchText,
  formatRange,
  stepVerse,
} from "./reference";

describe("parseReference", () => {
  it("parses Juan 3:16", () => {
    const r = parseReference("Juan 3:16");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.range.start.book).toBe("JHN");
      expect(r.range.start.chapter).toBe(3);
      expect(r.range.start.verse).toBe(16);
    }
  });

  it("parses jn 3:16", () => {
    const r = parseReference("jn 3:16");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.range.start.book).toBe("JHN");
    }
  });

  it("parses Juan 3 16", () => {
    const r = parseReference("Juan 3 16");
    expect(r.ok).toBe(true);
  });

  it("parses 1 cor 13:4-7", () => {
    const r = parseReference("1 cor 13:4-7");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.range.start.book).toBe("1CO");
      expect(r.range.end.verse).toBe(7);
    }
  });

  it("parses salmo 23", () => {
    const r = parseReference("salmo 23");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.range.start.book).toBe("PSA");
      expect(r.range.start.chapter).toBe(23);
    }
  });

  it("parses Gén 1", () => {
    const r = parseReference("Gén 1");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.range.start.book).toBe("GEN");
      expect(r.range.start.chapter).toBe(1);
    }
  });
});

describe("normalizeSearchText", () => {
  it("removes accents", () => {
    expect(normalizeSearchText("Dios amó")).toBe("dios amo");
  });
});

describe("formatRange", () => {
  it("formats verse range", () => {
    const s = formatRange({
      start: { book: "JHN", chapter: 3, verse: 16 },
      end: { book: "JHN", chapter: 3, verse: 16 },
    });
    expect(s).toContain("Juan");
    expect(s).toContain("3:16");
  });
});

describe("stepVerse", () => {
  /** Verse counts for GEN: chapter 1 has 3 verses, chapter 2 has 2, chapter 3 has 4. */
  const counts: Record<number, number> = { 1: 3, 2: 2, 3: 4 };
  const countIn = (chapter: number) => counts[chapter] ?? 0;

  it("moves inside a chapter without a callback", () => {
    expect(stepVerse({ book: "GEN", chapter: 1, verse: 1 }, 1, 3)).toEqual({
      book: "GEN",
      chapter: 1,
      verse: 2,
    });
    expect(stepVerse({ book: "GEN", chapter: 1, verse: 2 }, -1, 3)).toEqual({
      book: "GEN",
      chapter: 1,
      verse: 1,
    });
  });

  it("crosses forward to verse 1 of the next chapter without a callback", () => {
    expect(stepVerse({ book: "GEN", chapter: 1, verse: 3 }, 1, 3)).toEqual({
      book: "GEN",
      chapter: 2,
      verse: 1,
    });
  });

  it("returns null for a backward crossing without a callback", () => {
    expect(stepVerse({ book: "GEN", chapter: 2, verse: 1 }, -1, 2)).toBeNull();
  });

  it("crosses forward with a callback and lands on verse 1", () => {
    expect(
      stepVerse({ book: "GEN", chapter: 1, verse: 3 }, 1, 3, countIn),
    ).toEqual({ book: "GEN", chapter: 2, verse: 1 });
  });

  it("crosses backward with a callback and lands on the last verse", () => {
    expect(
      stepVerse({ book: "GEN", chapter: 2, verse: 1 }, -1, 2, countIn),
    ).toEqual({ book: "GEN", chapter: 1, verse: 3 });
  });

  it("uses the real count of the chapter it lands in, not the starting one", () => {
    // Chapter 3 has 4 verses, chapter 2 has only 2: walking back from 3:1
    // must land on 2:2, not on a verse counted from chapter 3.
    expect(
      stepVerse({ book: "GEN", chapter: 3, verse: 1 }, -1, 4, countIn),
    ).toEqual({ book: "GEN", chapter: 2, verse: 2 });
  });

  it("returns null at the start of the book", () => {
    expect(
      stepVerse({ book: "GEN", chapter: 1, verse: 1 }, -1, 3, countIn),
    ).toBeNull();
    expect(stepVerse({ book: "GEN", chapter: 1, verse: 1 }, -1, 3)).toBeNull();
  });

  it("returns null at the end of the book", () => {
    const lastCounts = (chapter: number) => (chapter === 50 ? 4 : 3);
    expect(
      stepVerse({ book: "GEN", chapter: 50, verse: 4 }, 1, 4, lastCounts),
    ).toBeNull();
    expect(stepVerse({ book: "GEN", chapter: 50, verse: 4 }, 1, 4)).toBeNull();
  });

  it("returns null when the callback reports no verses for the chapter", () => {
    expect(
      stepVerse({ book: "GEN", chapter: 1, verse: 3 }, 1, 3, () => 0),
    ).toBeNull();
  });

  it("returns null for an unknown book", () => {
    expect(
      stepVerse({ book: "XXX", chapter: 1, verse: 1 }, 1, 3, countIn),
    ).toBeNull();
  });
});
