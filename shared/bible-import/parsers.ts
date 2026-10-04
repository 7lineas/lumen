import { BOOKS } from "../books";
import { resolveBook, resolveBookName } from "./book-aliases";
import { walkXml } from "./xml";

export type ImportFormat = "json" | "zefania" | "osis" | "usfm" | "csv";
export type VerseMap = Record<string, Record<string, Record<string, string>>>;

export interface ImportMetaHint {
  name?: string;
  abbr?: string;
  language?: string;
  copyright?: string;
}

export interface ParsedBible {
  format: ImportFormat;
  verses: VerseMap;
  hint: ImportMetaHint;
  warnings: string[];
}

export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportError";
  }
}

const MAX_VERSE_CHARS = 6000;
const MAX_CHAPTER = 150;
const MAX_VERSE = 200;
const MAX_WARNING_DETAILS = 5;

/** Collects verses with validation, de-duplication and aggregated warnings. */
class Collector {
  readonly verses: VerseMap = {};
  private readonly unknownBooks = new Map<string, number>();
  private invalid = 0;
  private duplicates = 0;
  private empty = 0;

  add(bookToken: string | null | undefined, chapter: number, verse: number, text: string, resolved?: string | null): void {
    const code = resolved !== undefined ? resolved : resolveBook(bookToken);
    if (!code) {
      const key = (bookToken ?? "?").trim() || "?";
      this.unknownBooks.set(key, (this.unknownBooks.get(key) ?? 0) + 1);
      return;
    }
    if (!Number.isInteger(chapter) || !Number.isInteger(verse) || chapter < 1 || verse < 1 || chapter > MAX_CHAPTER || verse > MAX_VERSE) {
      this.invalid += 1;
      return;
    }
    const clean = text.replace(/\s+/g, " ").trim();
    if (!clean) {
      this.empty += 1;
      return;
    }
    const chapters = (this.verses[code] ??= {});
    const verseMap = (chapters[String(chapter)] ??= {});
    if (verseMap[String(verse)] !== undefined) this.duplicates += 1;
    verseMap[String(verse)] = clean.length > MAX_VERSE_CHARS ? clean.slice(0, MAX_VERSE_CHARS) : clean;
  }

  warnings(): string[] {
    const out: string[] = [];
    if (this.unknownBooks.size > 0) {
      const names = [...this.unknownBooks.keys()];
      const shown = names.slice(0, MAX_WARNING_DETAILS).join(", ");
      const more = names.length > MAX_WARNING_DETAILS ? ` y ${names.length - MAX_WARNING_DETAILS} más` : "";
      out.push(`Libros no reconocidos (omitidos): ${shown}${more}. Solo se importan los 66 libros del canon protestante.`);
    }
    if (this.invalid > 0) out.push(`${this.invalid} versículo(s) con capítulo o número fuera de rango se omitieron.`);
    if (this.empty > 0) out.push(`${this.empty} versículo(s) vacío(s) se omitieron.`);
    if (this.duplicates > 0) out.push(`${this.duplicates} versículo(s) repetido(s): se conservó el último.`);
    return out;
  }
}

const LANGUAGE_CODES: Record<string, string> = {
  spa: "es", esp: "es", spanish: "es", español: "es", eng: "en", english: "en", por: "pt", portuguese: "pt",
  fra: "fr", fre: "fr", french: "fr", deu: "de", ger: "de", german: "de", ita: "it", italian: "it", lat: "la", latin: "la",
};

/** ISO 639-1 where we can tell; otherwise the lower-cased start of the value. */
export function normalizeLanguage(raw: string): string {
  const value = raw.trim().toLowerCase();
  return LANGUAGE_CODES[value] ?? value.slice(0, 2);
}

function toInt(value: unknown): number {
  return typeof value === "number" ? value : Number.parseInt(String(value ?? "").trim(), 10);
}

// ---------------------------------------------------------------- JSON

