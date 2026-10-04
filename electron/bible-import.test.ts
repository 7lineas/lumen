import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ImportSession, decodeBibleBytes, parseBibleFiles } from "./bible-import";
import { listSelectableVersions, removeModule, resolveModulePath } from "./bible-library";

const fixtures = path.join(__dirname, "..", "shared", "bible-import", "fixtures");
const valid = { name: "Mi Biblia", abbr: "MIB", language: "es", copyright: "Dominio público" };

let root: string;
let bibleDir: string;
let userDir: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lumen-import-"));
  bibleDir = path.join(root, "bibles");
  userDir = path.join(root, "user");
  fs.mkdirSync(bibleDir);
  fs.writeFileSync(
    path.join(bibleDir, "manifest.json"),
    JSON.stringify([{ id: "rv1909", name: "Reina-Valera 1909", abbr: "RV1909", language: "es" }]),
  );
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe("ImportSession", () => {
  it("previews counts, then saves a Bible that shows up as a custom version, loads and can be removed", () => {
    const session = new ImportSession();
    const preview = session.preview([path.join(fixtures, "sample.zefania.xml")]);
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.preview.summary).toMatchObject({ formatLabel: "Zefania XML", bookCount: 2, verseCount: 4 });
    expect(preview.preview.hint.abbr).toBe("MZEF");

    const existing = listSelectableVersions(bibleDir, userDir);
    const saved = session.commit(preview.preview.previewId, valid, userDir, existing);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.version.id).toBe("custom-mib");

    const versions = listSelectableVersions(bibleDir, userDir);
    expect(versions.map((v) => v.id)).toEqual(["rv1909", "custom-mib"]);
    expect(versions[1]).toMatchObject({ custom: true, copyright: "Dominio público", stats: { books: 2, verses: 4 } });

    const file = resolveModulePath(bibleDir, userDir, "custom-mib");
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    expect(data.verses.JHN["3"]["16"]).toMatch(/Porque de tal manera/);
    expect(data.searchIndex).toHaveLength(4);
    expect(fs.readdirSync(userDir).filter((name) => name.startsWith("."))).toEqual([]);

    removeModule(userDir, new Set(["rv1909"]), "custom-mib");
    expect(listSelectableVersions(bibleDir, userDir).map((v) => v.id)).toEqual(["rv1909"]);
  });

  it("does not save when the user's fields are invalid, and keeps the preview to retry", () => {
    const session = new ImportSession();
    const preview = session.preview([path.join(fixtures, "sample.json")]);
    if (!preview.ok) throw new Error("preview failed");
    const bad = session.commit(preview.preview.previewId, { ...valid, copyright: "" }, userDir, []);
    expect(bad).toMatchObject({ ok: false });
    expect(!bad.ok && bad.errors.copyright).toMatch(/obligatorio/);
    expect(fs.existsSync(userDir)).toBe(false);
    expect(session.commit(preview.preview.previewId, valid, userDir, []).ok).toBe(true);
  });

  it("refuses an unknown or expired preview", () => {
    const result = new ImportSession().commit("nope", valid, userDir, []);
    expect(result).toMatchObject({ ok: false });
    expect(!result.ok && result.error).toMatch(/caducó/);
  });

  it("returns a readable error for files it cannot understand", () => {
    const bad = path.join(root, "notes.txt");
    fs.writeFileSync(bad, "esto no es una Biblia");
    const result = new ImportSession().preview([bad]);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/columnas|versículo/);
  });
});

describe("parseBibleFiles", () => {
  it("merges one USFM file per book", () => {
    const { parsed, fileNames } = parseBibleFiles([path.join(fixtures, "sample.usfm"), path.join(fixtures, "sample-jhn.usfm")]);
    expect(Object.keys(parsed.verses)).toEqual(["GEN", "JHN"]);
    expect(fileNames).toEqual(["sample.usfm", "sample-jhn.usfm"]);
  });

  it("skips a bad file among several and says so", () => {
    const bad = path.join(root, "bad.json");
    fs.writeFileSync(bad, "{ roto");
    const { parsed } = parseBibleFiles([path.join(fixtures, "sample.json"), bad]);
    expect(parsed.warnings.join(" ")).toMatch(/Se omitió bad\.json/);
  });

  it("rejects files above the size limit before reading them", () => {
    const big = path.join(root, "big.json");
    fs.writeFileSync(big, "");
    fs.truncateSync(big, 81 * 1024 * 1024);
    expect(() => parseBibleFiles([big])).toThrow(/demasiado grande/);
  });
});

describe("decodeBibleBytes", () => {
  it("reads UTF-8 and falls back to Windows-1252", () => {
    expect(decodeBibleBytes(Buffer.from("Jesús amó", "utf8"))).toBe("Jesús amó");
    expect(decodeBibleBytes(Buffer.from([0x4a, 0x65, 0x73, 0xfa, 0x73]))).toBe("Jesús");
  });
});
