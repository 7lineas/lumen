import { describe, expect, it } from "vitest";
import type { BibleData } from "@shared/types";
import { stepInBible } from "./step-verse";

/** GEN has two chapters: 3 verses, then 2 verses. */
const bible = {
  verses: {
    GEN: {
      "1": { "1": "a", "2": "b", "3": "c" },
      "2": { "1": "d", "2": "e" },
    },
  },
} as unknown as BibleData;

describe("stepInBible", () => {
  it("moves inside a chapter", () => {
    expect(stepInBible(bible, { book: "GEN", chapter: 1, verse: 1 }, 1)).toEqual(
      { book: "GEN", chapter: 1, verse: 2 },
    );
  });

  it("crosses to the next chapter at the last verse", () => {
    expect(stepInBible(bible, { book: "GEN", chapter: 1, verse: 3 }, 1)).toEqual(
      { book: "GEN", chapter: 2, verse: 1 },
    );
  });

  it("goes back into the previous chapter's last verse", () => {
    expect(stepInBible(bible, { book: "GEN", chapter: 2, verse: 1 }, -1)).toEqual(
      { book: "GEN", chapter: 1, verse: 3 },
    );
  });

  it("stops at the ends of the book", () => {
    expect(stepInBible(bible, { book: "GEN", chapter: 1, verse: 1 }, -1)).toBeNull();
    expect(stepInBible(bible, { book: "GEN", chapter: 2, verse: 2 }, 1)).toBeNull();
  });
});
