import { describe, it, expect } from "vitest";
import { FONT_FAMILIES, FONT_FAMILY_OPTIONS, fontStack } from "./fonts";

describe("fonts", () => {
  it("has one option for every id, in the same order", () => {
    expect(FONT_FAMILY_OPTIONS.map((option) => option.id)).toEqual([...FONT_FAMILIES]);
  });

  it("returns the stack of the saved id", () => {
    expect(fontStack("georgia")).toBe(FONT_FAMILY_OPTIONS.find((option) => option.id === "georgia")?.stack);
  });

  it("falls back to the system font for unknown or missing ids", () => {
    const system = FONT_FAMILY_OPTIONS[0].stack;
    expect(fontStack(undefined)).toBe(system);
    expect(fontStack("comic-sans")).toBe(system);
  });

  it("ends every stack with a generic family", () => {
    const generic = ["sans-serif", "serif", "system-ui"];
    for (const option of FONT_FAMILY_OPTIONS) {
      expect(generic.some((family) => option.stack.includes(family)), option.id).toBe(true);
    }
  });
});
