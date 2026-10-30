import type { BibleData } from "@shared/types";
import { getChapterVerseCount } from "@shared/bible-service";
import { stepVerse, type VerseRange, type VerseRef } from "@shared/reference";

/**
 * The verse "Siguiente" or "Anterior" lands on. Steps from the edge of the
 * staged range in the direction of travel, so a multi-verse passage is not
 * walked back into itself. Null at the edges of the book or without text.
 */
export function nextStageTarget(
  range: VerseRange,
  delta: 1 | -1,
  bible: BibleData,
): VerseRef | null {
  const from = delta > 0 ? range.end : range.start;
  return stepVerse(
    from,
    delta,
    getChapterVerseCount(bible, from.book, from.chapter),
    (chapter) => getChapterVerseCount(bible, from.book, chapter),
  );
}
