/**
 * Fast system-font setup for pptx-glimpse.
 *
 * pptx-glimpse's own system-font loader parses EVERY font in C:\Windows\Fonts
 * with opentype.js before the first slide is drawn (~5 s and hundreds of MB on
 * a normal Windows install), on every import. Here only the `name` table of
 * each file is read up front (a few KB per file), and a font is fully parsed
 * the first time a slide actually asks for its family.
 *
 * Resolution is identical to the full scan: files are visited in the same
 * sorted order, a family is owned by the first file that parses and declares
 * it (directly or through the font mapping, e.g. Carlito -> Calibri), and the
 * fallback font is the first file that parses. The name index is only a
 * superset filter; the real opentype.js names decide.
 *
 * Pure Node (no Electron imports) so it can be unit-tested.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { createRequire } from "module";

type OpentypeFont = {
  names: Record<string, Record<string, string> | undefined>;
  stringToGlyphs: (text: string, options?: unknown) => unknown[];
  charToGlyph: (char: string) => unknown;
};
type Opentype = {
  parse: (buffer: ArrayBuffer) => OpentypeFont;
  Font: { prototype: OpentypeFont };
};
type Glimpse = typeof import("pptx-glimpse");

/** Same key pptx-glimpse builds for "system fonts, no extra dirs, default mapping". */
const SYSTEM_SETUP_KEY = "\n\nfalse";
const SYSTEM_CACHE_GLOBAL = "__pptxGlimpseSystemFontCache__";
const TTC_TAG = 0x74746366;
const NAME_TAG = 0x6e616d65;
const FONT_EXTENSIONS = new Set([".ttf", ".otf"]);
// pptx-glimpse only loads these .ttc collections (CJK UI fonts).
const CJK_TTC_PATTERNS = [
  "NotoSansCJK",
  "NotoSerifCJK",
  "Hiragino",
  "\u30D2\u30E9\u30AE\u30CE",
  "YuGoth",
  "YuMin",
  "meiryo",
  "msgothic",
  "msmincho",
];

const moduleRequire = createRequire(__filename);

/** pptx-glimpse's own dependencies (pnpm keeps them out of our node_modules). */
function glimpseRequire(): NodeRequire {
  return createRequire(moduleRequire.resolve("pptx-glimpse"));
}

export function loadOpentype(): Opentype {
  return glimpseRequire()("opentype.js") as Opentype;
}

const patchedPrototypes = new WeakSet<object>();

/**
 * opentype.js 1.3.4 throws "lookupType: 7 - substFormat: 1 is not yet
 * supported" while applying ligatures for some fonts, Calibri (the Office
 * default) among them, which failed the whole import. Fall back to plain
 * character-to-glyph mapping for that text: the same glyphs without the
 * fi/fl ligature substitution, which PowerPoint doesn't apply by default either.
 */
export function patchOpentypeShaping(
  opentype: Opentype = loadOpentype(),
): void {
  const proto = opentype.Font.prototype;
  if (patchedPrototypes.has(proto)) return;
  patchedPrototypes.add(proto);
  const original = proto.stringToGlyphs;
  proto.stringToGlyphs = function (
    this: OpentypeFont,
    text: string,
    options?: unknown,
  ) {
    try {
      return original.call(this, text, options);
    } catch {
      return Array.from(text, (char) => this.charToGlyph(char));
    }
  };
}

function systemFontDirs(): string[] {
  const platform = os.platform();
  if (platform === "linux")
    return ["/usr/share/fonts", "/usr/local/share/fonts"];
  if (platform === "darwin")
    return [
      "/System/Library/Fonts",
      "/Library/Fonts",
      path.join(os.homedir(), "Library/Fonts"),
    ];
  if (platform === "win32") return ["C:\\Windows\\Fonts"];
  return [];
}

function isCjkTtc(name: string): boolean {
  const lower = name.normalize("NFC").toLowerCase();
  return (
    lower.endsWith(".ttc") &&
    CJK_TTC_PATTERNS.some((pattern) => lower.includes(pattern.toLowerCase()))
  );
}

function walk(dir: string, out: string[]): void {
  if (!fs.existsSync(dir)) return;
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, out);
      else if (
        FONT_EXTENSIONS.has(path.extname(entry.name).toLowerCase()) ||
        isCjkTtc(entry.name)
      )
        out.push(full);
    }
  } catch {
    // unreadable folder: skipped, like pptx-glimpse
  }
}

/**
 * The system fonts in pptx-glimpse's order (collectFontFilePaths), then any
 * extra folders. Extras go last so they only fill families the system lacks
 * and never change which file an existing family or the fallback comes from.
 */
export function collectFontFiles(extraDirs: string[] = []): string[] {
  const sorted = (dirs: string[]) => {
    const files: string[] = [];
    for (const dir of dirs) walk(dir, files);
    return files.sort((a, b) => a.localeCompare(b));
  };
  const system = sorted(systemFontDirs());
  const seen = new Set(system.map((file) => file.toLowerCase()));
  const extra = sorted(extraDirs).filter(
    (file) => !seen.has(file.toLowerCase()),
  );
  return [...system, ...extra];
}