function parseJson(text: string): ParsedBible {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new ImportError(`El archivo JSON no es válido: ${error instanceof Error ? error.message : "error de sintaxis"}`);
  }
  const collector = new Collector();
  const hint: ImportMetaHint = {};
  if (Array.isArray(data)) {
    for (const row of data as Array<Record<string, unknown>>) {
      collector.add(String(row.book ?? row.libro ?? ""), toInt(row.chapter ?? row.capitulo), toInt(row.verse ?? row.versiculo), String(row.text ?? row.texto ?? ""));
    }
  } else if (data && typeof data === "object") {
    const root = data as Record<string, unknown>;
    const meta = (root.meta && typeof root.meta === "object" ? root.meta : root) as Record<string, unknown>;
    for (const key of ["name", "abbr", "language", "copyright"] as const) {
      if (typeof meta[key] === "string" && meta[key]) hint[key] = meta[key] as string;
    }
    const books = root.verses;
    if (!books || typeof books !== "object" || Array.isArray(books)) {
      throw new ImportError('El JSON debe tener un objeto "verses": { "GEN": { "1": { "1": "texto" } } }. Vea docs/IMPORTAR-BIBLIAS.md.');
    }
    for (const [bookKey, chapters] of Object.entries(books as Record<string, unknown>)) {
      if (!chapters || typeof chapters !== "object") continue;
      const code = resolveBook(bookKey);
      for (const [chapterKey, verses] of Object.entries(chapters as Record<string, unknown>)) {
        if (!verses || typeof verses !== "object") continue;
        for (const [verseKey, verseText] of Object.entries(verses as Record<string, unknown>)) {
          collector.add(bookKey, toInt(chapterKey), toInt(verseKey), typeof verseText === "string" ? verseText : "", code);
        }
      }
    }
  } else {
    throw new ImportError("El JSON debe ser un objeto con \"verses\" o una lista de { book, chapter, verse, text }.");
  }
  return { format: "json", verses: collector.verses, hint, warnings: collector.warnings() };
}

// ---------------------------------------------------------------- Zefania

function parseZefania(xml: string): ParsedBible {
  const collector = new Collector();
  const hint: ImportMetaHint = {};
  let book: string | null = null;
  let bookLabel = "";
  let chapter = 0;
  let verse = 0;
  let buffer: string | null = null;
  let skip = 0;
  let info = false;
  let infoTag: string | null = null;
  let infoText = "";
  const infoValues: Record<string, string> = {};
  const skipTags = new Set(["note", "remark"]);

  walkXml(xml, {
    open(tag, attrs, selfClosing) {
      if (tag === "xmlbible") {
        if (attrs.biblename) hint.name = attrs.biblename;
      } else if (tag === "information") info = true;
      else if (info && !selfClosing) {
        infoTag = tag;
        infoText = "";
      } else if (tag === "biblebook") {
        bookLabel = attrs.bsname || attrs.bname || attrs.bnumber || "?";
        book = resolveBook(attrs.bnumber) ?? resolveBookName(attrs.bsname) ?? resolveBookName(attrs.bname);
        if (!book) collector.add(bookLabel, 1, 1, "x", null);
      } else if (tag === "chapter") chapter = toInt(attrs.cnumber);
      else if (tag === "vers" && !selfClosing) {
        verse = toInt(attrs.vnumber);
        buffer = "";
      } else if (buffer !== null && skipTags.has(tag) && !selfClosing) skip += 1;
      else if (buffer !== null && (tag === "br" || tag === "caption")) buffer += " ";
    },
    close(tag) {
      if (tag === "information") info = false;
      else if (info && tag === infoTag) {
        infoValues[tag] = infoText.trim();
        infoTag = null;
      } else if (tag === "vers" && buffer !== null) {
        if (book) collector.add(bookLabel, chapter, verse, buffer, book);
        buffer = null;
        skip = 0;
      } else if (buffer !== null && skipTags.has(tag) && skip > 0) skip -= 1;
    },
    text(value) {
      if (infoTag) infoText += value;
      else if (buffer !== null && skip === 0) buffer += value;
    },
  });

  if (infoValues.title) hint.name = infoValues.title;
  if (infoValues.identifier && infoValues.identifier.length <= 12) hint.abbr = infoValues.identifier;
  if (infoValues.language) hint.language = normalizeLanguage(infoValues.language);
  if (infoValues.rights) hint.copyright = infoValues.rights;
  return { format: "zefania", verses: collector.verses, hint, warnings: collector.warnings() };
}

// ---------------------------------------------------------------- OSIS

