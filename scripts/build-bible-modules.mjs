#!/usr/bin/env node
/**
 * Builds downloadable Bible modules from eBible VPL sources.
 *
 * Each module is the same JSON the app already loads (metadata, books and
 * verses). SQLite is not used: the projector already reads this JSON offline,
 * and a native database addon would complicate the Windows build.
 *
 * A new free version is data: add its license entry (with vplZip) and rerun
 * this script. The app reads bibles-catalog.json; it does not hardcode ids.
 *
 * Output (not uploaded from here):
 *   data/bible-modules/{id}.json
 *   data/bible-modules/bibles-catalog.json
 */
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs";
import { createInterface } from "node:readline";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const tmpDir = path.join(root, "tmp-bible");
const outDir = path.join(root, "data", "bible-modules");
const BIBLES_DOWNLOAD_BASE = "https://downloads.7lineas.com/bibles";

const PROTESTANT_BOOKS = [
  "GEN", "EXO", "LEV", "NUM", "DEU", "JOS", "JDG", "RUT", "1SA", "2SA", "1KI", "2KI",
  "1CH", "2CH", "EZR", "NEH", "EST", "JOB", "PSA", "PRO", "ECC", "SNG", "ISA", "JER",
  "LAM", "EZK", "DAN", "HOS", "JOL", "AMO", "OBA", "JON", "MIC", "NAM", "HAB", "ZEP",
  "HAG", "ZEC", "MAL", "MAT", "MRK", "LUK", "JHN", "ACT", "ROM", "1CO", "2CO", "GAL",
  "EPH", "PHP", "COL", "1TH", "2TH", "1TI", "2TI", "TIT", "PHM", "HEB", "JAS", "1PE",
  "2PE", "1JN", "2JN", "3JN", "JUD", "REV",
];
const BOOK_SET = new Set(PROTESTANT_BOOKS);
const VPL_TO_USFM = {
  JOH: "JHN",
  MAR: "MRK",
  PHI: "PHP",
  JAM: "JAS",
  JOE: "JOL",
  EZE: "EZK",
  SOL: "SNG",
  NAH: "NAM",
  "1JO": "1JN",
  "2JO": "2JN",
  "3JO": "3JN",
};

function normalizeBookCode(code) {
  return VPL_TO_USFM[code] ?? code;
}

function loadSources() {
  const licenses = JSON.parse(fs.readFileSync(path.join(root, "shared", "bible-licenses.json"), "utf8"));
  const sources = licenses.versions.filter((version) => version.vplZip);
  if (sources.length === 0) throw new Error("Ninguna ficha de licencia tiene vplZip");
  return { licenses, sources };
}

function ensureZip(src) {
  fs.mkdirSync(tmpDir, { recursive: true });
  const zipPath = path.join(tmpDir, src.vplZip);
  if (!fs.existsSync(zipPath)) {
    const url = src.sourceUrl || `https://ebible.org/Scriptures/${src.vplZip}`;
    console.log(`Downloading ${url}`);
    execSync(`curl -fsSL -o "${zipPath}" "${url}"`, { stdio: "inherit" });
  }
  return zipPath;
}

async function parseVplFile(txtPath) {
  const verses = {};
  const searchIndex = [];
  const rl = createInterface({ input: createReadStream(txtPath), crlfDelay: Infinity });
  for await (const line of rl) {
    const match = line.match(/^([A-Z0-9]{3})\s+(\d+):(\d+)\s+(.+)$/);
    if (!match) continue;
    const [, rawBook, chapter, verse, text] = match;
    const book = normalizeBookCode(rawBook);
    if (!BOOK_SET.has(book)) continue;
    if (!verses[book]) verses[book] = {};
    if (!verses[book][chapter]) verses[book][chapter] = {};
    const clean = text.trim();
    verses[book][chapter][verse] = clean;
    searchIndex.push({
      key: `${book}:${chapter}:${verse}`,
      book,
      chapter: Number(chapter),
      verse: Number(verse),
      text: clean,
    });
  }
  return { verses, searchIndex };
}

function verseCount(verses) {
  let count = 0;
  for (const book of Object.keys(verses)) {
    for (const chapter of Object.keys(verses[book])) {
      count += Object.keys(verses[book][chapter]).length;
    }
  }
  return count;
}

function assertModule(src, verses) {
  const missing = PROTESTANT_BOOKS.filter((book) => !verses[book]);
  if (missing.length) {
    throw new Error(`[${src.id}] Faltan libros: ${missing.join(", ")}`);
  }
  const count = verseCount(verses);
  console.log(`[${src.id}] 66 libros, ${count} versículos`);
  if (count < src.minVerses) {
    throw new Error(`[${src.id}] Muy pocos versículos: ${count} < ${src.minVerses}`);
  }
  const spot = src.spot;
  const sample = verses[spot.book]?.[spot.chapter]?.[spot.verse] ?? "";
  if (!sample.toLowerCase().includes(String(spot.includes).toLowerCase())) {
    throw new Error(`[${src.id}] La muestra ${spot.book} ${spot.chapter}:${spot.verse} no contiene «${spot.includes}». Texto: ${sample}`);
  }
  return count;
}

async function main() {
  const { licenses, sources } = loadSources();
  fs.mkdirSync(outDir, { recursive: true });
  const versions = [];
  const genesis = new Map();

  for (const src of sources) {
    const zipPath = ensureZip(src);
    const extractDir = path.join(tmpDir, `module-${src.id}`);
    fs.mkdirSync(extractDir, { recursive: true });
    execSync(`unzip -o -q "${zipPath}" "${src.vplTxt}" -d "${extractDir}"`, { stdio: "inherit" });
    const { verses, searchIndex } = await parseVplFile(path.join(extractDir, src.vplTxt));
    assertModule(src, verses);
    genesis.set(src.id, verses.GEN?.["1"]?.["2"] ?? "");

    const module = {
      meta: {
        id: src.id,
        name: src.name,
        abbr: src.abbr,
        language: src.languageCode,
        languageLabel: src.language,
        license: src.license,
        attribution: src.attribution,
        copyright: src.copyright,
        draft: src.draft === true,
      },
      verses,
      searchIndex,
    };
    const outPath = path.join(outDir, `${src.id}.json`);
    fs.writeFileSync(outPath, JSON.stringify(module));
    const bytes = fs.statSync(outPath).size;
    const sha256 = createHash("sha256").update(fs.readFileSync(outPath)).digest("hex");
    console.log(`Wrote ${outPath} (${(bytes / 1024 / 1024).toFixed(2)} MiB) ${sha256}`);
    versions.push({
      id: src.id,
      name: src.name,
      language: src.language,
      file: `${src.id}.json`,
      bytes,
      sha256,
      license: src.license,
      attribution: src.attribution,
      copyright: src.copyright,
      abbr: src.abbr,
      draft: src.draft === true,
    });
  }

  if (genesis.get("bll") && genesis.get("bll") === genesis.get("blm")) {
    throw new Error("BLL y BLM salieron idénticas en Génesis 1:2; revise las fuentes");
  }

  const catalog = {
    format: "proyector-bible-json-v1",
    baseUrl: BIBLES_DOWNLOAD_BASE,
    extensionNote: licenses.extensionNote,
    versions,
  };
  const catalogPath = path.join(outDir, "bibles-catalog.json");
  fs.writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
  console.log(`Wrote ${catalogPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
