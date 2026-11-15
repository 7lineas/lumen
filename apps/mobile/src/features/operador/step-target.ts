import type { BibleData } from "@shared/types";
import { getChapterVerseCount } from "@shared/bible-service";
import { stepVerse, type VerseRange, type VerseRef } from "@shared/reference";

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
