import { describe, it, expect } from "vitest";
import {
  BUILTIN_FONT_IDS,
  BUILTIN_FONT_OPTIONS,
  DEFAULT_FONT_WEIGHT,
  fontChoices,
  fontStack,
  fontWeightChoices,
  installedFontFaceCss,
  isFontFamilyId,
  isInstalledFontId,
  resolveFontWeight,
  weightLabel,
  type InstalledFont,
} from "./fonts";

const lora: InstalledFont = {
  id: "google-lora",
  family: "Lora",
  category: "Serif",
  faces: [
    { weight: "400", style: "normal", unicodeRange: "U+0000-00FF", file: "/data/fonts/google-lora/0-a.woff2" },
    { weight: "700", style: "normal", unicodeRange: "U+0590-05FF", file: "/data/fonts/google-lora/1-b.woff2" },
  ],
};

describe("built-in fonts", () => {
  it("has one option for every id, in the same order", () => {
    expect(BUILTIN_FONT_OPTIONS.map((option) => option.id)).toEqual([...BUILTIN_FONT_IDS]);
  });

  it("returns the stack of a built-in id", () => {
    expect(fontStack("georgia")).toBe(BUILTIN_FONT_OPTIONS.find((option) => option.id === "georgia")?.stack);
  });

  it("falls back to the system font for unknown or missing ids", () => {
    const system = BUILTIN_FONT_OPTIONS[0].stack;
    expect(fontStack(undefined)).toBe(system);
    expect(fontStack("comic-sans")).toBe(system);
  });

  it("ends every built-in stack with a generic family", () => {
    const generic = ["sans-serif", "serif", "system-ui"];
    for (const option of BUILTIN_FONT_OPTIONS) {
      expect(generic.some((family) => option.stack.includes(family)), option.id).toBe(true);
    }
  });
});

describe("installed fonts", () => {
  it("recognises Google font ids without touching built-in ones", () => {
    expect(isInstalledFontId("google-lora")).toBe(true);
    expect(isInstalledFontId("geist")).toBe(false);
  });

  it("uses the installed font's CSS name, with a fallback", () => {
    expect(fontStack("google-lora")).toBe(`"google-lora", system-ui, -apple-system, sans-serif`);
  });

  it("lists built-in fonts first, then installed ones by name", () => {
    const choices = fontChoices([{ ...lora, id: "google-zeta", family: "Zeta" }, lora]);
    expect(choices.map((choice) => choice.label)).toEqual([
      ...BUILTIN_FONT_OPTIONS.map((option) => option.label),
      "Lora",
      "Zeta",
    ]);
  });

  it("writes one @font-face per face, using the URL it is given", () => {
    const css = installedFontFaceCss([lora], (file) => `lumen-media://local/media/${encodeURIComponent(file)}`);
    const rules = css.split("\n");
    expect(rules).toHaveLength(2);
    expect(rules[0]).toContain('font-family: "google-lora"');
    expect(rules[0]).toContain("font-weight: 400");
    expect(rules[0]).toContain("unicode-range: U+0000-00FF");
    expect(rules[1]).toContain("font-weight: 700");
    expect(rules[0]).toContain(`src: url("lumen-media://local/media/${encodeURIComponent("/data/fonts/google-lora/0-a.woff2")}")`);
  });

  it("skips files that have no URL", () => {
    expect(installedFontFaceCss([lora], () => undefined)).toBe("");
  });
});

describe("typeface of a song or text", () => {
  it("accepts built-in ids and installed google ids only", () => {
    expect(isFontFamilyId("georgia")).toBe(true);
    expect(isFontFamilyId("google-lora")).toBe(true);
    expect(isFontFamilyId("Comic Sans")).toBe(false);
    expect(isFontFamilyId(400)).toBe(false);
    expect(isFontFamilyId(undefined)).toBe(false);
  });

  it("offers the downloaded upright weights of an installed font", () => {
    expect(fontWeightChoices("google-lora", [lora])).toEqual([400, 700]);
  });

  it("falls back to normal when an installed font has no faces", () => {
    expect(fontWeightChoices("google-missing", [])).toEqual([DEFAULT_FONT_WEIGHT]);
  });

  it("offers the variable Geist range and regular/bold for the other built-ins", () => {
    expect(fontWeightChoices("geist", [])).toEqual([300, 400, 500, 600, 700, 800]);
    expect(fontWeightChoices("arial", [])).toEqual([400, 700]);
  });

  it("keeps the weight the font offers, otherwise normal, otherwise the lightest", () => {
    expect(resolveFontWeight(700, [400, 700])).toBe(700);
    expect(resolveFontWeight(500, [400, 700])).toBe(400);
    expect(resolveFontWeight(500, [300, 700])).toBe(300);
  });

  it("labels known weights and shows the number for the rest", () => {
    expect(weightLabel(700)).toBe("Negrita");
    expect(weightLabel(450)).toBe("450");
  });
});
