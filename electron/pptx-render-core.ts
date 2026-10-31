import fs from "fs";
import path from "path";
import { createRequire } from "module";
import type {
  PptxWorkerRequest,
  PptxWorkerResponse,
} from "./pptx-worker-protocol";
import { collectFontFiles, installLazySystemFonts } from "./pptx-fonts";

const CHUNK = 6;
/** pptx-glimpse's cap for the font buffers it hands to resvg. */
const MAX_RESVG_FONT_BYTES = 100 * 1024 * 1024;

type NativeResvg = {
  Resvg: new (
    svg: string,
    options: Record<string, unknown>,
  ) => { render: () => { asPng: () => Buffer } };
};

type ResvgModule = {
  initWasm: (wasm: Uint8Array) => Promise<void>;
  Resvg: new (
    svg: string,
    options: Record<string, unknown>,
  ) => { render: () => { asPng: () => Uint8Array } };
};

let resvgReady: Promise<ResvgModule> | null = null;
let nativeResvg: NativeResvg | null | undefined;

/**
 * resvg as a native (Rust) addon: the same renderer and version as the
 * resvg-wasm build pptx-glimpse uses, byte-identical PNGs, about twice as
 * fast. Missing on platforms without a prebuilt binary; WASM is used there.
 */
function loadNativeResvg(): NativeResvg | null {
  if (nativeResvg !== undefined) return nativeResvg;
  try {
    nativeResvg = createRequire(__filename)("@resvg/resvg-js") as NativeResvg;
  } catch {
    nativeResvg = null;
  }
  return nativeResvg;
}
let fontsReady: Promise<unknown> | null = null;
let resvgFontBuffers: Uint8Array[] | null = null;

/** The resvg-wasm build pptx-glimpse renders with (same version, same pixels). */
function loadResvg(): Promise<ResvgModule> {
  resvgReady ??= (async () => {
    const glimpseRequire = createRequire(
      createRequire(__filename).resolve("pptx-glimpse"),
    );
    const resvg = glimpseRequire("@resvg/resvg-wasm") as ResvgModule;
    await resvg.initWasm(
      fs.readFileSync(
        glimpseRequire.resolve("@resvg/resvg-wasm/index_bg.wasm"),
      ),
    );
    return resvg;
  })();
  return resvgReady;
}

/** What pptx-glimpse would pass to resvg: system .ttf/.otf, smallest first, up to 100 MB. */
function systemFontBuffers(): Uint8Array[] {
  if (resvgFontBuffers) return resvgFontBuffers;
  const sized = collectFontFiles()
    .filter((file) => /\.(ttf|otf)$/i.test(file))
    .flatMap((file) => {
      try {
        return [{ file, size: fs.statSync(file).size }];
      } catch {
        return [];
      }
    })
    .sort((a, b) => a.size - b.size || a.file.localeCompare(b.file));
  const buffers: Uint8Array[] = [];
  let total = 0;
  for (const { file, size } of sized) {
    if (total + size > MAX_RESVG_FONT_BYTES) break;
    try {
      buffers.push(new Uint8Array(fs.readFileSync(file)));
      total += size;
    } catch {
      // unreadable font: skipped
    }
  }
  resvgFontBuffers = buffers;
  return buffers;
}

/**
 * Same pixels as pptx-glimpse's svgToPng. Text is already drawn as paths
 * (textOutput "path"), so resvg only gets the system fonts when an SVG still
 * holds a <text> element: copying ~100 MB of fonts into resvg per slide was a
 * third of the render time and never changed a pixel.
 */
async function svgToPng(svg: string, width: number): Promise<Uint8Array> {
  const fitTo = { mode: "width", value: width };
  const hasText = svg.includes("<text");
  const native = hasText ? null : loadNativeResvg();
  if (native)
    return new native.Resvg(svg, { fitTo, font: { loadSystemFonts: false } })
      .render()
      .asPng();
  const resvg = await loadResvg();
  const options: Record<string, unknown> = { fitTo };
  if (hasText) {
    const fontBuffers = systemFontBuffers();
    if (fontBuffers.length > 0) options.font = { fontBuffers };
  }
  return new resvg.Resvg(svg, options).render().asPng();
}

function slideFileName(prefix: string, slideNumber: number): string {
  return `${prefix}-${String(slideNumber - 1).padStart(3, "0")}.png`;
}

/**
 * Render a .pptx to one PNG per slide using pptx-glimpse's Node entry on
 * purpose: that entry uses the system fonts (Calibri, Arial, ...). The
 * browser entry has no font access and silently renders slides WITHOUT text.
 * Pure Node (no Electron imports) so it can be unit-tested.
 *
 * `firstSlide`/`lastSlide` let several workers split one deck.
 */
export async function renderPptxFile(
  request: PptxWorkerRequest,
  post: (message: PptxWorkerResponse) => void,
): Promise<void> {
  const glimpse = await import("pptx-glimpse");
  fontsReady ??= installLazySystemFonts(glimpse, request.fontDirs ?? []);
  await fontsReady;
  const bytes = new Uint8Array(fs.readFileSync(request.file));
  fs.mkdirSync(request.outDir, { recursive: true });
  const files: string[] = [];
  const warnings = new Set<string>();
  const total = Math.max(1, request.total);
  const first = Math.max(1, request.firstSlide ?? 1);
  const last = Math.min(
    request.maxSlides,
    request.lastSlide ?? request.maxSlides,
  );
  try {
    // Chunked so progress can be reported and memory stays bounded.
    for (let start = first; start <= last; start += CHUNK) {
      const slides = Array.from({ length: CHUNK }, (_, i) => start + i).filter(
        (n) => n <= last,
      );
      const report = await glimpse.convertPptxToSvg(bytes, {
        width: request.width,
        slides,
        textOutput: "path",
      });
      for (const diagnostic of report.diagnostics) {
        if (
          diagnostic.severity === "warning" ||
          diagnostic.severity === "error"
        )
          warnings.add(diagnostic.message);
      }
      if (report.slides.length === 0) break;
      for (const slide of report.slides) {
        const target = path.join(
          request.outDir,
          slideFileName(request.prefix, slide.slideNumber),
        );
        fs.writeFileSync(target, await svgToPng(slide.svg, request.width));
        files.push(target);
        post({ type: "progress", done: Math.min(files.length, total), total });
      }
      if (report.slides.length < slides.length) break;
    }
    if (files.length === 0 && first === 1)
      throw new Error("La presentación no produjo ninguna imagen.");
    post({ type: "done", files, warnings: [...warnings].slice(0, 20) });
  } catch (error) {
    for (const file of files) fs.rmSync(file, { force: true });
    throw error;
  }
}