function readAt(fd: number, position: number, length: number): Buffer {
  const buffer = Buffer.alloc(length);
  const read = fs.readSync(fd, buffer, 0, length, position);
  return read === length ? buffer : buffer.subarray(0, read);
}

function decodeUtf16be(bytes: Buffer): string {
  let text = "";
  for (let i = 0; i + 1 < bytes.length; i += 2)
    text += String.fromCharCode((bytes[i]! << 8) | bytes[i + 1]!);
  return text;
}

/**
 * Family names (name IDs 1 and 16, every platform/language) from the name
 * table, without parsing the rest of the font. A superset of what
 * opentype.js reports; candidates are confirmed after a real parse.
 */
export function readFamilyNames(file: string): string[] {
  const names = new Set<string>();
  let fd: number | null = null;
  try {
    fd = fs.openSync(file, "r");
    let header = readAt(fd, 0, 12);
    if (header.length < 12) return [];
    let fontOffset = 0;
    if (header.readUInt32BE(0) === TTC_TAG) {
      fontOffset = readAt(fd, 12, 4).readUInt32BE(0);
      header = readAt(fd, fontOffset, 12);
      if (header.length < 12) return [];
    }
    const numTables = header.readUInt16BE(4);
    const records = readAt(fd, fontOffset + 12, numTables * 16);
    let nameOffset = -1;
    let nameLength = 0;
    for (let i = 0; i + 16 <= records.length; i += 16) {
      if (records.readUInt32BE(i) === NAME_TAG) {
        nameOffset = records.readUInt32BE(i + 8);
        nameLength = records.readUInt32BE(i + 12);
        break;
      }
    }
    if (nameOffset < 0 || nameLength < 6) return [];
    const table = readAt(fd, nameOffset, nameLength);
    const count = table.readUInt16BE(2);
    const stringBase = table.readUInt16BE(4);
    for (let i = 0; i < count; i++) {
      const record = 6 + i * 12;
      if (record + 12 > table.length) break;
      const platformId = table.readUInt16BE(record);
      const nameId = table.readUInt16BE(record + 6);
      if (nameId !== 1 && nameId !== 16) continue;
      const length = table.readUInt16BE(record + 8);
      const start = stringBase + table.readUInt16BE(record + 10);
      const bytes = table.subarray(start, start + length);
      if (platformId === 0 || platformId === 3) names.add(decodeUtf16be(bytes));
      else if (platformId === 1) names.add(bytes.toString("latin1"));
    }
  } catch {
    // unreadable or malformed: it simply never becomes a candidate
  } finally {
    if (fd !== null) fs.closeSync(fd);
  }
  return [...names];
}

function alignTo4(n: number): number {
  return (n + 3) & ~3;
}

/** First font of a .ttc as a standalone sfnt (what pptx-glimpse parses). */
function extractFirstTtcFont(data: Uint8Array): ArrayBuffer | null {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (view.byteLength < 12 || view.getUint32(0) !== TTC_TAG) return null;
  const numFonts = view.getUint32(8);
  if (numFonts === 0 || view.byteLength < 12 + numFonts * 4) return null;
  for (let index = 0; index < numFonts; index++) {
    try {
      const fontOffset = view.getUint32(12 + index * 4);
      if (fontOffset + 12 > view.byteLength) continue;
      const sfVersion = view.getUint32(fontOffset);
      const numTables = view.getUint16(fontOffset + 4);
      if (numTables === 0) continue;
      if (fontOffset + 12 + numTables * 16 > view.byteLength) continue;
      const tables: {
        tag: number;
        sum: number;
        offset: number;
        length: number;
      }[] = [];
      let valid = true;
      for (let i = 0; i < numTables; i++) {
        const rec = fontOffset + 12 + i * 16;
        const offset = view.getUint32(rec + 8);
        const length = view.getUint32(rec + 12);
        if (offset > view.byteLength || length > view.byteLength - offset) {
          valid = false;
          break;
        }
        tables.push({
          tag: view.getUint32(rec),
          sum: view.getUint32(rec + 4),
          offset,
          length,
        });
      }
      if (!valid) continue;
      const headerSize = 12 + numTables * 16;
      const total =
        headerSize + tables.reduce((sum, t) => sum + alignTo4(t.length), 0);
      const output = new ArrayBuffer(total);
      const out = new DataView(output);
      const outBytes = new Uint8Array(output);
      let searchRange = 16;
      let entrySelector = 0;
      while (searchRange * 2 <= numTables * 16) {
        searchRange *= 2;
        entrySelector++;
      }
      out.setUint32(0, sfVersion);
      out.setUint16(4, numTables);
      out.setUint16(6, searchRange);
      out.setUint16(8, entrySelector);
      out.setUint16(10, numTables * 16 - searchRange);
      let cursor = headerSize;
      tables.forEach((table, i) => {
        const rec = 12 + i * 16;
        out.setUint32(rec, table.tag);
        out.setUint32(rec + 4, table.sum);
        out.setUint32(rec + 8, cursor);
        out.setUint32(rec + 12, table.length);
        outBytes.set(
          data.subarray(table.offset, table.offset + table.length),
          cursor,
        );
        cursor += alignTo4(table.length);
      });
      return output;
    } catch {
      // try the next entry, as pptx-glimpse does
    }
  }
  return null;
}

