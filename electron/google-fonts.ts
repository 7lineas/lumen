import fs from "fs";
import path from "path";
import {
  GOOGLE_FONT_PREFIX,
  type GoogleFontPreviewFace,
  type GoogleFontSearchResult,
  type InstalledFace,
  type InstalledFont,
} from "../shared/fonts";

/** Public catalog of every family on Google Fonts (no API key needed). */
export const GOOGLE_FONTS_METADATA_URL = "https://fonts.google.com/metadata/fonts";
const GOOGLE_FONTS_CSS_URL = "https://fonts.googleapis.com/css2";
const FONT_FILE_HOST = "https://fonts.gstatic.com/";
const CATALOG_TTL_MS = 7 * 24 * 60 * 60 * 1000;
// Google answers with WOFF2 only for browsers it recognises; other agents get TTF.
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const CATALOG_OFFLINE_MESSAGE = "No se pudo cargar el catálogo de Google Fonts. Revisa la conexión a internet.";

export interface FontFetchResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export type FontFetch = (url: string, init?: { headers?: Record<string, string> }) => Promise<FontFetchResponse>;

export interface GoogleFontEntry {
  family: string;
  category: string;
  popularity: number;
  subsets: string[];
  /** Normal-style weights to download, e.g. ["400", "700"]. */
  weights: string[];
}

interface MetadataFamily {
  family?: string;
  category?: string;
  popularity?: number | null;
  subsets?: string[];
  fonts?: Record<string, unknown>;
  axes?: { tag: string; min: number; max: number }[];
}

interface RemoteFace {
  weight: string;
  style: "normal" | "italic";
  unicodeRange: string;
  url: string;
}

/** Weights to download: 400 and 700 when Google has them, otherwise whatever upright weight exists. */
export function pickWeights(family: MetadataFamily): string[] {
  const fonts = family.fonts ?? {};
  const wght = family.axes?.find((axis) => axis.tag === "wght");
  const available = (weight: number) =>
    wght ? weight >= wght.min && weight <= wght.max : Object.prototype.hasOwnProperty.call(fonts, String(weight));
  const preferred = [400, 700].filter(available).map(String);
  if (preferred.length) return preferred;
  const upright = Object.keys(fonts).find((key) => /^\d+$/.test(key));
  return upright ? [upright] : ["400"];
}

export function parseCatalogMetadata(json: unknown): GoogleFontEntry[] {
  const list = (json as { familyMetadataList?: MetadataFamily[] } | null)?.familyMetadataList;
  if (!Array.isArray(list)) throw new Error("El catálogo de Google Fonts no tiene el formato esperado");
  return list
    .filter((family) => typeof family.family === "string" && family.family.length > 0)
    .map((family) => ({
      family: family.family!,
      category: family.category ?? "",
      popularity: typeof family.popularity === "number" ? family.popularity : Number.MAX_SAFE_INTEGER,
      subsets: family.subsets ?? [],
      weights: pickWeights(family),
    }));
}

function normalizeText(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase();
}

/** Families whose name contains the query; names that start with it come first, then the most popular. */
export function searchGoogleFonts(fonts: GoogleFontEntry[], query: string, limit = 40): GoogleFontSearchResult[] {
  const needle = normalizeText(query);
  const matches = needle ? fonts.filter((font) => normalizeText(font.family).includes(needle)) : fonts;
  const startsWithNeedle = (font: GoogleFontEntry) => (needle && normalizeText(font.family).startsWith(needle) ? 0 : 1);
  return [...matches]
    .sort((a, b) => startsWithNeedle(a) - startsWithNeedle(b) || a.popularity - b.popularity)
    .slice(0, limit)
    .map((font) => ({ family: font.family, category: font.category, hebrew: font.subsets.includes("hebrew") }));
}

