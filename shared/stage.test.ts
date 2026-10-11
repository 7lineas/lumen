import { describe, expect, it } from "vitest";
import { payloadContentKey, rangeFromVerseClick } from "./stage";
import type { ProjectorPayload } from "./types";
import { DEFAULT_SETTINGS } from "./types";

describe("rangeFromVerseClick", () => {
  it("stages a single verse", () => {
    const { range, anchor } = rangeFromVerseClick(null, "JHN", 3, 16, false);
    expect(range.start.verse).toBe(16);
    expect(range.end.verse).toBe(16);
    expect(anchor.verse).toBe(16);
  });

  it("extends a range with shift in the same chapter", () => {
    const first = rangeFromVerseClick(null, "JHN", 3, 16, false);
    const second = rangeFromVerseClick(first.anchor, "JHN", 3, 18, true);
    expect(second.range.start.verse).toBe(16);
    expect(second.range.end.verse).toBe(18);
    expect(second.anchor.verse).toBe(16);
  });

  it("ignores shift when the chapter changes", () => {
    const first = rangeFromVerseClick(null, "JHN", 3, 16, false);
    const second = rangeFromVerseClick(first.anchor, "JHN", 4, 1, true);
    expect(second.range.start.chapter).toBe(4);
    expect(second.range.end.verse).toBe(1);
  });
});

describe("payloadContentKey", () => {
  const base: ProjectorPayload = {
    mode: "verse",
    referenceLabel: "Juan 3:16 — RV1909",
    blocks: [{ text: "Porque de tal manera amó Dios al mundo" }],
    churchName: DEFAULT_SETTINGS.churchName,
    fontSize: DEFAULT_SETTINGS.fontSize,
    brightness: 1,
    padding: DEFAULT_SETTINGS.padding,
    theme: "dark",
    backgroundColor: "#000",
  };

  it("ignores style fields so a restyle is not a new take", () => {
    expect(payloadContentKey({ ...base, fontSize: 90, brightness: 0.5 })).toBe(payloadContentKey(base));
  });

  it("changes when the text changes", () => {
    expect(payloadContentKey({ ...base, blocks: [{ text: "otro" }] })).not.toBe(payloadContentKey(base));
  });

  it("treats blank as one key and countdowns by their end time", () => {
    expect(payloadContentKey({ ...base, mode: "blank", blocks: [] })).toBe("blank");
    const counting = { ...base, mode: "countdown" as const, blocks: [], countdown: { caption: "Comenzamos en", endsAt: 5 } };
    expect(payloadContentKey(counting)).not.toBe(payloadContentKey({ ...counting, countdown: { caption: "Comenzamos en", endsAt: 6 } }));
  });
});
