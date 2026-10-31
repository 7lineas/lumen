import pptxgen from "pptxgenjs";
import { describe, expect, it } from "vitest";
import {
  collectFontFiles,
  installLazySystemFonts,
  patchOpentypeShaping,
  readFamilyNames,
} from "./pptx-fonts";

async function deckBytes(): Promise<Uint8Array> {
  const deck = new pptxgen();
  deck.layout = "LAYOUT_16x9";
  const faces = [
    "Calibri",
    "Arial",
    "Georgia",
    "Times New Roman",
    "Segoe UI",
    "No Such Font",
  ];
  faces.forEach((fontFace, i) => {
    const slide = deck.addSlide();
    slide.addText(`Sublime gracia ${i}: fi fl â€” SeÃ±or`, {
      x: 0.5,
      y: 1,
      w: 9,
      h: 1.5,
      fontSize: 40,
      fontFace,
      bold: i % 2 === 0,
    });
  });
  return new Uint8Array(
    (await deck.write({ outputType: "nodebuffer" })) as Buffer,
  );
}

describe("patchOpentypeShaping", () => {
  it("falls back to plain glyph mapping when shaping throws", () => {
    class Font {
      stringToGlyphs(_text: string): unknown[] {
        throw new Error("lookupType: 7 - substFormat: 1 is not yet supported");
      }
      charToGlyph(char: string) {
        return { char };
      }
    }
    const opentype = { Font, parse: () => new Font() } as never;
    patchOpentypeShaping(opentype);
    patchOpentypeShaping(opentype); // idempotent
    expect(new Font().stringToGlyphs("fi")).toEqual([
      { char: "f" },
      { char: "i" },
    ]);
  });
});

describe("readFamilyNames", () => {
  it("reads family names from installed fonts without parsing them", () => {
    const files = collectFontFiles();
    if (files.length === 0) return; // no system fonts on this machine
    const named = files.filter((file) => readFamilyNames(file).length > 0);
    expect(named.length).toBeGreaterThan(files.length * 0.9);
  });
});

describe("installLazySystemFonts", () => {
  it("renders exactly what pptx-glimpse's full system font scan renders", async () => {
    const glimpse = await import("pptx-glimpse");
    patchOpentypeShaping();
    const bytes = await deckBytes();
    const options = { width: 960, textOutput: "path" as const };

    glimpse.clearFontCache();
    const full = await glimpse.convertPptxToSvg(bytes, options);

    glimpse.clearFontCache();
    const lazy = await installLazySystemFonts(glimpse);
    const fast = await glimpse.convertPptxToSvg(bytes, options);
    glimpse.clearFontCache();

    expect(fast.slides.map((slide) => slide.svg)).toEqual(
      full.slides.map((slide) => slide.svg),
    );
    if (lazy) expect(lazy.parsedCount()).toBeLessThan(lazy.fileCount);
  }, 120_000);
});
