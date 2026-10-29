import { describe, expect, it } from "vitest";
import { parseSong, shortLabel, songParts } from "./song-sections";

const LABELLED = `Verso 1
Sublime gracia del Señor

Coro
Grande es tu fidelidad

Verso 2
Tu amor es eterno

Coro`;

describe("parseSong", () => {
  it("keeps unlabelled blocks as parts in written order (old songs keep working)", () => {
    const parsed = parseSong("Primera estrofa\nlinea dos\n\nSegunda estrofa");
    expect(parsed.sections.map((s) => s.text)).toEqual([
      "Primera estrofa\nlinea dos",
      "Segunda estrofa",
    ]);
    expect(parsed.sections.every((s) => s.label === "")).toBe(true);
    expect(parsed.order).toEqual(parsed.sections.map((s) => s.key));
  });

  it("reads Spanish labels on the first line and removes them from the text", () => {
    const parsed = parseSong(LABELLED);
    expect(parsed.sections.map((s) => s.label)).toEqual([
      "Verso 1",
      "Coro",
      "Verso 2",
    ]);
    expect(parsed.sections[0].text).toBe("Sublime gracia del Señor");
  });

  it("reads bracket labels too", () => {
    const parsed = parseSong("[Verse 1]\nAmazing grace\n\n[Chorus]\nHow sweet");
    expect(parsed.sections.map((s) => s.label)).toEqual(["Verse 1", "Chorus"]);
  });

  it("repeats a part when its label is written again without text", () => {
    const parsed = parseSong(LABELLED);
    expect(parsed.order).toEqual(["verso-1", "coro", "verso-2", "coro"]);
    expect(parsed.sections).toHaveLength(3);
  });

  it("ignores a bare label that has no earlier part to repeat", () => {
    const parsed = parseSong("Coro\n\nVerso 1\nalgo");
    expect(parsed.order).toEqual(["verso-1"]);
  });

  it("gives a second part with the same label its own key", () => {
    const parsed = parseSong("Coro\nprimero\n\nCoro\nsegundo");
    expect(parsed.sections.map((s) => s.key)).toEqual(["coro", "coro-2"]);
    expect(parsed.order).toEqual(["coro", "coro-2"]);
  });

  it("treats a lyric line that merely contains a label word as text", () => {
    const parsed = parseSong("Coro de ángeles cantando\nsegunda línea");
    expect(parsed.sections[0].label).toBe("");
    expect(parsed.sections[0].text).toBe(
      "Coro de ángeles cantando\nsegunda línea",
    );
  });

  it("returns nothing for empty lyrics", () => {
    expect(parseSong("   \n\n  ")).toEqual({ sections: [], order: [] });
  });
});

describe("songParts", () => {
  it("projects the parts in the written order, repeats included", () => {
    const parts = songParts(LABELLED);
    expect(parts.map((p) => p.label)).toEqual([
      "Verso 1",
      "Coro",
      "Verso 2",
      "Coro",
    ]);
  });

  it("projects nothing for empty lyrics", () => {
    expect(songParts("  \n\n ")).toEqual([]);
  });
});

describe("shortLabel", () => {
  it("abbreviates the usual part names", () => {
    expect(shortLabel("Verso 1")).toBe("V1");
    expect(shortLabel("Coro")).toBe("C");
    expect(shortLabel("Puente")).toBe("P");
    expect(shortLabel("Pre-coro")).toBe("PC");
    expect(shortLabel("Refrán 2")).toBe("R2");
  });

  it("falls back to the first letter and is empty for unlabelled parts", () => {
    expect(shortLabel("Cierre")).toBe("C");
    expect(shortLabel("")).toBe("");
  });
});
