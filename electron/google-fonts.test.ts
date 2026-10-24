import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearGoogleFontCatalogMemo,
  type FontFetch,
  type GoogleFontEntry,
  installGoogleFont,
  installedFontId,
  googleFontsCssUrl,
  loadGoogleFontCatalog,
  parseCatalogMetadata,
  parseFontFaces,
  pickWeights,
  previewGoogleFont,
  removeInstalledFont,
  searchGoogleFonts,
} from "./google-fonts";

const dirs: string[] = [];

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gfonts-"));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

const WOFF2 = Uint8Array.from([0x77, 0x4f, 0x46, 0x32, 1, 2, 3, 4]);

const CSS = `
/* latin */
@font-face {
  font-family: 'Lora';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/lora/v37/aaa.woff2) format('woff2');
  unicode-range: U+0000-00FF, U+0131;
}
/* hebrew */
@font-face {
  font-family: 'Lora';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/lora/v37/bbb.woff2) format('woff2');
  unicode-range: U+0590-05FF;
}
@font-face {
  font-family: 'Lora';
  font-style: italic;
  font-weight: 400;
  src: url(https://fonts.gstatic.com/s/lora/v37/ccc.woff2) format('woff2');
  unicode-range: U+0000-00FF;
}
@font-face {
  font-family: 'Lora';
  font-style: normal;
  font-weight: 400;
  src: url(https://evil.example.com/font.woff2) format('woff2');
}
`;

const LORA: GoogleFontEntry = {
  family: "Lora",
  category: "Serif",
  popularity: 26,
  subsets: ["latin", "hebrew"],
  weights: ["400", "700"],
};

/** Fake Google: serves the CSS for any family and a WOFF2 file per requested URL. */
function fakeGoogle(overrides: { css?: string; bytes?: Uint8Array; status?: number } = {}) {
  const requested: string[] = [];
  const fetchImpl: FontFetch = async (url) => {
    requested.push(url);
    if (url.startsWith("https://fonts.googleapis.com/")) {
      return { ok: true, status: 200, text: async () => overrides.css ?? CSS, arrayBuffer: async () => new ArrayBuffer(0) };
    }
    const body = overrides.bytes ?? WOFF2;
    return {
      ok: (overrides.status ?? 200) < 400,
      status: overrides.status ?? 200,
      text: async () => "",
      arrayBuffer: async () => {
        const copy = new ArrayBuffer(body.byteLength);
        new Uint8Array(copy).set(body);
        return copy;
      },
    };
  };
  return { fetchImpl, requested };
}

describe("pickWeights", () => {
  it("uses 400 and 700 when the family has them", () => {
    expect(pickWeights({ fonts: { "400": {}, "700": {}, "400i": {} } })).toEqual(["400", "700"]);
  });

  it("uses the axis range of a variable font", () => {
    expect(pickWeights({ axes: [{ tag: "wght", min: 100, max: 900 }] })).toEqual(["400", "700"]);
  });

  it("falls back to the first upright weight the family has", () => {
    expect(pickWeights({ fonts: { "300": {}, "300i": {} } })).toEqual(["300"]);
  });
});

describe("parseCatalogMetadata", () => {
  it("keeps named families with their category, popularity and subsets", () => {
    const entries = parseCatalogMetadata({
      familyMetadataList: [
        { family: "Lora", category: "Serif", popularity: 26, subsets: ["latin", "hebrew"], fonts: { "400": {}, "700": {} } },
        { family: "", category: "Serif" },
      ],
    });
    expect(entries).toEqual([
      { family: "Lora", category: "Serif", popularity: 26, subsets: ["latin", "hebrew"], weights: ["400", "700"] },
    ]);
  });

  it("rejects a response without a family list", () => {
    expect(() => parseCatalogMetadata({ other: true })).toThrow();
  });
});

