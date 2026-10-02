import type { VerseRange, VerseRef } from "./reference";

/** Click a verse to stage it. Shift-click extends a range in the same chapter. */
export function rangeFromVerseClick(
  anchor: VerseRef | null,
  book: string,
  chapter: number,
  verse: number,
  shiftKey: boolean,
): { range: VerseRange; anchor: VerseRef } {
  const clicked: VerseRef = { book, chapter, verse };
  if (
    shiftKey &&
    anchor &&
    anchor.book === book &&
    anchor.chapter === chapter
  ) {
    const lo = Math.min(anchor.verse, verse);
    const hi = Math.max(anchor.verse, verse);
    return {
      range: {
        start: { book, chapter, verse: lo },
        end: { book, chapter, verse: hi },
      },
      anchor,
    };
  }
  return {
    range: { start: clicked, end: clicked },
    anchor: clicked,
  };
}
