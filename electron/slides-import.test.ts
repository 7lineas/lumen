import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import {
  countPptxSlides,
  isAudioPath,
  isVideoPath,
  naturalCompare,
  sanitizeSlideDecks,
  sortImagePathsNumerically,
} from "./slides-import";

describe("slides-import", () => {
  it("counts the slides of a pptx buffer", async () => {
    const zip = new JSZip();
    zip.file("ppt/slides/slide1.xml", "<p:sld/>");
    zip.file("ppt/slides/slide2.xml", "<p:sld/>");
    zip.file("ppt/slides/_rels/slide1.xml.rels", "<Relationships/>");
    zip.file("ppt/presentation.xml", "<p:presentation/>");
    expect(
      await countPptxSlides(await zip.generateAsync({ type: "nodebuffer" })),
    ).toBe(2);
  });

  it("returns 0 when there are no slides and throws on non-zip data", async () => {
    const zip = new JSZip();
    zip.file("ppt/presentation.xml", "<p:presentation/>");
    expect(
      await countPptxSlides(await zip.generateAsync({ type: "nodebuffer" })),
    ).toBe(0);
    await expect(countPptxSlides(Buffer.from("not a zip"))).rejects.toThrow();
  });

  it("sorts exported slide images naturally", () => {
    expect(naturalCompare("Slide2.png", "Slide10.png")).toBeLessThan(0);
    expect(
      sortImagePathsNumerically([
        "/a/Slide10.png",
        "/a/Slide2.png",
        "/a/Slide1.png",
      ]),
    ).toEqual(["/a/Slide1.png", "/a/Slide2.png", "/a/Slide10.png"]);
  });

  it("keeps image-only decks", () => {
    const [deck] = sanitizeSlideDecks([
      {
        id: "a",
        title: "Culto",
        images: ["/x/1.png", "/x/2.png"],
        updatedAt: 5,
        pinned: true,
      },
    ]);
    expect(deck).toEqual({
      id: "a",
      title: "Culto",
      images: ["/x/1.png", "/x/2.png"],
      updatedAt: 5,
      pinned: true,
    });
  });

  it("migrates legacy decks: drops stored text/source and null images", () => {
    const [deck] = sanitizeSlideDecks([
      {
        id: "legacy",
        title: "Antiguo",
        slides: ["Texto uno", "Texto dos"],
        images: ["/x/1.png", null],
        source: { kind: "pptx", file: "/x/legacy.pptx" },
        updatedAt: 1,
        pinned: false,
      },
    ]);
    expect(deck).toEqual({
      id: "legacy",
      title: "Antiguo",
      images: ["/x/1.png"],
      updatedAt: 1,
      pinned: false,
    });
    expect(deck).not.toHaveProperty("slides");
    expect(deck).not.toHaveProperty("source");
  });

  it("keeps video and audio items with their managed file", () => {
    expect(
      sanitizeSlideDecks([
        {
          id: "v",
          title: "Bienvenida",
          kind: "video",
          file: "/m/v.mp4",
          images: ["/x.png"],
          updatedAt: 2,
          pinned: false,
        },
        {
          id: "a",
          title: "Preludio",
          kind: "audio",
          file: "/m/a.mp3",
          updatedAt: 3,
          pinned: true,
        },
        {
          id: "bad",
          title: "Sin archivo",
          kind: "video",
          updatedAt: 1,
          pinned: false,
        },
      ]),
    ).toEqual([
      {
        id: "v",
        title: "Bienvenida",
        kind: "video",
        images: [],
        file: "/m/v.mp4",
        updatedAt: 2,
        pinned: false,
      },
      {
        id: "a",
        title: "Preludio",
        kind: "audio",
        images: [],
        file: "/m/a.mp3",
        updatedAt: 3,
        pinned: true,
      },
    ]);
  });

  it("tells video and audio files apart", () => {
    expect(isVideoPath("/a/Culto.MP4")).toBe(true);
    expect(isVideoPath("/a/song.mp3")).toBe(false);
    expect(isAudioPath("/a/song.mp3")).toBe(true);
    expect(isAudioPath("/a/foto.png")).toBe(false);
  });

  it("discards legacy text-only decks and malformed input", () => {
    expect(
      sanitizeSlideDecks([
        {
          id: "t",
          title: "Solo texto",
          slides: ["a"],
          images: [null],
          updatedAt: 1,
          pinned: false,
        },
        {
          id: "u",
          title: "Sin imágenes",
          slides: ["a"],
          updatedAt: 1,
          pinned: false,
        },
        null,
        "x",
        { id: 3, title: "bad", images: ["/x.png"] },
      ]),
    ).toEqual([]);
    expect(sanitizeSlideDecks("nope")).toEqual([]);
  });
});