function parseOsis(xml: string): ParsedBible {
  const collector = new Collector();
  const hint: ImportMetaHint = {};
  let current: { book: string; chapter: number; verse: number; label: string } | null = null;
  let buffer = "";
  let skip = 0;
  let header = false;
  let headerTag: string | null = null;
  let headerText = "";
  const headerValues: Record<string, string> = {};
  const skipTags = new Set(["note", "title", "rdg", "index", "catchword", "reference-note"]);
  const flush = () => {
    if (current) collector.add(current.label, current.chapter, current.verse, buffer, current.book);
    current = null;
    buffer = "";
  };
  const start = (osisId: string) => {
    flush();
    const first = osisId.trim().split(/\s+/)[0] ?? "";
    const [bookPart, chapterPart, versePart] = first.split(".");
    const code = resolveBookName(bookPart);
    const verse = toInt(versePart?.replace(/[a-z]+$/i, ""));
    if (!code) {
      collector.add(bookPart || "?", 1, 1, "x", null);
      return;
    }
    current = { book: code, chapter: toInt(chapterPart), verse, label: bookPart };
  };

  walkXml(xml, {
    open(tag, attrs, selfClosing) {
      if (tag === "osistext" && attrs.osisidwork) hint.abbr = attrs.osisidwork.length <= 12 ? attrs.osisidwork : undefined;
      if (tag === "header") header = true;
      else if (header && !selfClosing) {
        headerTag = tag;
        headerText = "";
      } else if (tag === "verse") {
        if (attrs.eid) flush();
        else if (attrs.sid || (attrs.osisid && !selfClosing)) start(attrs.sid ?? attrs.osisid);
      } else if (current && !selfClosing && skipTags.has(tag)) skip += 1;
      else if (current && (tag === "lb" || tag === "l" || tag === "p")) buffer += " ";
    },
    close(tag) {
      if (tag === "header") header = false;
      else if (header && tag === headerTag) {
        // Several <title>/<rights>: keep the first one.
        headerValues[tag] ??= headerText.trim();
        headerTag = null;
      } else if (tag === "verse") {
        // Milestone verses end at eID; wrapped verses end here.
        if (current && skip === 0) flush();
      } else if (current && skipTags.has(tag) && skip > 0) skip -= 1;
    },
    text(value) {
      if (headerTag) headerText += value;
      else if (current && skip === 0) buffer += value;
    },
  });
  flush();

  if (headerValues.title) hint.name = headerValues.title;
  if (headerValues.rights) hint.copyright = headerValues.rights;
  if (headerValues.language) hint.language = normalizeLanguage(headerValues.language);
  return { format: "osis", verses: collector.verses, hint, warnings: collector.warnings() };
}

// ---------------------------------------------------------------- USFM

const USFM_SKIP_MARKERS = new Set([
  "h", "toc1", "toc2", "toc3", "mt", "mt1", "mt2", "mt3", "ms", "ms1", "ms2", "mr", "s", "s1", "s2", "s3", "sr", "r", "d", "sp",
  "cl", "cp", "ca", "cd", "rem", "ide", "usfm", "sts", "is", "is1", "ip", "imt", "imt1", "im", "ib", "iot", "io", "io1", "io2", "ie", "id",
  "b", "periph", "restore", "lit",
]);

function parseUsfm(text: string): ParsedBible {
  const collector = new Collector();
  const hint: ImportMetaHint = {};
  // Footnotes, cross references and figures are not verse text.
  const cleaned = text
    .replace(/\\(f|fe|ef|x|ex)\s[\s\S]*?\\\1\*/g, "")
    .replace(/\\fig\s[\s\S]*?\\fig\*/g, "")
    .replace(/\\\+?w\s+([^|\\]*)(?:\|[^\\]*)?\\\+?w\*/g, "$1");
  let book: string | null = null;
  let bookLabel = "";
  let chapter = 0;
  let verse = 0;
  let buffer = "";
  let open = false;
  const flush = () => {
    if (open && book) collector.add(bookLabel, chapter, verse, buffer, book);
    open = false;
    buffer = "";
  };
  const inline = (value: string) => value.replace(/\\\+?[a-z]+\d*\*?/gi, "").replace(/~/g, " ");

  for (const raw of cleaned.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = /^\\([a-z]+\d*)\*?(?:\s+(.*))?$/i.exec(line);
    if (!m) {
      if (open) buffer += ` ${inline(line)}`;
      continue;
    }
    const marker = m[1].toLowerCase();
    const rest = m[2] ?? "";
    if (marker === "id") {
      flush();
      bookLabel = rest.trim().split(/\s+/)[0] ?? "";
      book = resolveBookName(bookLabel);
      if (!book && bookLabel) collector.add(bookLabel, 1, 1, "x", null);
      chapter = 0;
    } else if (marker === "c") {
      flush();
      chapter = toInt(rest);
    } else if (marker === "v") {
      flush();
      const vm = /^(\d+)[a-z]?(?:[-–,]\d+[a-z]?)?\s*(.*)$/i.exec(rest);
      if (vm) {
        verse = toInt(vm[1]);
        open = true;
        buffer = inline(vm[2]);
      }
    } else if (USFM_SKIP_MARKERS.has(marker)) {
      continue;
    } else if (open) {
      buffer += ` ${inline(rest)}`;
    }
  }
  flush();
  return { format: "usfm", verses: collector.verses, hint, warnings: collector.warnings() };
}

