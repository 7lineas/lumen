#!/usr/bin/env node
/**
 * Converts eBible VPL zips in tmp-bible/ to compact JSON in data/bibles/
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createReadStream } from "fs";
import { createInterface } from "readline";
import { execSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const tmpDir = path.join(root, "tmp-bible");
const outDir = path.join(root, "data", "bibles");

// Only the bundled Spanish edition is part of the desktop build. Additional
// editions can be refreshed explicitly later from the release bucket.
const SOURCES = [
  {
    zip: "spaRV1909_vpl.zip",
    txt: "spaRV1909_vpl.txt",
    id: "rv1909",
    name: "Reina-Valera 1909",
    abbr: "RV1909",
    language: "es",
  },
];

const PROTESTANT_BOOKS = [
  "GEN", "EXO", "LEV", "NUM", "DEU", "JOS", "JDG", "RUT", "1SA", "2SA", "1KI", "2KI",
  "1CH", "2CH", "EZR", "NEH", "EST", "JOB", "PSA", "PRO", "ECC", "SNG", "ISA", "JER",
  "LAM", "EZK", "DAN", "HOS", "JOL", "AMO", "OBA", "JON", "MIC", "NAM", "HAB", "ZEP",
  "HAG", "ZEC", "MAL", "MAT", "MRK", "LUK", "JHN", "ACT", "ROM", "1CO", "2CO", "GAL",
  "EPH", "PHP", "COL", "1TH", "2TH", "1TI", "2TI", "TIT", "PHM", "HEB", "JAS", "1PE",
  "2PE", "1JN", "2JN", "3JN", "JUD", "REV",
];

const BOOK_SET = new Set(PROTESTANT_BOOKS);

/** eBible VPL sometimes uses legacy 3-letter codes */
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

function ensureZips() {
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }
  for (const src of SOURCES) {
    const zipPath = path.join(tmpDir, src.zip);
    if (!fs.existsSync(zipPath)) {
      console.log(`Downloading ${src.zip}...`);
      execSync(
        `curl -fsSL -o "${zipPath}" "https://ebible.org/Scriptures/${src.zip}"`,
        { stdio: "inherit" },
      );
    }
  }
}

async function parseVplFile(txtPath) {
  const verses = {};
  const searchIndex = [];
  const rl = createInterface({ input: createReadStream(txtPath), crlfDelay: Infinity });
  for await (const line of rl) {
    const m = line.match(/^([A-Z0-9]{3})\s+(\d+):(\d+)\s+(.+)$/);
    if (!m) continue;
    const [, rawBook, ch, vs, text] = m;
    const book = normalizeBookCode(rawBook);
    if (!BOOK_SET.has(book)) continue;
    if (!verses[book]) verses[book] = {};
    if (!verses[book][ch]) verses[book][ch] = {};
    verses[book][ch][vs] = text.trim();
    searchIndex.push({
      key: `${book}:${ch}:${vs}`,
      book,
      chapter: parseInt(ch, 10),
      verse: parseInt(vs, 10),
      text: text.trim(),
    });
  }
  return { verses, searchIndex };
}

function validate(id, verses) {
  const missing = [];
  for (const book of PROTESTANT_BOOKS) {
    if (!verses[book]) {
      missing.push(book);
    }
  }
  if (missing.length) {
    console.warn(`[${id}] Missing books: ${missing.join(", ")}`);
  }
  let verseCount = 0;
  for (const book of Object.keys(verses)) {
    for (const ch of Object.keys(verses[book])) {
      verseCount += Object.keys(verses[book][ch]).length;
    }
  }
  console.log(`[${id}] Books present: ${Object.keys(verses).length}, verses: ${verseCount}`);
  if (verseCount < 31000) {
    throw new Error(`[${id}] Verse count suspiciously low: ${verseCount}`);
  }
}

async function main() {
  ensureZips();
  fs.mkdirSync(outDir, { recursive: true });

  const manifest = [];

  for (const src of SOURCES) {
    const zipPath = path.join(tmpDir, src.zip);
    const extractDir = path.join(tmpDir, src.id);
    fs.mkdirSync(extractDir, { recursive: true });
    execSync(`unzip -o -q "${zipPath}" "${src.txt}" -d "${extractDir}"`, { stdio: "inherit" });
    const txtPath = path.join(extractDir, src.txt);
    const { verses, searchIndex } = await parseVplFile(txtPath);
    validate(src.id, verses);

    const out = {
      meta: {
        id: src.id,
        name: src.name,
        abbr: src.abbr,
        language: src.language,
      },
      verses,
      searchIndex,
    };
    const outPath = path.join(outDir, `${src.id}.json`);
    fs.writeFileSync(outPath, JSON.stringify(out));
    const stat = fs.statSync(outPath);
    console.log(`Wrote ${outPath} (${(stat.size / 1024 / 1024).toFixed(2)} MiB)`);
    manifest.push(out.meta);
  }

  fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
