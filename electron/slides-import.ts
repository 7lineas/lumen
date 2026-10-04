import JSZip from "jszip";

/** Decode the XML entities PowerPoint uses inside <a:t> runs. */
export function decodeXmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex: string) => {
      const code = parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    })
    .replace(/&#(\d+);/g, (_m, dec: string) => {
      const code = parseInt(dec, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    })
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/**
 * Extract readable text from one slide's XML.
 * Paragraphs (<a:p>) become lines; runs (<a:t>) inside a paragraph are
 * joined verbatim (PowerPoint splits runs mid-word for formatting).
 */
export function extractSlideText(slideXml: string): string {
  const paragraphs: string[] = [];
  const paraRe = /<a:p[\s>][\s\S]*?<\/a:p>/g;
  let paraMatch: RegExpExecArray | null;
  while ((paraMatch = paraRe.exec(slideXml)) !== null) {
    const paraXml = paraMatch[0].replace(/<a:br\s*\/>/g, "\n");
    const runs: string[] = [];
    const runRe = /<a:t[^>]*>([\s\S]*?)<\/a:t>/g;
    let runMatch: RegExpExecArray | null;
    while ((runMatch = runRe.exec(paraXml)) !== null) {
      runs.push(decodeXmlEntities(runMatch[1] ?? ""));
    }
    const line = runs.join("").replace(/[ \t\u00a0]+/g, " ").trim();
    if (line) paragraphs.push(line);
  }
  // Fallback for shapes that skip <a:p> (rare): grab any stray runs.
  if (paragraphs.length === 0) {
    const runs: string[] = [];
    const runRe = /<a:t[^>]*>([\s\S]*?)<\/a:t>/g;
    let runMatch: RegExpExecArray | null;
    while ((runMatch = runRe.exec(slideXml)) !== null) {
      const text = decodeXmlEntities(runMatch[1] ?? "").trim();
      if (text) runs.push(text);
    }
    if (runs.length > 0) return runs.join("\n");
  }
  return paragraphs.join("\n");
}

function slideNumber(filePath: string): number {
  const match = /slide(\d+)\.xml$/i.exec(filePath);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

/**
 * Presentation order for slides. Parses ppt/presentation.xml (sldId list)
 * joined with ppt/_rels/presentation.xml.rels (rId -> target). Falls back
 * to numeric filename order when the manifests are missing/unparseable.
 */
export function orderSlideFiles(
  presentationXml: string | null,
  relsXml: string | null,
  slideFiles: string[],
): string[] {
  try {
    if (presentationXml && relsXml) {
      const targetById = new Map<string, string>();
      const relRe = /<Relationship[^>]*\bId="([^"]+)"[^>]*\bTarget="([^"]+)"[^>]*\/>/g;
      let relMatch: RegExpExecArray | null;
      while ((relMatch = relRe.exec(relsXml)) !== null) {
        targetById.set(relMatch[1]!, relMatch[2]!);
      }
      const idRe = /<p:sldId[^>]*\br:id="([^"]+)"[^>]*\/>/g;
      const ordered: string[] = [];
      let idMatch: RegExpExecArray | null;
      while ((idMatch = idRe.exec(presentationXml)) !== null) {
        const target = targetById.get(idMatch[1]!);
        if (!target) continue;
        const normalized = target.startsWith("ppt/") ? target : `ppt/${target.replace(/^\.\//, "")}`;
        if (slideFiles.includes(normalized)) ordered.push(normalized);
      }
      if (ordered.length > 0) return ordered;
    }
  } catch {
    // fall through to filename order
  }
  return [...slideFiles].sort((a, b) => slideNumber(a) - slideNumber(b) || (a < b ? -1 : 1));
}