// ---------------------------------------------------------------- CSV / TSV

function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell);
      cell = "";
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  return rows;
}

const HEADER_ALIASES: Record<string, string[]> = {
  book: ["book", "libro", "bookcode", "codigo"],
  chapter: ["chapter", "capitulo", "cap", "ch"],
  verse: ["verse", "versiculo", "vers", "ver", "v"],
  text: ["text", "texto", "content", "contenido", "scripture"],
  ref: ["ref", "reference", "referencia", "cita"],
};

function headerRole(cell: string): string | null {
  const key = cell.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z]/g, "");
  for (const [role, names] of Object.entries(HEADER_ALIASES)) if (names.includes(key)) return role;
  return null;
}

function parseCsv(text: string, fileName: string): ParsedBible {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const count = (ch: string) => firstLine.split(ch).length - 1;
  let delimiter = ",";
  if (/\.tsv$/i.test(fileName) || count("\t") > count(",")) delimiter = "\t";
  else if (count(";") > count(",")) delimiter = ";";
  const rows = parseDelimited(text, delimiter);
  if (rows.length === 0) throw new ImportError("El archivo CSV/TSV está vacío.");

  // Optional header row: book,chapter,verse,text (or Spanish names), or ref,text.
  const roles = rows[0].map(headerRole);
  const hasHeader = roles.includes("text");
  const columns = { book: 0, chapter: 1, verse: 2, text: 3, ref: -1 };
  if (hasHeader) {
    for (const key of Object.keys(columns) as Array<keyof typeof columns>) columns[key] = roles.indexOf(key);
  } else if (rows[0].length === 2) {
    Object.assign(columns, { book: -1, chapter: -1, verse: -1, text: 1, ref: 0 });
  } else if (rows[0].length < 4) {
    throw new ImportError("El CSV/TSV necesita 4 columnas: libro, capítulo, versículo, texto (o 2: referencia, texto).");
  }
  if (columns.text < 0 || (columns.ref < 0 && (columns.book < 0 || columns.chapter < 0 || columns.verse < 0))) {
    throw new ImportError("No se encontraron las columnas libro, capítulo, versículo y texto en la fila de encabezado.");
  }

  const collector = new Collector();
  for (const row of hasHeader ? rows.slice(1) : rows) {
    if (columns.ref >= 0) {
      const m = /^(.+?)\s+(\d+)\s*[:.]\s*(\d+)/.exec((row[columns.ref] ?? "").trim());
      if (m) collector.add(m[1], Number(m[2]), Number(m[3]), row[columns.text] ?? "");
      else collector.add(row[columns.ref] ?? "?", 0, 0, "x", null);
    } else {
      collector.add(row[columns.book], toInt(row[columns.chapter]), toInt(row[columns.verse]), row[columns.text] ?? "");
    }
  }
  return { format: "csv", verses: collector.verses, hint: {}, warnings: collector.warnings() };
}

// ---------------------------------------------------------------- entry points

