import { describe, expect, it } from "vitest";
import type { BibleData } from "@shared/types";
import { nextStageTarget } from "./step-target";

// Genesis 1 has three verses and Genesis 2 has two; chapter 3 has no text.
const bible = {
  verses: {
    GEN: {
      "1": { "1": "a", "2": "b", "3": "c" },
      "2": { "1": "d", "2": "e" },
    },
  },
} as unknown as BibleData;

const single = (book: string, chapter: number, verse: number) => ({
  start: { book, chapter, verse },
  end: { book, chapter, verse },
});

describe("nextStageTarget", () => {
  it("steps forward and backward inside a chapter", () => {
    expect(nextStageTarget(single("GEN", 1, 1), 1, bible)).toEqual({
      book: "GEN",
      chapter: 1,
      verse: 2,
    });
    expect(nextStageTarget(single("GEN", 1, 2), -1, bible)).toEqual({
      book: "GEN",
      chapter: 1,
      verse: 1,
    });
  });

  it("crosses chapter boundaries in both directions", () => {
    expect(nextStageTarget(single("GEN", 1, 3), 1, bible)).toEqual({
      book: "GEN",
      chapter: 2,
      verse: 1,
    });
    expect(nextStageTarget(single("GEN", 2, 1), -1, bible)).toEqual({
      book: "GEN",
      chapter: 1,
      verse: 3,
    });
  });

  it("steps forward from the end of a multi-verse range", () => {
    const range = {
      start: { book: "GEN", chapter: 1, verse: 1 },
      end: { book: "GEN", chapter: 1, verse: 2 },
    };
    expect(nextStageTarget(range, 1, bible)).toEqual({
      book: "GEN",
      chapter: 1,
      verse: 3,
    });
  });

  it("steps backward from the start of a multi-verse range", () => {
    const range = {
      start: { book: "GEN", chapter: 1, verse: 2 },
      end: { book: "GEN", chapter: 1, verse: 3 },
    };
    expect(nextStageTarget(range, -1, bible)).toEqual({
      book: "GEN",
      chapter: 1,
      verse: 1,
    });
  });

  it("returns null when the next chapter has no text", () => {
    expect(nextStageTarget(single("GEN", 2, 2), 1, bible)).toBeNull();
  });

  it("returns null before the first verse of the book", () => {
    expect(nextStageTarget(single("GEN", 1, 1), -1, bible)).toBeNull();
  });

  it("returns null for an unknown book", () => {
    expect(nextStageTarget(single("XXX", 1, 1), 1, bible)).toBeNull();
  });
});
