import { describe, it, expect } from "vitest";
import { parseReference, normalizeSearchText, formatRange } from "./reference";

describe("parseReference", () => {
  it("parses Juan 3:16", () => {
    const r = parseReference("Juan 3:16");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.range.start.book).toBe("JHN");
      expect(r.range.start.chapter).toBe(3);
      expect(r.range.start.verse).toBe(16);
    }
  });

  it("parses jn 3:16", () => {
    const r = parseReference("jn 3:16");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.range.start.book).toBe("JHN");
    }
  });

  it("parses Juan 3 16", () => {
    const r = parseReference("Juan 3 16");
    expect(r.ok).toBe(true);
  });

  it("parses 1 cor 13:4-7", () => {
    const r = parseReference("1 cor 13:4-7");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.range.start.book).toBe("1CO");
      expect(r.range.end.verse).toBe(7);
    }
  });

  it("parses salmo 23", () => {
    const r = parseReference("salmo 23");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.range.start.book).toBe("PSA");
      expect(r.range.start.chapter).toBe(23);
    }
  });

  it("parses Gén 1", () => {
    const r = parseReference("Gén 1");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.range.start.book).toBe("GEN");
      expect(r.range.start.chapter).toBe(1);
    }
  });
});

describe("normalizeSearchText", () => {
  it("removes accents", () => {
    expect(normalizeSearchText("Dios amó")).toBe("dios amo");
  });
});

describe("formatRange", () => {
  it("formats verse range", () => {
    const s = formatRange({
      start: { book: "JHN", chapter: 3, verse: 16 },
      end: { book: "JHN", chapter: 3, verse: 16 },
    });
    expect(s).toContain("Juan");
    expect(s).toContain("3:16");
  });
});