export function detectFormat(fileName: string, text: string): ImportFormat {
  const head = text.slice(0, 4000);
  const lower = fileName.toLowerCase();
  if (/\.(json)$/.test(lower) || /^\s*[[{]/.test(head)) return "json";
  if (/\.(usfm|sfm|ptx)$/.test(lower) || /^\s*\\(id|usfm)\s/m.test(head)) return "usfm";
  if (/<xmlbible[\s>]/i.test(head) || /<biblebook[\s>]/i.test(text.slice(0, 20000))) return "zefania";
  if (/<osistext[\s>]/i.test(head) || /<osis[\s>]/i.test(head)) return "osis";
  if (/\.(csv|tsv|txt)$/.test(lower)) return "csv";
  if (/<\?xml|<[a-z]/i.test(head)) {
    throw new ImportError("XML no reconocido: solo se admiten Zefania (XMLBIBLE) y OSIS (osisText). USX no está soportado; use USFM.");
  }
  throw new ImportError("Formato no reconocido. Use JSON de Lumen, Zefania XML, OSIS XML, USFM, CSV o TSV.");
}

export function parseBibleText(fileName: string, rawText: string): ParsedBible {
  const text = rawText.replace(/^\uFEFF/, "");
  if (!text.trim()) throw new ImportError("El archivo está vacío.");
  const format = detectFormat(fileName, text);
  const parsed =
    format === "json" ? parseJson(text)
    : format === "zefania" ? parseZefania(text)
    : format === "osis" ? parseOsis(text)
    : format === "usfm" ? parseUsfm(text)
    : parseCsv(text, fileName);
  if (countVerses(parsed.verses) === 0) {
    const detail = parsed.warnings.length > 0 ? ` ${parsed.warnings[0]}` : "";
    throw new ImportError(`No se encontró ningún versículo en el archivo (${formatLabel(format)}).${detail}`);
  }
  return parsed;
}

export function formatLabel(format: ImportFormat): string {
  return { json: "JSON de Lumen", zefania: "Zefania XML", osis: "OSIS XML", usfm: "USFM", csv: "CSV/TSV" }[format];
}

/** Merges several parsed files (e.g. one USFM file per book). */
export function mergeParsed(list: ParsedBible[]): ParsedBible {
  if (list.length === 1) return list[0];
  const verses: VerseMap = {};
  for (const parsed of list) {
    for (const [book, chapters] of Object.entries(parsed.verses)) {
      for (const [chapter, map] of Object.entries(chapters)) {
        verses[book] ??= {};
        verses[book][chapter] = { ...(verses[book][chapter] ?? {}), ...map };
      }
    }
  }
  return {
    format: list[0].format,
    verses,
    hint: list.find((item) => item.hint.name)?.hint ?? list[0].hint,
    warnings: [...new Set(list.flatMap((item) => item.warnings))],
  };
}

export function countVerses(verses: VerseMap): number {
  let n = 0;
  for (const chapters of Object.values(verses)) for (const map of Object.values(chapters)) n += Object.keys(map).length;
  return n;
}

export interface ImportSummary {
  format: ImportFormat;
  formatLabel: string;
  bookCount: number;
  chapterCount: number;
  verseCount: number;
  books: Array<{ code: string; name: string; chapters: number; verses: number }>;
  hasOldTestament: boolean;
  hasNewTestament: boolean;
  warnings: string[];
}

export function summarize(parsed: ParsedBible): ImportSummary {
  const books = BOOKS.filter((book) => parsed.verses[book.code]).map((book) => {
    const chapters = Object.values(parsed.verses[book.code]);
    return {
      code: book.code,
      name: book.name,
      chapters: chapters.length,
      verses: chapters.reduce((sum, map) => sum + Object.keys(map).length, 0),
    };
  });
  const warnings = [...parsed.warnings];
  const hasOldTestament = BOOKS.some((book) => book.testament === "OT" && parsed.verses[book.code]);
  const hasNewTestament = BOOKS.some((book) => book.testament === "NT" && parsed.verses[book.code]);
  if (books.length < 66) {
    const missing = hasOldTestament && hasNewTestament ? "Faltan algunos libros" : hasNewTestament ? "Solo trae el Nuevo Testamento" : hasOldTestament ? "Solo trae el Antiguo Testamento" : "Es una Biblia parcial";
    warnings.push(`${missing}: ${books.length} de 66 libros. Los capítulos que falten aparecerán vacíos.`);
  }
  return {
    format: parsed.format,
    formatLabel: formatLabel(parsed.format),
    bookCount: books.length,
    chapterCount: books.reduce((sum, book) => sum + book.chapters, 0),
    verseCount: books.reduce((sum, book) => sum + book.verses, 0),
    books,
    hasOldTestament,
    hasNewTestament,
    warnings,
  };
}
