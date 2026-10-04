import { BOOKS } from "../books";
import type { BibleData, BibleVersionMeta } from "../types";
import { countVerses, type ParsedBible } from "./parsers";

/** Fields the user must confirm before a file becomes a Bible version. */
export interface ImportMetaInput {
  name: string;
  abbr: string;
  language: string;
  /** Required: the user states who holds the rights to the text. */
  copyright: string;
}

export type ImportMetaErrors = Partial<Record<keyof ImportMetaInput, string>>;

export const CUSTOM_ID_PREFIX = "custom-";

export function isCustomVersionId(id: string | null | undefined): boolean {
  return !!id && id.startsWith(CUSTOM_ID_PREFIX);
}

export function slugifyAbbr(abbr: string): string {
  return abbr
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
}

/** `custom-<abbr>`; adds -2, -3… until it is free. */
export function customIdFor(abbr: string, taken: ReadonlySet<string>): string {
  const base = `${CUSTOM_ID_PREFIX}${slugifyAbbr(abbr) || "biblia"}`;
  if (!taken.has(base)) return base;
  for (let n = 2; n < 1000; n += 1) {
    if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
  }
  return `${base}-${Date.now()}`;
}

export function cleanMetaInput(input: ImportMetaInput): ImportMetaInput {
  return {
    name: input.name.trim().replace(/\s+/g, " "),
    abbr: input.abbr.trim().replace(/\s+/g, " "),
    language: input.language.trim().toLowerCase(),
    copyright: input.copyright.trim().replace(/\s+/g, " "),
  };
}

/** Clear Spanish errors per field; empty object when the data can be saved. */
export function validateImportMeta(
  raw: ImportMetaInput,
  existing: ReadonlyArray<Pick<BibleVersionMeta, "id" | "name" | "abbr">>,
): ImportMetaErrors {
  const input = cleanMetaInput(raw);
  const errors: ImportMetaErrors = {};
  if (input.name.length < 2) errors.name = "Escriba el nombre de la Biblia (mínimo 2 letras).";
  else if (input.name.length > 80) errors.name = "El nombre es muy largo (máximo 80 caracteres).";
  if (input.abbr.length < 2) errors.abbr = "Escriba una abreviatura de 2 a 12 caracteres, por ejemplo MIVER.";
  else if (input.abbr.length > 12) errors.abbr = "La abreviatura es muy larga (máximo 12 caracteres).";
  else if (!slugifyAbbr(input.abbr)) errors.abbr = "La abreviatura debe tener letras o números.";
  else if (existing.some((version) => version.abbr.toLowerCase() === input.abbr.toLowerCase())) {
    errors.abbr = "Ya existe una versión con esa abreviatura. Elija otra.";
  }
  if (!/^[a-z]{2,3}(-[a-z0-9]{2,8})?$/.test(input.language)) {
    errors.language = "Use el código de idioma, por ejemplo es, en o pt.";
  }
  if (input.copyright.length < 3) {
    errors.copyright = "El copyright es obligatorio: indique quién tiene los derechos o la licencia (por ejemplo «Dominio público» o «© Editorial, uso con permiso»).";
  } else if (input.copyright.length > 400) {
    errors.copyright = "El copyright es muy largo (máximo 400 caracteres).";
  }
  return errors;
}

export function buildImportedBible(
  parsed: ParsedBible,
  raw: ImportMetaInput,
  existing: ReadonlyArray<Pick<BibleVersionMeta, "id" | "name" | "abbr">>,
  now: number = Date.now(),
): BibleData {
  const errors = validateImportMeta(raw, existing);
  const first = Object.values(errors)[0];
  if (first) throw new Error(first);
  const input = cleanMetaInput(raw);
  const id = customIdFor(input.abbr, new Set(existing.map((version) => version.id)));

  const searchIndex: BibleData["searchIndex"] = [];
  const verses: BibleData["verses"] = {};
  let books = 0;
  for (const book of BOOKS) {
    const chapters = parsed.verses[book.code];
    if (!chapters) continue;
    books += 1;
    verses[book.code] = {};
    const chapterKeys = Object.keys(chapters).map(Number).sort((a, b) => a - b);
    for (const chapter of chapterKeys) {
      const source = chapters[String(chapter)];
      verses[book.code][String(chapter)] = {};
      for (const verse of Object.keys(source).map(Number).sort((a, b) => a - b)) {
        const text = source[String(verse)];
        verses[book.code][String(chapter)][String(verse)] = text;
        searchIndex.push({ key: `${book.code}:${chapter}:${verse}`, book: book.code, chapter, verse, text });
      }
    }
  }

  const meta: BibleVersionMeta = {
    id,
    name: input.name,
    abbr: input.abbr,
    language: input.language,
    license: "Importada por el usuario",
    copyright: input.copyright,
    custom: true,
    stats: { books, verses: countVerses(verses) },
    importedAt: now,
  };
  return { meta, verses, searchIndex };
}
