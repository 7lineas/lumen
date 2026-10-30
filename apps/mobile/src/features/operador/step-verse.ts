import type { BibleData } from "@shared/types";
import type { VerseRef } from "@shared/reference";
import { getChapterVerseCount } from "@shared/bible-service";

/**
 * The verse one step before or after `ref`, crossing chapter boundaries inside
 * the same book. Returns null at the first or last verse of the book.
 *
 * Shared `stepVerse` does not walk back into the previous chapter, so the
 * phone uses this version for prev/next.
 */
export function stepInBible(
  bible: BibleData,
  ref: VerseRef,
  delta: 1 | -1,
): VerseRef | null {
  const sameChapter = ref.verse + delta;
  const count = getChapterVerseCount(bible, ref.book, ref.chapter);
  if (sameChapter >= 1 && sameChapter <= count) {
    return { book: ref.book, chapter: ref.chapter, verse: sameChapter };
  }

  const nextChapter = ref.chapter + delta;
  const nextCount = getChapterVerseCount(bible, ref.book, nextChapter);
  if (nextChapter < 1 || nextCount === 0) return null;
  return {
    book: ref.book,
    chapter: nextChapter,
    verse: delta > 0 ? 1 : nextCount,
  };
}
