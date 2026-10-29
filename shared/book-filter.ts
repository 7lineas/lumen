import { BOOKS, type BookMeta } from "./books";
import { normalizeSearchText } from "./reference";

export interface BookMatch {
  book: BookMeta;
  /** Chapters of the book that match the typed number; every chapter when no number was typed. */
  chapters: number[];
}

export interface BookFilter {
  matches: BookMatch[];
  /** True when the query narrows the chapters ("juan 3"), so the lists should open. */
  hasChapter: boolean;
}

const squash = (s: string): string =>
  normalizeSearchText(s).replace(/\s+/g, "");

function allChapters(book: BookMeta): number[] {
  return Array.from({ length: book.chapters }, (_, i) => i + 1);
}

/** 0 = the name (or an abbreviation) starts with the query, 1 = it only contains it, -1 = no match. */
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

/**
 * Books and chapters for what is being typed in the Bible sidebar: "ju" lists
 * Jueces, Juan, Judas…; "juan 3" keeps the chapters of Juan that start with 3;
 * a bare number narrows the chapters of the book that is open. Anything after
 * a colon (the verse) is ignored here.
 */
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

  // "1 juan 3" → book "1juan", chapter "3". The leading digit belongs to the book.
  const parts = /^((?:[123]\s*)?\D+?)\s*(\d+)?$/.exec(typed);
  const bookQuery = squash(parts?.[1] ?? typed);
  const chapterQuery = parts?.[2] ?? "";

  const ranked = BOOKS.map((book) => ({
    book,
    rank: rank(book, bookQuery),
  })).filter((entry) => entry.rank >= 0);
  // A book that starts with the query hides the ones that merely contain it ("sal" is Salmos, not Tesalonicenses).
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
