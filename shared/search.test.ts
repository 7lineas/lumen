import { describe, it, expect, beforeAll } from "vitest";
import { loadBible, searchVerses, setManifest } from "./bible-service";
import type { BibleData } from "./types";

const miniBible: BibleData = {
  meta: { id: "test", name: "Test", abbr: "TST", language: "es" },
  verses: {
    JHN: {
      "3": {
        "16": "Porque de tal manera amó Dios al mundo",
      },
    },
  },
  searchIndex: [
    {
      key: "JHN:3:16",
      book: "JHN",
      chapter: 3,
      verse: 16,
      text: "Porque de tal manera amó Dios al mundo",
    },
  ],
};

describe("searchVerses", () => {
  beforeAll(() => {
    setManifest([miniBible.meta]);
    loadBible(miniBible);
  });

  it("finds accent-insensitive matches", () => {
    const hits = searchVerses("test", "amo");
    expect(hits.length).toBe(1);
    expect(hits[0].verse).toBe(16);
  });

  it("finds keyword in text", () => {
    const hits = searchVerses("test", "mundo");
    expect(hits.length).toBe(1);
  });
});
