import { BOOKS, type BookMeta } from "./books";
import { normalizeSearchText } from "./reference";

export interface BookMatch {
  book: BookMeta;
  chapters: number[];
}

export interface BookFilter {
  matches: BookMatch[];
  hasChapter: boolean;
}

const squash = (s: string): string =>
  normalizeSearchText(s).replace(/\s+/g, "");

function allChapters(book: BookMeta): number[] {
  return Array.from({ length: book.chapters }, (_, i) => i + 1);
}

function rank(book: BookMeta, query: string): number {
  const name = squash(book.name);
  if (name.startsWith(query) || name.replace(/^\d/, "").startsWith(query))
    return 0;
  if (
    book.abbrev.some((abbrev) => squash(abbrev).startsWith(query)) ||
    book.code.toLowerCase().startsWith(query)
  )
    return 0;
  return name.includes(query) ? 1 : -1;
}

export function filterBooks(query: string, currentBook?: string): BookFilter {
  const typed = normalizeSearchText(query).split(":")[0].trim();
  if (!typed)
    return {
      matches: BOOKS.map((book) => ({ book, chapters: allChapters(book) })),
      hasChapter: false,
    };

  if (/^\d+$/.test(typed)) {
    const book = BOOKS.find((b) => b.code === currentBook);
    const chapters = book
      ? allChapters(book).filter((c) => String(c).startsWith(typed))
      : [];
    return {
      matches: book && chapters.length ? [{ book, chapters }] : [],
      hasChapter: true,
    };
  }

  const parts = /^((?:[123]\s*)?\D+?)\s*(\d+)?$/.exec(typed);
  const bookQuery = squash(parts?.[1] ?? typed);
  const chapterQuery = parts?.[2] ?? "";

  const ranked = BOOKS.map((book) => ({
    book,
    rank: rank(book, bookQuery),
  })).filter((entry) => entry.rank >= 0);
  const best = ranked.some((entry) => entry.rank === 0)
    ? ranked.filter((entry) => entry.rank === 0)
    : ranked;

  const matches = best.flatMap(({ book }): BookMatch[] => {
    const chapters = chapterQuery
      ? allChapters(book).filter((c) => String(c).startsWith(chapterQuery))
      : allChapters(book);
    return chapters.length ? [{ book, chapters }] : [];
  });
  return { matches, hasChapter: chapterQuery !== "" };
}