function familyNamesOf(font: OpentypeFont): Set<string> {
  const names = new Set<string>();
  for (const key of ["fontFamily", "preferredFamily"]) {
    const translations = font.names[key];
    if (translations)
      for (const value of Object.values(translations)) names.add(value);
  }
  return names;
}

export interface LazySystemFonts {
  /** opentype.js fonts actually parsed so far. */
  parsedCount(): number;
  fileCount: number;
}

/**
 * Pre-fill pptx-glimpse's system font cache with a lazily loaded font set, so
 * convertPptxToSvg never runs its full font scan. Call once per process
 * before converting.
 */
export async function installLazySystemFonts(
  glimpse: Glimpse,
  extraDirs: string[] = [],
): Promise<LazySystemFonts | null> {
  const opentype = loadOpentype();
  patchOpentypeShaping(opentype);
  const files = collectFontFiles(extraDirs);
  const mapping = glimpse.createFontMapping();
  const parsed = new Map<string, OpentypeFont | null>();
  const parse = (file: string): OpentypeFont | null => {
    if (parsed.has(file)) return parsed.get(file)!;
    let font: OpentypeFont | null = null;
    try {
      const data = fs.readFileSync(file);
      const bytes = new Uint8Array(
        data.buffer,
        data.byteOffset,
        data.byteLength,
      );
      if (
        bytes.length >= 4 &&
        new DataView(bytes.buffer, bytes.byteOffset).getUint32(0) === TTC_TAG
      ) {
        const first = extractFirstTtcFont(bytes);
        if (first) font = opentype.parse(first);
      } else {
        font = opentype.parse(
          bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength,
          ) as ArrayBuffer,
        );
      }
    } catch {
      font = null;
    }
    parsed.set(file, font);
    return font;
  };

  // name -> indexes of the files that may declare it, in scan order.
  const candidates = new Map<string, number[]>();
  files.forEach((file, index) => {
    for (const name of readFamilyNames(file)) {
      const list = candidates.get(name);
      if (list) list.push(index);
      else candidates.set(name, [index]);
    }
  });

  const resolve = (name: string): OpentypeFont | undefined => {
    const target = mapping[name];
    const indexes = new Set([
      ...(candidates.get(name) ?? []),
      ...(target !== undefined ? (candidates.get(target) ?? []) : []),
    ]);
    for (const index of [...indexes].sort((a, b) => a - b)) {
      const font = parse(files[index]!);
      if (!font) continue;
      const names = familyNamesOf(font);
      if (names.has(name) || (target !== undefined && names.has(target)))
        return font;
    }
    return undefined;
  };

  let defaultFont: OpentypeFont | null = null;
  for (const file of files) {
    defaultFont = parse(file);
    if (defaultFont) break;
  }
  if (!defaultFont) return null;

  class LazyFontMap extends Map<string, OpentypeFont> {
    private readonly missing = new Set<string>();
    override get(name: string): OpentypeFont | undefined {
      if (super.has(name)) return super.get(name);
      if (this.missing.has(name)) return undefined;
      const font = resolve(name);
      if (font) super.set(name, font);
      else this.missing.add(name);
      return font;
    }
    override has(name: string): boolean {
      return this.get(name) !== undefined;
    }
  }

  // A real setup for its classes; its font tables are then swapped for the lazy one.
  const seed = fs.readFileSync(files.find((file) => parsed.get(file))!);
  const setup = await glimpse.createOpentypeSetupFromBuffers([
    { data: new Uint8Array(seed) },
  ]);
  if (!setup) return null;
  const fonts = new LazyFontMap();
  const measurer = setup.measurer as unknown as {
    fonts: Map<string, unknown>;
    defaultFont: unknown;
  };
  const resolver = setup.fontResolver as unknown as {
    fonts: Map<string, unknown>;
    defaultFont: unknown;
  };
  measurer.fonts = fonts;
  measurer.defaultFont = defaultFont;
  resolver.fonts = fonts;
  resolver.defaultFont = defaultFont;
  (globalThis as Record<string, unknown>)[SYSTEM_CACHE_GLOBAL] = {
    key: SYSTEM_SETUP_KEY,
    setup,
  };
  return {
    fileCount: files.length,
    parsedCount: () => [...parsed.values()].filter(Boolean).length,
  };
}
