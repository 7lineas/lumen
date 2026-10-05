import { describe, expect, it } from "vitest";
import {
  buildOnlineVersions,
  emptyOnlineBible,
  hasChapter,
  isOnlineVersionId,
  mergeChapter,
  parseYvVersionId,
  yvVersionId,
  type YvBible,
  type YvLicense,
} from "./youversion";
import { parseChapterContent } from "./youversion-parse";

const catalog: YvBible[] = [
  { id: 3365, abbreviation: "PDT", title: "Palabla de Dios para ti", copyright: "© PDT" },
  { id: 147, abbreviation: "RVES", title: "Reina-Valera Antigua", copyright: '"Dominio público"' },
  { id: 2664, abbreviation: "NVI-S", title: "Nueva Versión Internacional 2015", copyright: "© Biblica" },
  { id: 128, abbreviation: "NVI-S", title: "Nueva Versión Internacional 2025", copyright: "© Biblica" },
  { id: 89, abbreviation: "LBLA", title: "La Biblia de las Américas" },
  { id: 103, abbreviation: "NBLA", title: "Nueva Biblia de las Américas" },
  { id: 9999, abbreviation: "ZZZ", title: "Otra" },
];
const licenses: YvLicense[] = [
  { id: 2, name: "Biblica Fast-track", bible_ids: [128, 2664] },
  { id: 3, name: "Lockman Fast-track", bible_ids: [89, 103] },
];

describe("youversion ids", () => {
  it("round-trips ids and rejects local ones", () => {
    expect(yvVersionId(147)).toBe("yv-147");
    expect(parseYvVersionId("yv-147")).toBe(147);
    expect(parseYvVersionId("rv1909")).toBeNull();
    expect(parseYvVersionId("yv-abc")).toBeNull();
    expect(isOnlineVersionId("yv-3")).toBe(true);
    expect(isOnlineVersionId(null)).toBe(false);
  });
});

describe("buildOnlineVersions", () => {
  const versions = buildOnlineVersions(catalog, new Set([147, 3365, 9999]), licenses);

  it("orders by popularity in Colombia, unknown ones last", () => {
    expect(versions.map((v) => v.id)).toEqual(["yv-128", "yv-2664", "yv-103", "yv-89", "yv-147", "yv-3365", "yv-9999"]);
  });

  it("tells the two NVI-S editions apart by year", () => {
    expect(versions[0].abbr).toBe("NVI 2025");
    expect(versions[1].abbr).toBe("NVI 2015");
  });

  it("locks versions the key is not licensed for, naming the license", () => {
    const nbla = versions.find((v) => v.id === "yv-103")!;
    expect(nbla.locked).toBe(true);
    expect(nbla.lockedReason).toContain("Lockman Fast-track");
    expect(nbla.lockedReason).toContain("portal");
    const rves = versions.find((v) => v.id === "yv-147")!;
    expect(rves.locked).toBeUndefined();
    expect(rves.lockedReason).toBeUndefined();
    expect(rves.online).toBe(true);
  });

  it("shows PDT instead of the API abbreviation spaPdDpt", () => {
    expect(versions.find((v) => v.id === "yv-3365")!.abbr).toBe("PDT");
  });

  it("puts multi-line publisher notices on one line", () => {
    const [nvi] = buildOnlineVersions([{ id: 2664, abbreviation: "NVI-S", title: "NVI 2015", copyright: "Línea uno\n© 2019 Biblica\nTodos los derechos" }], new Set([2664]), []);
    expect(nvi.copyright).toBe("Línea uno · © 2019 Biblica · Todos los derechos");
  });

  it("unquotes the API copyright", () => {
    expect(versions.find((v) => v.id === "yv-147")!.copyright).toBe("Dominio público");
  });
});

describe("mergeChapter", () => {
  it("adds chapters, replaces repeats and keeps the search index in sync", () => {
    const bible = emptyOnlineBible(buildOnlineVersions(catalog, new Set([147]), licenses).find((v) => v.id === "yv-147")!);
    expect(hasChapter(bible, "JHN", 3)).toBe(false);
    mergeChapter(bible, "JHN", 3, { "1": "Había un hombre", "2": "Este vino" });
    mergeChapter(bible, "JHN", 4, { "1": "Cuando el Señor" });
    expect(hasChapter(bible, "JHN", 3)).toBe(true);
    expect(bible.searchIndex).toHaveLength(3);
    mergeChapter(bible, "JHN", 3, { "1": "Nuevo texto" });
    expect(bible.searchIndex.filter((e) => e.chapter === 3)).toHaveLength(1);
    expect(bible.verses.JHN["3"]["1"]).toBe("Nuevo texto");
    expect(bible.verses.JHN["4"]["1"]).toBe("Cuando el Señor");
  });
});

describe("parseChapterContent", () => {
  const html =
    '<div class="yv-h">Nicodemo</div><div class="p"><span class="yv-v" v="1"></span><span class="yv-vlbl">1</span>Había un hombre de los fariseos, ' +
    '<span class="yv-n f"><span class="fr">3.1 </span>nota</span>que se llamaba Nicodemo.</div>' +
    '<div class="q"><span class="yv-v" v="2"></span><span class="yv-vlbl">2</span>Este vino a Jesús&nbsp;de noche &amp; dijo:</div>' +
    '<div class="p"><span class="yv-v" v="3-4"></span><span class="yv-vlbl">3</span>Respondió Jesús.</div>';

  it("splits verses, dropping headings, labels and footnotes", () => {
    expect(parseChapterContent(html)).toEqual({
      1: "Había un hombre de los fariseos, que se llamaba Nicodemo.",
      2: "Este vino a Jesús de noche & dijo:",
      3: "Respondió Jesús.",
    });
  });

  it("returns nothing when there are no verse markers", () => {
    expect(parseChapterContent("<p>sin marcas</p>")).toEqual({});
    expect(parseChapterContent("")).toEqual({});
  });

  it("parses the real shape returned by the API for RVES JHN.3 (public domain excerpt)", () => {
    const real =
      '<div><div class="p"><span class="yv-v" v="1"></span><span class="yv-vlbl">1</span>Y HABIA un hombre de los Fariseos que se llamaba Nicodemo, príncipe de los Judíos. ' +
      '<span class="yv-v" v="2"></span><span class="yv-vlbl">2</span>Este vino á Jesús de noche, y díjole: Rabbí, sabemos que has venido de Dios por maestro. ' +
      '<span class="yv-v" v="16"></span><span class="yv-vlbl">16</span>Porque de tal manera amó Dios al mundo, que ha dado á su Hijo unigénito, para que todo aquel que en él cree, no se pierda, mas tenga vida eterna.</div></div>';
    expect(parseChapterContent(real)).toEqual({
      1: "Y HABIA un hombre de los Fariseos que se llamaba Nicodemo, príncipe de los Judíos.",
      2: "Este vino á Jesús de noche, y díjole: Rabbí, sabemos que has venido de Dios por maestro.",
      16: "Porque de tal manera amó Dios al mundo, que ha dado á su Hijo unigénito, para que todo aquel que en él cree, no se pierda, mas tenga vida eterna.",
    });
  });

  it("keeps words of Jesus and italics (NVI/NBLA/LBLA markup) as plain text", () => {
    const html =
      '<div><div class="p"><span class="yv-v" v="16"></span><span class="yv-vlbl">16</span><span class="wj">»Porque tanto amó Dios al mundo </span>' +
      '<span class="it">que</span> dio a su Hijo único.</div></div>';
    expect(parseChapterContent(html)).toEqual({ 16: "»Porque tanto amó Dios al mundo que dio a su Hijo único." });
  });
});