describe("searchGoogleFonts", () => {
  const fonts: GoogleFontEntry[] = [
    { family: "Roboto", category: "Sans Serif", popularity: 2, subsets: ["latin"], weights: ["400"] },
    { family: "Roboto Slab", category: "Serif", popularity: 90, subsets: ["latin"], weights: ["400"] },
    { family: "Noto Serif Hebrew", category: "Serif", popularity: 300, subsets: ["hebrew"], weights: ["400"] },
    { family: "Crimson Pro", category: "Serif", popularity: 40, subsets: ["latin"], weights: ["400"] },
  ];

  it("lists the most popular families when the query is empty", () => {
    expect(searchGoogleFonts(fonts, "").map((font) => font.family)).toEqual([
      "Roboto",
      "Crimson Pro",
      "Roboto Slab",
      "Noto Serif Hebrew",
    ]);
  });

  it("puts names that start with the query first, ignoring case and accents", () => {
    const results = searchGoogleFonts(fonts, "ROBO");
    expect(results.map((font) => font.family)).toEqual(["Roboto", "Roboto Slab"]);
  });

  it("matches inside names and reports Hebrew support", () => {
    expect(searchGoogleFonts(fonts, "hebrew")).toEqual([
      { family: "Noto Serif Hebrew", category: "Serif", hebrew: true },
    ]);
  });

  it("limits the number of results", () => {
    expect(searchGoogleFonts(fonts, "", 2)).toHaveLength(2);
  });
});

describe("googleFontsCssUrl", () => {
  it("encodes spaces as plus and asks for the weights", () => {
    expect(googleFontsCssUrl("Open Sans", ["400", "700"])).toBe(
      "https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;700&display=swap",
    );
  });
});

describe("parseFontFaces", () => {
  it("reads weight, style and unicode range of each face", () => {
    const faces = parseFontFaces(CSS);
    expect(faces).toEqual([
      { weight: "400", style: "normal", unicodeRange: "U+0000-00FF, U+0131", url: "https://fonts.gstatic.com/s/lora/v37/aaa.woff2" },
      { weight: "700", style: "normal", unicodeRange: "U+0590-05FF", url: "https://fonts.gstatic.com/s/lora/v37/bbb.woff2" },
    ]);
  });

  it("skips italic faces and files from other hosts", () => {
    expect(parseFontFaces(CSS).some((face) => face.url.includes("evil.example.com"))).toBe(false);
    expect(parseFontFaces(CSS).some((face) => face.style === "italic")).toBe(false);
  });
});

describe("installGoogleFont", () => {
  it("saves each face under the font's folder and returns the record", async () => {
    const fontsDir = tempDir();
    const { fetchImpl, requested } = fakeGoogle();
    const font = await installGoogleFont({ family: "Lora", catalog: [LORA], fontsDir, fetchImpl });

    expect(font.id).toBe("google-lora");
    expect(font.family).toBe("Lora");
    expect(font.faces.map((face) => face.weight)).toEqual(["400", "700"]);
    for (const face of font.faces) {
      expect(path.dirname(face.file)).toBe(path.join(fontsDir, "google-lora"));
      expect(fs.readFileSync(face.file).subarray(0, 4).toString("latin1")).toBe("wOF2");
    }
    expect(requested[0]).toBe("https://fonts.googleapis.com/css2?family=Lora:wght@400;700&display=swap");
  });

  it("refuses a family that is not in the catalog", async () => {
    const { fetchImpl, requested } = fakeGoogle();
    await expect(installGoogleFont({ family: "Nope", catalog: [LORA], fontsDir: tempDir(), fetchImpl })).rejects.toThrow();
    expect(requested).toHaveLength(0);
  });

  it("leaves no folder behind when a file is not a WOFF2", async () => {
    const fontsDir = tempDir();
    const { fetchImpl } = fakeGoogle({ bytes: Uint8Array.from([0, 1, 2, 3, 4]) });
    await expect(installGoogleFont({ family: "Lora", catalog: [LORA], fontsDir, fetchImpl })).rejects.toThrow("no es una fuente válida");
    expect(fs.existsSync(path.join(fontsDir, "google-lora"))).toBe(false);
  });

  it("fails when Google returns no font faces", async () => {
    const { fetchImpl } = fakeGoogle({ css: "/* empty */" });
    await expect(installGoogleFont({ family: "Lora", catalog: [LORA], fontsDir: tempDir(), fetchImpl })).rejects.toThrow();
  });
});

