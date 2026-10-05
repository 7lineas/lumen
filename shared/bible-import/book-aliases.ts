import { BOOKS } from "../books";

/** `USFM|OSIS|English names…` for the 66 books, in canonical order. */
const TABLE = [
  "GEN|Gen|Genesis", "EXO|Exod|Exodus", "LEV|Lev|Leviticus", "NUM|Num|Numbers", "DEU|Deut|Deuteronomy",
  "JOS|Josh|Joshua", "JDG|Judg|Judges", "RUT|Ruth", "1SA|1Sam|1 Samuel", "2SA|2Sam|2 Samuel",
  "1KI|1Kgs|1 Kings", "2KI|2Kgs|2 Kings", "1CH|1Chr|1 Chronicles", "2CH|2Chr|2 Chronicles", "EZR|Ezra",
  "NEH|Neh|Nehemiah", "EST|Esth|Esther", "JOB|Job", "PSA|Ps|Psalms|Psalm", "PRO|Prov|Proverbs",
  "ECC|Eccl|Ecclesiastes", "SNG|Song|Song of Solomon|Song of Songs|Canticles", "ISA|Isa|Isaiah",
  "JER|Jer|Jeremiah", "LAM|Lam|Lamentations", "EZK|Ezek|Ezekiel", "DAN|Dan|Daniel", "HOS|Hos|Hosea",
  "JOL|Joel", "AMO|Amos", "OBA|Obad|Obadiah", "JON|Jonah", "MIC|Mic|Micah", "NAM|Nah|Nahum",
  "HAB|Hab|Habakkuk", "ZEP|Zeph|Zephaniah", "HAG|Hag|Haggai", "ZEC|Zech|Zechariah", "MAL|Mal|Malachi",
  "MAT|Matt|Matthew", "MRK|Mark", "LUK|Luke", "JHN|John", "ACT|Acts", "ROM|Rom|Romans",
  "1CO|1Cor|1 Corinthians", "2CO|2Cor|2 Corinthians", "GAL|Gal|Galatians", "EPH|Eph|Ephesians",
  "PHP|Phil|Philippians", "COL|Col|Colossians", "1TH|1Thess|1 Thessalonians", "2TH|2Thess|2 Thessalonians",
  "1TI|1Tim|1 Timothy", "2TI|2Tim|2 Timothy", "TIT|Titus", "PHM|Phlm|Philemon", "HEB|Heb|Hebrews",
  "JAS|Jas|James", "1PE|1Pet|1 Peter", "2PE|2Pet|2 Peter", "1JN|1John|1 John", "2JN|2John|2 John",
  "3JN|3John|3 John", "JUD|Jude", "REV|Rev|Revelation",
];

/** Extra Spanish spellings seen in Spanish modules. */
const SPANISH_EXTRA: Record<string, string[]> = {
  SNG: ["Cantar de los Cantares", "Cantares", "Cantar"],
  ACT: ["Hechos de los Apóstoles", "Hechos"],
  REV: ["Revelación", "Apocalipsis de Juan"],
  PSA: ["Salmo"],
  ECC: ["Eclesiastés", "Qohélet"],
  JOL: ["Joel"],
  OBA: ["Abdías"],
  // Gospels as printed in many Spanish Bibles: "S. Mateo", "S.Juan", "San Lucas"…
  MAT: ["S. Mateo", "San Mateo", "Evangelio según San Mateo", "St. Matthew", "Saint Matthew"],
  MRK: ["S. Marcos", "San Marcos", "Evangelio según San Marcos", "St. Mark", "Saint Mark"],
  LUK: ["S. Lucas", "San Lucas", "Evangelio según San Lucas", "St. Luke", "Saint Luke"],
  JHN: ["S. Juan", "San Juan", "Evangelio según San Juan", "St. John", "Saint John"],
};

export function normalizeBookToken(token: string): string {
  let t = token
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  // "I John" / "II Juan" / "III Jn" -> 1/2/3
  t = t.replace(/^(iii|ii|i)\.?\s+(?=[a-z])/, (_m, roman: string) => String(roman.length));
  return t.replace(/[^a-z0-9]/g, "");
}

const BY_KEY = new Map<string, string>();
function add(key: string, code: string): void {
  const normalized = normalizeBookToken(key);
  if (normalized && !BY_KEY.has(normalized)) BY_KEY.set(normalized, code);
}

for (const row of TABLE) {
  const [code, ...names] = row.split("|");
  add(code, code);
  for (const name of names) add(name, code);
}
for (const book of BOOKS) {
  add(book.code, book.code);
  add(book.name, book.code);
  for (const abbrev of book.abbrev) add(abbrev, book.code);
}
for (const [code, names] of Object.entries(SPANISH_EXTRA)) for (const name of names) add(name, code);

/** Lumen book code for a name, USFM/OSIS code or Spanish/English abbreviation; null if unknown. */
export function resolveBook(token: string | null | undefined): string | null {
  if (!token) return null;
  const trimmed = token.trim();
  if (/^\d{1,2}$/.test(trimmed)) {
    const n = Number(trimmed);
    return n >= 1 && n <= BOOKS.length ? BOOKS[n - 1].code : null;
  }
  return BY_KEY.get(normalizeBookToken(trimmed)) ?? null;
}

/** Same, but only accepts names (not bare numbers like "1" that mean a position). */
export function resolveBookName(token: string | null | undefined): string | null {
  if (!token || /^\d+$/.test(token.trim())) return null;
  return resolveBook(token);
}
