import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import {
  extractSlideText,
  naturalCompare,
  orderSlideFiles,
  parsePptxBuffer,
  sanitizeSlideDecks,
  sortImagePathsNumerically,
} from "./slides-import";

function slideXml(paragraphs: string[][]): string {
  const body = paragraphs
    .map((runs) => `<a:p>${runs.map((t) => `<a:r><a:t>${t}</a:t></a:r>`).join("")}</a:p>`)
    .join("");
  return `<?xml version="1.0"?><p:sld><p:cSld><p:spTree><p:sp><p:txBody><a:bodyPr/>${body}</p:txBody></p:sp></p:spTree></p:cSld></p:sld>`;
}

async function buildPptx(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    "ppt/presentation.xml",
    `<?xml version="1.0"?><p:presentation xmlns:p="x" xmlns:r="y"><p:sldIdLst>` +
      `<p:sldId id="256" r:id="rId3"/><p:sldId id="257" r:id="rId2"/>` +
      `</p:sldIdLst></p:presentation>`,
  );
  zip.file(
    "ppt/_rels/presentation.xml.rels",
    `<?xml version="1.0"?><Relationships>` +
      `<Relationship Id="rId2" Type="slide" Target="slides/slide1.xml"/>` +
      `<Relationship Id="rId3" Type="slide" Target="slides/slide2.xml"/>` +
      `</Relationships>`,
  );
  zip.file("ppt/slides/slide1.xml", slideXml([["Hola &amp; bienvenidos"], ["Juan 3:16"]]));
  zip.file("ppt/slides/slide2.xml", slideXml([["Segunda", " diapositiva"]]));
  return zip.generateAsync({ type: "nodebuffer" });
}

describe("slides-import", () => {
  it("extracts runs joined per paragraph", () => {
    expect(extractSlideText(slideXml([["Hola ", "mundo"], ["Amén"]]))).toBe("Hola mundo\nAmén");
  });

  it("decodes entities", () => {
    expect(extractSlideText(slideXml([["A &amp; B", " &lt;3"]]))).toBe("A & B <3");
  });

  it("orders slides by presentation manifest, not filename", () => {
    const ordered = orderSlideFiles(
      `<p:presentation><p:sldIdLst><p:sldId r:id="rId3"/><p:sldId r:id="rId2"/></p:sldIdLst></p:presentation>`,
      `<Relationships><Relationship Id="rId2" Target="slides/slide1.xml"/><Relationship Id="rId3" Target="slides/slide2.xml"/></Relationships>`,
      ["ppt/slides/slide1.xml", "ppt/slides/slide2.xml"],
    );
    expect(ordered).toEqual(["ppt/slides/slide2.xml", "ppt/slides/slide1.xml"]);
  });

  it("parses a pptx buffer in presentation order", async () => {
    const data = await buildPptx();
    // slide2 is first per the manifest above
    await expect(parsePptxBuffer(data)).resolves.toEqual([
      "Segunda diapositiva",
      "Hola & bienvenidos\nJuan 3:16",
    ]);
  });

  it("returns [] when no slides exist", async () => {
    const zip = new JSZip();
    zip.file("ppt/presentation.xml", "<p:presentation/>");
    const data = await zip.generateAsync({ type: "nodebuffer" });
    await expect(parsePptxBuffer(data)).resolves.toEqual([]);
  });

  it("sorts exported slide images naturally", () => {
    expect(
      sortImagePathsNumerically(["/x/Diapositiva10.PNG", "/x/Diapositiva2.PNG", "/x/Diapositiva1.PNG"]),
    ).toEqual(["/x/Diapositiva1.PNG", "/x/Diapositiva2.PNG", "/x/Diapositiva10.PNG"]);
    expect(naturalCompare("a2", "a10")).toBeLessThan(0);
  });

  it("sanitizes decks keeping images parallel to slides", () => {
    const decks = sanitizeSlideDecks([
      { id: "1", title: "T", slides: [" a ", "", "b"], images: ["/img/a.png", "/img/b.png", 42], updatedAt: 7, pinned: 1 },
      { id: "2", title: "Empty", slides: ["  "], images: [] },
      null,
    ]);
    expect(decks).toEqual([
      { id: "1", title: "T", slides: ["a", "b"], images: ["/img/a.png", "/img/b.png"], updatedAt: 7, pinned: true },
    ]);
  });
});
