import { BOOKS, BOOK_BY_CODE, type BookMeta } from "./books";

export interface VerseRef {
  book: string;
  chapter: number;
  verse: number;
}

export interface VerseRange {
  start: VerseRef;
  end: VerseRef;
}

export interface ParseResult {
  ok: true;
  range: VerseRange;
}

export interface ParseError {
  ok: false;
  message: string;
}

export type ParseReferenceResult = ParseResult | ParseError;

const bookLookup = buildBookLookup();

function buildBookLookup(): Map<string, BookMeta> {
  const map = new Map<string, BookMeta>();
  for (const book of BOOKS) {
    map.set(normalizeToken(book.name), book);
    map.set(normalizeToken(book.code), book);
    for (const a of book.abbrev) {
      map.set(normalizeToken(a), book);
    }
    const numbered = book.name.match(/^(\d)\s+(.+)$/);
    if (numbered) {
      map.set(normalizeToken(`${numbered[1]}${numbered[2]}`), book);
      map.set(normalizeToken(`${numbered[1]} ${numbered[2]}`), book);
    }
  }
  return map;
}

export function normalizeToken(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[.]/g, "")
    .trim();
}

export function normalizeSearchText(s: string): string {
  return normalizeToken(s);
}

function parseVersePart(part: string): { chapter: number; verseStart: number; verseEnd?: number } | null {
  const cleaned = part.replace(/\s+/g, " ").trim();
  const rangeMatch = cleaned.match(/^(\d+)\s*:\s*(\d+)\s*-\s*(\d+)$/);
  if (rangeMatch) {
    return {
      chapter: parseInt(rangeMatch[1], 10),
      verseStart: parseInt(rangeMatch[2], 10),
      verseEnd: parseInt(rangeMatch[3], 10),
    };
  }
  const colonMatch = cleaned.match(/^(\d+)\s*:\s*(\d+)$/);
  if (colonMatch) {
    return {
      chapter: parseInt(colonMatch[1], 10),
      verseStart: parseInt(colonMatch[2], 10),
    };
  }
  const spaceMatch = cleaned.match(/^(\d+)\s+(\d+)(?:\s*-\s*(\d+))?$/);
  if (spaceMatch) {
    return {
      chapter: parseInt(spaceMatch[1], 10),
      verseStart: parseInt(spaceMatch[2], 10),
      verseEnd: spaceMatch[3] ? parseInt(spaceMatch[3], 10) : undefined,
    };
  }
  const chapterOnly = cleaned.match(/^(\d+)$/);
  if (chapterOnly) {
    return { chapter: parseInt(chapterOnly[1], 10), verseStart: 1 };
  }
  return null;
}

function resolveBookName(raw: string): BookMeta | null {
  const norm = normalizeToken(raw);
  if (bookLookup.has(norm)) {
    return bookLookup.get(norm)!;
  }
  const compact = norm.replace(/\s+/g, "");
  if (bookLookup.has(compact)) {
    return bookLookup.get(compact)!;
  }
  for (const [key, book] of bookLookup) {
    if (key.startsWith(compact) || compact.startsWith(key)) {
      if (Math.min(key.length, compact.length) >= 2) {
        return book;
      }
    }
  }
  return null;
}

/**
 * Parse Spanish-friendly references: "jn 3:16", "Juan 3 16", "1 cor 13:4-7", "salmo 23", "Gén 1"
 */
