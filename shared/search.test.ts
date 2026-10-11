import { describe, it, expect, beforeAll } from "vitest";
import { loadBible, searchVerses, setManifest } from "./bible-service";
import { normalizeSearchText } from "./reference";
import { bookDisplayName } from "./books";
import type { BibleData } from "./types";

const miniBible: BibleData = {
  meta: { id: "test", name: "Test", abbr: "TST", language: "es" },
  verses: {
    JHN: {
      "3": {
        "16": "Porque de tal manera amó Dios al mundo",
      },
    },
  },
  searchIndex: [
    {
      key: "JHN:3:16",
      book: "JHN",
      chapter: 3,
      verse: 16,
      text: "Porque de tal manera amó Dios al mundo",
    },
  ],
};

describe("searchVerses", () => {
  beforeAll(() => {
    setManifest([miniBible.meta]);
    loadBible(miniBible);
  });

  it("finds accent-insensitive matches", () => {
    const hits = searchVerses("test", "amo");
    expect(hits.length).toBe(1);
    expect(hits[0].verse).toBe(16);
  });

  it("finds keyword in text", () => {
    const hits = searchVerses("test", "mundo");
    expect(hits.length).toBe(1);
  });
});

describe("searchVerses over a larger index", () => {
  const texts = [
    "En el principio creó Dios los cielos y la tierra.",
    "Y dijo DIOS: Sea la luz; y fué la luz.",
    "Jesús lloró.",
    "Porque de tal manera amó Dios al mundo.",
    "El SEÑOR es mi pastor; nada me faltará.",
    "Él respondió: Señor, tú lo sabes.",
    "Bienaventurados los pacíficos.",
    "A.C. y D.C. son abreviaturas.",
  ];
  const bible: BibleData = {
    meta: { id: "big", name: "Big", abbr: "BIG", language: "es" },
    verses: {},
    searchIndex: texts.map((text, i) => ({ key: `GEN:1:${i + 1}`, book: "GEN", chapter: 1, verse: i + 1, text })),
  };

  function reference(query: string, limit = 50) {
    if (!query.trim()) return [];
    const q = normalizeSearchText(query);
    return bible.searchIndex
      .filter((e) => normalizeSearchText(e.text).includes(q))
      .slice(0, limit)
      .map((e) => ({
        book: e.book,
        chapter: e.chapter,
        verse: e.verse,
        text: e.text,
        snippet: `${bookDisplayName(e.book)} ${e.chapter}:${e.verse} — ${e.text}`,
      }));
  }

  beforeAll(() => loadBible(bible));

  it("matches a full rescan for accents, case, punctuation, empty queries and limits", () => {
    for (const q of ["dios", "DIOS", "Dios", "jesus", "JESÚS", "senor", "Señor", "el", "ac", "a.c", "pacificos", "", "   ", "zzz"]) {
      for (const limit of [1, 2, 50]) {
        expect(searchVerses("big", q, limit)).toEqual(reference(q, limit));
      }
    }
  });

  it("sees entries added when the index array is replaced", () => {
    expect(searchVerses("big", "nuevo")).toEqual([]);
    bible.searchIndex = [...bible.searchIndex, { key: "GEN:2:1", book: "GEN", chapter: 2, verse: 1, text: "Un cántico nuevo." }];
    expect(searchVerses("big", "nuevo").map((h) => h.verse)).toEqual([1]);
    expect(searchVerses("big", "dios")).toEqual(reference("dios"));
  });
});