/** Parse a .pptx/.ppsx buffer into one text entry per non-empty slide. */
export async function parsePptxBuffer(data: Buffer, opts: { keepEmpty?: boolean } = {}): Promise<string[]> {
  const zip = await JSZip.loadAsync(data);
  const slideFiles = Object.keys(zip.files).filter(
    (name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name) && !zip.files[name]?.dir,
  );
  if (slideFiles.length === 0) return [];
  const readText = async (name: string): Promise<string | null> => {
    const entry = zip.files[name];
    if (!entry || entry.dir) return null;
    try {
      return await entry.async("text");
    } catch {
      return null;
    }
  };
  const [presentationXml, relsXml] = await Promise.all([
    readText("ppt/presentation.xml"),
    readText("ppt/_rels/presentation.xml.rels"),
  ]);
  const ordered = orderSlideFiles(presentationXml, relsXml, slideFiles);
  const slides: string[] = [];
  for (const file of ordered) {
    const xml = await readText(file);
    if (!xml) continue;
    const text = extractSlideText(xml).trim();
    if (text || opts.keepEmpty) slides.push(text);
  }
  return slides;
}

export function isPptxPath(filePath: string): boolean {
  return /\.(pptx|ppsx)$/i.test(filePath);
}

export function isSlideImagePath(filePath: string): boolean {
  return /\.(png|jpe?g|webp)$/i.test(filePath);
}

/** Natural order so Slide2 precedes Slide10 (PowerPoint exports this way). */
export function naturalCompare(a: string, b: string): number {
  const ax: Array<string | number> = [];
  const bx: Array<string | number> = [];
  a.replace(/(\d+)|(\D+)/g, (_m, num: string, str: string) => {
    ax.push(num ? Number(num) : str);
    return "";
  });
  b.replace(/(\d+)|(\D+)/g, (_m, num: string, str: string) => {
    bx.push(num ? Number(num) : str);
    return "";
  });
  for (let i = 0; i < Math.max(ax.length, bx.length); i++) {
    const x = ax[i];
    const y = bx[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (typeof x === "number" && typeof y === "number") {
      if (x !== y) return x - y;
    } else if (String(x) !== String(y)) {
      return String(x) < String(y) ? -1 : 1;
    }
  }
  return a < b ? -1 : a > b ? 1 : 0;
}

export function sortImagePathsNumerically(paths: string[]): string[] {
  return [...paths].sort((a, b) => naturalCompare(a, b));
}

export interface SanitizedSlideDeck {
  id: string;
  title: string;
  slides: string[];
  images: Array<string | null>;
  source?: { kind: "pptx" | "pdf"; file: string } | null;
  updatedAt: number;
  pinned: boolean;
}

/** Validate/normalize decks from the renderer; images stay parallel to slides. */
export function sanitizeSlideDecks(decks: unknown): SanitizedSlideDeck[] {
  if (!Array.isArray(decks)) return [];
  return decks.flatMap((deck): SanitizedSlideDeck[] => {
    if (!deck || typeof deck !== "object") return [];
    const value = deck as { id?: unknown; title?: unknown; slides?: unknown; images?: unknown; source?: unknown; updatedAt?: unknown; pinned?: unknown };
    if (typeof value.id !== "string" || typeof value.title !== "string" || !Array.isArray(value.slides)) return [];
    const slides = value.slides
      .filter((slide): slide is string => typeof slide === "string" && slide.trim().length > 0)
      .map((slide) => slide.trim());
    if (slides.length === 0) return [];
    const rawImages = Array.isArray(value.images) ? value.images : [];
    const images = slides.map((_, i) => {
      const entry = rawImages[i];
      return typeof entry === "string" && entry.length > 0 ? entry : null;
    });
    let source: SanitizedSlideDeck["source"];
    if (value.source && typeof value.source === "object") {
      const candidate = value.source as { kind?: unknown; file?: unknown };
      if ((candidate.kind === "pdf" || candidate.kind === "pptx") && typeof candidate.file === "string" && candidate.file.length > 0) {
        source = { kind: candidate.kind, file: candidate.file };
      }
    }
    return [{
      id: value.id,
      title: value.title,
      slides,
      images,
      ...(source ? { source } : {}),
      updatedAt: Number.isFinite(value.updatedAt) ? (value.updatedAt as number) : Date.now(),
      pinned: Boolean(value.pinned),
    }];
  });
}