/** Lowercase ASCII name used in ids and folder names: "Open Sans" → "open-sans". */
export function fontSlug(family: string): string {
  return family
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function installedFontId(family: string): string {
  const slug = fontSlug(family);
  if (!slug) throw new Error("Nombre de fuente no válido");
  return `${GOOGLE_FONT_PREFIX}${slug}`;
}

export function googleFontsCssUrl(family: string, weights: string[]): string {
  const name = encodeURIComponent(family).replace(/%20/g, "+");
  return `${GOOGLE_FONTS_CSS_URL}?family=${name}:wght@${weights.join(";")}&display=swap`;
}

/** Reads the @font-face blocks of a Google Fonts CSS response. Only files on Google's font host are kept. */
export function parseFontFaces(css: string): RemoteFace[] {
  const faces: RemoteFace[] = [];
  for (const [, body] of css.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
    const property = (name: string) => body.match(new RegExp(`${name}\\s*:\\s*([^;]+);`))?.[1]?.trim();
    const url = body.match(/url\((['"]?)([^'")]+)\1\)/)?.[2];
    const weight = property("font-weight");
    if (!url || !url.startsWith(FONT_FILE_HOST) || !weight) continue;
    const style = property("font-style") === "italic" ? "italic" : "normal";
    if (style !== "normal") continue;
    faces.push({ weight, style, unicodeRange: property("unicode-range") ?? "U+0-10FFFF", url });
  }
  return faces;
}

function isWoff2(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x77 && bytes[1] === 0x4f && bytes[2] === 0x46 && bytes[3] === 0x32;
}

async function fetchOk(fetchImpl: FontFetch, url: string): Promise<FontFetchResponse> {
  const response = await fetchImpl(url, { headers: { "user-agent": BROWSER_USER_AGENT } });
  if (!response.ok) throw new Error(`Google Fonts respondió ${response.status}`);
  return response;
}

let catalogMemo: { at: number; fonts: GoogleFontEntry[] } | null = null;

export function clearGoogleFontCatalogMemo(): void {
  catalogMemo = null;
}

/**
 * The family list is cached on disk for a week, so search keeps working
 * offline after the first load. A stale cache is used when Google can't be reached.
 */
export async function loadGoogleFontCatalog(options: {
  cacheFile: string;
  fetchImpl: FontFetch;
  now?: number;
}): Promise<GoogleFontEntry[]> {
  const now = options.now ?? Date.now();
  if (catalogMemo && now - catalogMemo.at < CATALOG_TTL_MS) return catalogMemo.fonts;

  let cached: { at: number; fonts: GoogleFontEntry[] } | null = null;
  try {
    cached = JSON.parse(fs.readFileSync(options.cacheFile, "utf8")) as { at: number; fonts: GoogleFontEntry[] };
  } catch {
    cached = null;
  }
  if (cached && now - cached.at < CATALOG_TTL_MS) {
    catalogMemo = cached;
    return cached.fonts;
  }

  try {
    const response = await fetchOk(options.fetchImpl, GOOGLE_FONTS_METADATA_URL);
    const fonts = parseCatalogMetadata(JSON.parse(await response.text()));
    const fresh = { at: now, fonts };
    fs.mkdirSync(path.dirname(options.cacheFile), { recursive: true });
    fs.writeFileSync(options.cacheFile, JSON.stringify(fresh));
    catalogMemo = fresh;
    return fonts;
  } catch {
    if (cached) {
      catalogMemo = cached;
      return cached.fonts;
    }
    throw new Error(CATALOG_OFFLINE_MESSAGE);
  }
}

/** Downloads the family's WOFF2 files into `fontsDir/<id>/`. Nothing is left behind if a download fails. */
export async function installGoogleFont(options: {
  family: string;
  catalog: GoogleFontEntry[];
  fontsDir: string;
  fetchImpl: FontFetch;
}): Promise<InstalledFont> {
  const entry = options.catalog.find((font) => font.family === options.family);
  if (!entry) throw new Error("Esa fuente no está en Google Fonts");
  const id = installedFontId(entry.family);
  const dir = path.join(options.fontsDir, id);

  const css = await (await fetchOk(options.fetchImpl, googleFontsCssUrl(entry.family, entry.weights))).text();
  const remote = parseFontFaces(css);
  if (!remote.length) throw new Error("Google Fonts no devolvió archivos para esta fuente");

  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  try {
    const faces: InstalledFace[] = [];
    for (const [index, face] of remote.entries()) {
      const bytes = new Uint8Array(await (await fetchOk(options.fetchImpl, face.url)).arrayBuffer());
      if (!isWoff2(bytes)) throw new Error("El archivo descargado no es una fuente válida");
      const name = `${index}-${path.basename(new URL(face.url).pathname)}`;
      const file = path.join(dir, name);
      fs.writeFileSync(file, bytes);
      faces.push({ weight: face.weight, style: face.style, unicodeRange: face.unicodeRange, file });
    }
    return { id, family: entry.family, category: entry.category, faces };
  } catch (error) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw error;
  }
}

/** Remote faces of the family's first weight, so the picker can draw its name before anything is saved. Nothing is downloaded here. */
export async function previewGoogleFont(options: {
  family: string;
  catalog: GoogleFontEntry[];
  fetchImpl: FontFetch;
}): Promise<GoogleFontPreviewFace[]> {
  const entry = options.catalog.find((font) => font.family === options.family);
  if (!entry) throw new Error("Esa fuente no está en Google Fonts");
  const css = await (await fetchOk(options.fetchImpl, googleFontsCssUrl(entry.family, entry.weights.slice(0, 1)))).text();
  return parseFontFaces(css);
}

export function removeInstalledFont(fontsDir: string, font: InstalledFont): void {
  if (!/^google-[a-z0-9-]+$/.test(font.id)) throw new Error("Fuente no válida");
  fs.rmSync(path.join(fontsDir, font.id), { recursive: true, force: true });
}
