import { describe, expect, it } from "vitest";
import { filterBooks } from "./book-filter";

const names = (query: string, current?: string) => filterBooks(query, current).matches.map((m) => m.book.name);

describe("filterBooks", () => {
  it("lists every book with all its chapters when nothing is typed", () => {
    const { matches, hasChapter } = filterBooks("  ");
    expect(matches).toHaveLength(66);
    expect(matches[0].chapters).toHaveLength(50);
    expect(hasChapter).toBe(false);
  });

  it("filters books while typing, ignoring accents and case", () => {
    expect(names("gen")).toEqual(["Génesis"]);
    expect(names("EXO")).toEqual(["Éxodo"]);
    expect(names("ju")).toEqual(["Jueces", "Juan", "1 Juan", "2 Juan", "3 Juan", "Judas"]);
  });

  it("prefers books that start with the query over ones that contain it", () => {
    expect(names("sal")).toEqual(["Salmos"]);
    expect(names("tesal")).toEqual(["1 Tesalonicenses", "2 Tesalonicenses"]);
  });

  it("understands numbered books", () => {
    expect(names("1 ju")).toEqual(["1 Juan"]);
    expect(names("2cor")).toEqual(["2 Corintios"]);
  });

  it("narrows the chapters with the number after the book", () => {
    const { matches, hasChapter } = filterBooks("juan 3");
    expect(hasChapter).toBe(true);
    expect(matches[0].book.name).toBe("Juan");
    expect(matches[0].chapters).toEqual([3]);
    expect(filterBooks("sal 12").matches[0].chapters).toEqual([12, 120, 121, 122, 123, 124, 125, 126, 127, 128, 129]);
    expect(filterBooks("1 juan 3").matches.map((m) => [m.book.name, m.chapters])).toEqual([["1 Juan", [3]]]);
  });

  it("ignores the verse part and drops books without that chapter", () => {
    expect(filterBooks("jn 3:16").matches[0].chapters).toEqual([3]);
    expect(names("judas 2")).toEqual([]);
  });

  it("treats a bare number as a chapter of the open book", () => {
    const { matches } = filterBooks("2", "JHN");
    expect(matches.map((m) => m.book.code)).toEqual(["JHN"]);
    expect(matches[0].chapters).toEqual([2, 20, 21]);
    expect(names("7")).toEqual([]);
  });
});