describe("previewGoogleFont", () => {
  it("returns the remote faces of the first weight without downloading any file", async () => {
    const { fetchImpl, requested } = fakeGoogle();
    const faces = await previewGoogleFont({ family: "Lora", catalog: [LORA], fetchImpl });

    expect(requested).toEqual(["https://fonts.googleapis.com/css2?family=Lora:wght@400&display=swap"]);
    expect(faces.map((face) => face.weight)).toEqual(["400", "700"]);
    expect(faces[0]).toEqual({
      weight: "400",
      style: "normal",
      unicodeRange: "U+0000-00FF, U+0131",
      url: "https://fonts.gstatic.com/s/lora/v37/aaa.woff2",
    });
  });

  it("refuses a family that is not in the catalog", async () => {
    const { fetchImpl, requested } = fakeGoogle();
    await expect(previewGoogleFont({ family: "Nope", catalog: [LORA], fetchImpl })).rejects.toThrow("no está en Google Fonts");
    expect(requested).toEqual([]);
  });
});

describe("removeInstalledFont", () => {
  it("deletes the font's folder and nothing else", async () => {
    const fontsDir = tempDir();
    fs.mkdirSync(path.join(fontsDir, "other"));
    const { fetchImpl } = fakeGoogle();
    const font = await installGoogleFont({ family: "Lora", catalog: [LORA], fontsDir, fetchImpl });
    removeInstalledFont(fontsDir, font);
    expect(fs.existsSync(path.join(fontsDir, "google-lora"))).toBe(false);
    expect(fs.existsSync(path.join(fontsDir, "other"))).toBe(true);
  });

  it("refuses ids that do not look like a Google font", () => {
    expect(() => removeInstalledFont(tempDir(), { id: "../etc", family: "", category: "", faces: [] })).toThrow();
  });
});

describe("loadGoogleFontCatalog", () => {
  const metadata = JSON.stringify({ familyMetadataList: [{ family: "Lora", category: "Serif", popularity: 26, subsets: [], fonts: { "400": {} } }] });

  beforeEach(() => clearGoogleFontCatalogMemo());

  it("downloads once, then answers from the disk cache while it is fresh", async () => {
    const cacheFile = path.join(tempDir(), "catalog.json");
    let calls = 0;
    const fetchImpl: FontFetch = async () => {
      calls++;
      return { ok: true, status: 200, text: async () => metadata, arrayBuffer: async () => new ArrayBuffer(0) };
    };
    const now = 1_000_000_000_000;
    await loadGoogleFontCatalog({ cacheFile, fetchImpl, now });
    expect(calls).toBe(1);
    clearGoogleFontCatalogMemo();
    const fonts = await loadGoogleFontCatalog({ cacheFile, fetchImpl, now: now + 60_000 });
    expect(calls).toBe(1);
    expect(fonts.map((font) => font.family)).toEqual(["Lora"]);
  });

  it("falls back to an old cache when Google cannot be reached", async () => {
    const cacheFile = path.join(tempDir(), "catalog.json");
    const old = 1_000_000_000_000;
    fs.writeFileSync(cacheFile, JSON.stringify({ at: old, fonts: [LORA] }));
    const offline: FontFetch = async () => {
      throw new Error("offline");
    };
    const fonts = await loadGoogleFontCatalog({ cacheFile, fetchImpl: offline, now: old + 30 * 24 * 60 * 60 * 1000 });
    expect(fonts.map((font) => font.family)).toEqual(["Lora"]);
  });

  it("explains the problem when there is no cache and no connection", async () => {
    const offline: FontFetch = async () => {
      throw new Error("offline");
    };
    await expect(loadGoogleFontCatalog({ cacheFile: path.join(tempDir(), "missing.json"), fetchImpl: offline })).rejects.toThrow("conexión");
  });
});

describe("installedFontId", () => {
  it("builds a stable id from the family name", () => {
    expect(installedFontId("Open Sans")).toBe("google-open-sans");
    expect(installedFontId("Húrmiz")).toBe("google-hurmiz");
  });
});
