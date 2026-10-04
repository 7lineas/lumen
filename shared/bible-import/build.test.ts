import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildImportedBible, customIdFor, isCustomVersionId, slugifyAbbr, validateImportMeta } from "./build";
import { parseBibleText } from "./parsers";

const parsed = parseBibleText("sample.json", fs.readFileSync(path.join(__dirname, "fixtures", "sample.json"), "utf8"));
const valid = { name: "Mi Biblia", abbr: "MIB", language: "es", copyright: "Dominio público" };

describe("validateImportMeta", () => {
  it("accepts complete data", () => {
    expect(validateImportMeta(valid, [])).toEqual({});
  });

  it("requires the user's copyright and explains it", () => {
    const errors = validateImportMeta({ ...valid, copyright: "  " }, []);
    expect(errors.copyright).toMatch(/obligatorio/);
  });

  it("validates name, abbreviation and language with clear messages", () => {
    const errors = validateImportMeta({ name: "x", abbr: "A", language: "español", copyright: "ok ok" }, []);
    expect(errors.name).toMatch(/nombre/i);
    expect(errors.abbr).toMatch(/abreviatura/i);
    expect(errors.language).toMatch(/idioma/i);
    expect(validateImportMeta({ ...valid, abbr: "ABCDEFGHIJKLM" }, []).abbr).toMatch(/larga/);
    expect(validateImportMeta({ ...valid, abbr: "!!!" }, []).abbr).toMatch(/letras o números/);
  });

  it("rejects an abbreviation that another version already uses (any case)", () => {
    const errors = validateImportMeta({ ...valid, abbr: "rv1909" }, [{ id: "rv1909", name: "Reina-Valera 1909", abbr: "RV1909" }]);
    expect(errors.abbr).toMatch(/Ya existe/);
  });
});

describe("custom ids", () => {
  it("slugifies and avoids collisions", () => {
    expect(slugifyAbbr("Mi Bíblia!")).toBe("mi-biblia");
    expect(customIdFor("MIB", new Set())).toBe("custom-mib");
    expect(customIdFor("MIB", new Set(["custom-mib"]))).toBe("custom-mib-2");
    expect(customIdFor("MIB", new Set(["custom-mib", "custom-mib-2"]))).toBe("custom-mib-3");
    expect(isCustomVersionId("custom-mib")).toBe(true);
    expect(isCustomVersionId("rv1909")).toBe(false);
  });
});

describe("buildImportedBible", () => {
  it("builds BibleData in canonical order with meta, stats and a search index", () => {
    const bible = buildImportedBible(parsed, valid, [], 1_700_000_000_000);
    expect(bible.meta).toMatchObject({
      id: "custom-mib",
      name: "Mi Biblia",
      abbr: "MIB",
      language: "es",
      copyright: "Dominio público",
      custom: true,
      stats: { books: 2, verses: 4 },
      importedAt: 1_700_000_000_000,
    });
    expect(Object.keys(bible.verses)).toEqual(["GEN", "JHN"]);
    expect(bible.verses.JHN["3"]["16"]).toMatch(/^Porque de tal manera/);
    expect(bible.searchIndex.map((e) => e.key)).toEqual(["GEN:1:1", "GEN:1:2", "JHN:3:16", "JHN:3:17"]);
    expect(bible.searchIndex[0]).toMatchObject({ book: "GEN", chapter: 1, verse: 1 });
  });

  it("throws the field error instead of building invalid data", () => {
    expect(() => buildImportedBible(parsed, { ...valid, copyright: "" }, [])).toThrow(/copyright/i);
  });

  it("picks a free id when the slug is taken by a downloaded module", () => {
    const bible = buildImportedBible(parsed, { ...valid, abbr: "Kjv X" }, [{ id: "custom-kjv-x", name: "otra", abbr: "OTRA" }]);
    expect(bible.meta.id).toBe("custom-kjv-x-2");
  });
});
