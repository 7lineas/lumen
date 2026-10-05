import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveBook } from "./book-aliases";
import { ImportError, mergeParsed, parseBibleText, summarize } from "./parsers";

const fixture = (name: string) => fs.readFileSync(path.join(__dirname, "fixtures", name), "utf8");

describe("resolveBook", () => {
  it("understands USFM, OSIS, English, Spanish, abbreviations and positions", () => {
    expect(resolveBook("JHN")).toBe("JHN");
    expect(resolveBook("John")).toBe("JHN");
    expect(resolveBook("Juan")).toBe("JHN");
    expect(resolveBook("Génesis")).toBe("GEN");
    expect(resolveBook("1 Cor")).toBe("1CO");
    expect(resolveBook("I John")).toBe("1JN");
    expect(resolveBook("1 Juan")).toBe("1JN");
    expect(resolveBook("Cantar de los Cantares")).toBe("SNG");
    expect(resolveBook("Song of Songs")).toBe("SNG");
    expect(resolveBook("43")).toBe("JHN");
    expect(resolveBook("67")).toBeNull();
    expect(resolveBook("Tobit")).toBeNull();
  });
});

describe("parseBibleText", () => {
  const expectSample = (verses: Record<string, Record<string, Record<string, string>>>) => {
    expect(verses.GEN["1"]["1"]).toBe("EN el principio crió Dios los cielos y la tierra.");
    expect(verses.JHN["3"]["16"]).toBe("Porque de tal manera amó Dios al mundo.");
    expect(verses.JHN["3"]["17"]).toBe("Porque no envió Dios á su Hijo al mundo.");
  };

  it("reads the Lumen JSON, accepting book names as keys, and its metadata", () => {
    const parsed = parseBibleText("sample.json", fixture("sample.json"));
    expect(parsed.format).toBe("json");
    expectSample(parsed.verses);
    expect(parsed.hint).toMatchObject({ name: "Muestra JSON", abbr: "MJSON", copyright: "Dominio público" });
  });

  it("reads JSON with the books at the root (no \"verses\"), Spanish names and \"S. Mateo\"-style gospels", () => {
    const parsed = parseBibleText("RVR1960 - Spanish.json", fixture("sample-root-books.json"));
    expect(parsed.format).toBe("json");
    expect(Object.keys(parsed.verses).sort()).toEqual(["2PE", "GEN", "JHN", "LUK", "MAT", "MRK"]);
    expect(parsed.verses.GEN["1"]["1"]).toBe("En el principio creó Dios los cielos y la tierra.");
    expect(parsed.verses.MAT["1"]["1"]).toMatch(/^Libro de la genealogía/);
    expect(parsed.verses.JHN["3"]["16"]).toMatch(/^Porque de tal manera/);
    expect(parsed.verses["2PE"]["3"]["18"]).toMatch(/^Antes bien/);
    expect(parsed.warnings).toEqual([]);
  });

  it("recognizes the Spanish \"S./San\" gospel names", () => {
    for (const [name, code] of [
      ["S. Mateo", "MAT"], ["San Marcos", "MRK"], ["S. Lucas", "LUK"], ["S.Juan", "JHN"], ["S. Juan", "JHN"], ["San Juan", "JHN"],
    ]) {
      expect(resolveBook(name)).toBe(code);
    }
  });

  it("reads a JSON list of {book, chapter, verse, text}", () => {
    const parsed = parseBibleText(
      "x.json",
      JSON.stringify([{ book: "JHN", chapter: 3, verse: 16, text: "Porque de tal manera." }]),
    );
    expect(parsed.verses.JHN["3"]["16"]).toBe("Porque de tal manera.");
  });

  it("reads Zefania XML: numbers, notes dropped, styles kept, unknown books reported", () => {
    const parsed = parseBibleText("sample.zefania.xml", fixture("sample.zefania.xml"));
    expect(parsed.format).toBe("zefania");
    expectSample(parsed.verses);
    expect(parsed.verses.GEN["1"]["2"]).toBe("Y la tierra estaba desordenada y vacía.");
    expect(parsed.hint).toMatchObject({ name: "Muestra Zefania", abbr: "MZEF", language: "es", copyright: "Dominio público" });
    expect(parsed.warnings.join(" ")).toMatch(/Tobit/);
  });

  it("reads OSIS XML: wrapped and milestone verses, notes and titles dropped", () => {
    const parsed = parseBibleText("sample.osis.xml", fixture("sample.osis.xml"));
    expect(parsed.format).toBe("osis");
    expectSample(parsed.verses);
    expect(parsed.verses.GEN["1"]["2"]).toBe("Y la tierra estaba desordenada y vacía.");
    expect(Object.keys(parsed.verses.GEN["1"])).toEqual(["1", "2"]);
    expect(parsed.hint).toMatchObject({ name: "Muestra OSIS", copyright: "Dominio público", language: "es" });
  });

  it("reads USFM: footnotes, headings and character markers removed, verse ranges", () => {
    const gen = parseBibleText("gen.usfm", fixture("sample.usfm"));
    expect(gen.format).toBe("usfm");
    expect(gen.verses.GEN["1"]["1"]).toBe("EN el principio crió Dios los cielos y la tierra.");
    expect(gen.verses.GEN["1"]["2"]).toBe("Y la tierra estaba desordenada y vacía. línea de poesía");
    const jhn = parseBibleText("jhn.usfm", fixture("sample-jhn.usfm"));
    expect(jhn.verses.JHN["3"]["16"]).toBe("Porque de tal manera amó Dios al mundo.");
    expect(jhn.verses.JHN["3"]["17"]).toBe("Porque no envió Dios á su Hijo al mundo.");
  });

  it("reads CSV with header (Spanish names) and TSV without header", () => {
    const csv = parseBibleText("sample.csv", fixture("sample.csv"));
    expect(csv.format).toBe("csv");
    expect(csv.verses.GEN["1"]["2"]).toBe("Y la tierra estaba desordenada, y vacía.");
    expect(csv.verses.JHN["3"]["16"]).toBe("Porque de tal manera amó Dios al mundo.");
    const tsv = parseBibleText("sample.tsv", fixture("sample.tsv"));
    expect(tsv.verses.JHN["3"]["16"]).toBe("Porque de tal manera amó Dios al mundo.");
    expect(Object.keys(tsv.verses.GEN["1"])).toHaveLength(2);
  });

  it("reads CSV with quoted multiline text and a two-column reference,text layout", () => {
    const parsed = parseBibleText("r.csv", 'ref,text\n"Juan 3:16","Porque de tal manera\namó Dios, ""al mundo"""\nSalmos 23.1,"Jehová es mi pastor"\n');
    expect(parsed.verses.JHN["3"]["16"]).toBe('Porque de tal manera amó Dios, "al mundo"');
    expect(parsed.verses.PSA["23"]["1"]).toBe("Jehová es mi pastor");
  });

  it("strips a BOM and reports repeated verses", () => {
    const parsed = parseBibleText("a.tsv", "\uFEFFJHN\t3\t16\tuno\nJHN\t3\t16\tdos\n");
    expect(parsed.verses.JHN["3"]["16"]).toBe("dos");
    expect(parsed.warnings.join(" ")).toMatch(/repetido/);
  });

  it("gives clear errors", () => {
    expect(() => parseBibleText("a.json", "   ")).toThrow(/vacío/);
    expect(() => parseBibleText("a.json", "{ roto")).toThrow(/JSON no es válido/);
    expect(() => parseBibleText("a.json", '{"verses":[]}')).toThrow(/"verses"/);
    expect(() => parseBibleText("a.json", '{"verses":{"Tobit":{"1":{"1":"x"}}}}')).toThrow(/ningún versículo/);
    expect(() => parseBibleText("a.xml", "<foo><bar/></foo>")).toThrow(/Zefania/);
    expect(() => parseBibleText("a.pdf", "%PDF-1.4 binary")).toThrow(ImportError);
    expect(() => parseBibleText("a.csv", "uno,dos\n")).toThrow(/ningún versículo/);
    expect(() => parseBibleText("a.csv", "x,y,z\n1,2,3\n")).toThrow(/4 columnas/);
  });
});

describe("summarize / mergeParsed", () => {
  it("counts books, chapters and verses and warns about partial Bibles", () => {
    const summary = summarize(parseBibleText("sample.json", fixture("sample.json")));
    expect(summary).toMatchObject({ bookCount: 2, chapterCount: 2, verseCount: 4, hasOldTestament: true, hasNewTestament: true });
    expect(summary.books.map((b) => b.code)).toEqual(["GEN", "JHN"]);
    expect(summary.warnings.join(" ")).toMatch(/2 de 66 libros/);
  });

  it("merges per-book files", () => {
    const merged = mergeParsed([
      parseBibleText("gen.usfm", fixture("sample.usfm")),
      parseBibleText("jhn.usfm", fixture("sample-jhn.usfm")),
    ]);
    expect(Object.keys(merged.verses)).toEqual(["GEN", "JHN"]);
  });
});