export function parseReference(input: string): ParseReferenceResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, message: "Escriba una referencia" };
  }

  let working = trimmed.replace(/\s+/g, " ");

  const numberedPrefix = working.match(/^(\d)\s*([a-záéíóúñA-ZÁÉÍÓÚÑ.]+)\s+(.+)$/i);
  if (numberedPrefix) {
    working = `${numberedPrefix[1]} ${numberedPrefix[2]} ${numberedPrefix[3]}`;
  }

  const parts = working.split(/\s+/);
  if (parts.length < 2) {
    const single = resolveBookName(working);
    if (single?.code === "PSA") {
      return {
        ok: true,
        range: {
          start: { book: single.code, chapter: 1, verse: 1 },
          end: { book: single.code, chapter: 1, verse: 1 },
        },
      };
    }
    return { ok: false, message: "Formato no reconocido" };
  }

  let bookPart = "";
  let restStart = 0;

  if (/^\d$/.test(parts[0]) && parts.length >= 3) {
    bookPart = `${parts[0]} ${parts[1]}`;
    restStart = 2;
  } else {
    bookPart = parts[0];
    restStart = 1;
  }

  const book = resolveBookName(bookPart);
  if (!book) {
    if (parts.length >= 2) {
      const tryTwo = resolveBookName(`${parts[0]} ${parts[1]}`);
      if (tryTwo) {
        bookPart = `${parts[0]} ${parts[1]}`;
        restStart = 2;
      }
    }
  }

  const resolved = resolveBookName(bookPart);
  if (!resolved) {
    return { ok: false, message: `Libro no reconocido: ${bookPart}` };
  }

  const rest = parts.slice(restStart).join(" ");
  const parsed = parseVersePart(rest);
  if (!parsed) {
    if (normalizeToken(bookPart).includes("salmo") || resolved.code === "PSA") {
      const psalmNum = parseInt(parts[restStart] ?? "1", 10);
      if (!Number.isNaN(psalmNum) && psalmNum >= 1 && psalmNum <= 150) {
        return {
          ok: true,
          range: {
            start: { book: "PSA", chapter: psalmNum, verse: 1 },
            end: { book: "PSA", chapter: psalmNum, verse: 1 },
          },
        };
      }
    }
    return { ok: false, message: "Capítulo o versículo no válido" };
  }

  const start: VerseRef = {
    book: resolved.code,
    chapter: parsed.chapter,
    verse: parsed.verseStart,
  };
  const endVerse = parsed.verseEnd ?? parsed.verseStart;
  const end: VerseRef = {
    book: resolved.code,
    chapter: parsed.chapter,
    verse: endVerse,
  };

  if (start.chapter < 1 || start.verse < 1 || end.verse < start.verse) {
    return { ok: false, message: "Rango de versículos no válido" };
  }
  if (start.chapter > resolved.chapters) {
    return { ok: false, message: `El libro solo tiene ${resolved.chapters} capítulos` };
  }

  return { ok: true, range: { start, end } };
}

export function formatReference(ref: VerseRef, versionLabel?: string): string {
  const book = BOOK_BY_CODE.get(ref.book);
  const name = book?.name ?? ref.book;
  const base = `${name} ${ref.chapter}:${ref.verse}`;
  return versionLabel ? `${base} — ${versionLabel}` : base;
}

export function formatRange(range: VerseRange, versionLabel?: string): string {
  const book = BOOK_BY_CODE.get(range.start.book);
  const name = book?.name ?? range.start.book;
  let ref: string;
  if (range.start.chapter === range.end.chapter) {
    if (range.start.verse === range.end.verse) {
      ref = `${name} ${range.start.chapter}:${range.start.verse}`;
    } else {
      ref = `${name} ${range.start.chapter}:${range.start.verse}-${range.end.verse}`;
    }
  } else {
    ref = `${name} ${range.start.chapter}:${range.start.verse}–${range.end.chapter}:${range.end.verse}`;
  }
  return versionLabel ? `${ref} — ${versionLabel}` : ref;
}

export function expandRange(range: VerseRange, maxVerses = 30): VerseRef[] {
  const refs: VerseRef[] = [];
  const book = range.start.book;
  if (book !== range.end.book) {
    return [range.start];
  }
  for (let v = range.start.verse; v <= range.end.verse; v++) {
    refs.push({ book, chapter: range.start.chapter, verse: v });
    if (refs.length >= maxVerses) break;
  }
  return refs;
}

export function stepVerse(ref: VerseRef, delta: number, verseCountInChapter: number): VerseRef | null {
  const book = BOOK_BY_CODE.get(ref.book);
  if (!book) return null;

  let { chapter, verse } = ref;
  verse += delta;

  while (verse < 1) {
    chapter -= 1;
    if (chapter < 1) return null;
    verse = 999;
  }
  while (verse > verseCountInChapter) {
    chapter += 1;
    verse = 1;
    if (chapter > book.chapters) return null;
    verseCountInChapter = 999;
  }

  if (chapter < 1 || chapter > book.chapters) return null;
  return { book: ref.book, chapter, verse };
}
