import fs from "fs";
import os from "os";
import path from "path";
import pptxgen from "pptxgenjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { renderPptxFile } from "./pptx-render-core";
import type { PptxWorkerResponse } from "./pptx-worker-protocol";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47];
let dir = "";
let pptxFile = "";

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "lumen-pptx-"));
  pptxFile = path.join(dir, "deck.pptx");
  const deck = new pptxgen();
  deck.layout = "LAYOUT_16x9";
  for (let i = 1; i <= 8; i++) {
    const slide = deck.addSlide();
    slide.background = { color: "1F3A5F" };
    slide.addText(`Diapositiva ${i}`, { x: 0.5, y: 1.5, w: 9, h: 1.5, fontSize: 44, color: "FFFFFF", align: "center" });
  }
  await deck.writeFile({ fileName: pptxFile });
}, 30_000);

afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("renderPptxFile", () => {
  it("renders one PNG per slide in order, across chunks, and reports progress", async () => {
    const messages: PptxWorkerResponse[] = [];
    await renderPptxFile(
      { type: "render", file: pptxFile, outDir: path.join(dir, "out"), prefix: "t", width: 640, total: 8, maxSlides: 300 },
      (message) => messages.push(message),
    );
    const done = messages.find((message) => message.type === "done");
    expect(done?.type).toBe("done");
    if (done?.type !== "done") return;
    expect(done.files).toHaveLength(8);
    expect(done.files.map((file) => path.basename(file))).toEqual(
      Array.from({ length: 8 }, (_, i) => `t-${String(i).padStart(3, "0")}.png`),
    );
    for (const file of done.files) {
      expect([...fs.readFileSync(file).subarray(0, 4)]).toEqual(PNG_SIGNATURE);
    }
    const progress = messages.filter((message) => message.type === "progress");
    expect(progress.length).toBeGreaterThanOrEqual(2);
    expect(progress.at(-1)).toMatchObject({ done: 8, total: 8 });
  }, 60_000);

  it("honours maxSlides", async () => {
    const messages: PptxWorkerResponse[] = [];
    await renderPptxFile(
      { type: "render", file: pptxFile, outDir: path.join(dir, "out2"), prefix: "m", width: 320, total: 3, maxSlides: 3 },
      (message) => messages.push(message),
    );
    const done = messages.find((message) => message.type === "done");
    expect(done?.type === "done" ? done.files : []).toHaveLength(3);
  }, 60_000);

  it("rejects a file that is not a presentation", async () => {
    const bad = path.join(dir, "bad.pptx");
    fs.writeFileSync(bad, "not a zip");
    await expect(
      renderPptxFile({ type: "render", file: bad, outDir: path.join(dir, "out3"), prefix: "b", width: 320, total: 1, maxSlides: 5 }, () => {}),
    ).rejects.toThrow();
  });
});
