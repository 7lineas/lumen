import fs from "fs";
import path from "path";
import type { PptxWorkerRequest, PptxWorkerResponse } from "./pptx-worker-protocol";

const CHUNK = 6;

/**
 * Render a .pptx to one PNG per slide using pptx-glimpse's Node entry on
 * purpose: that entry scans the system fonts (Calibri, Arial, ...). The
 * browser entry has no font access and silently renders slides WITHOUT text.
 * Pure Node (no Electron imports) so it can be unit-tested.
 */
export async function renderPptxFile(
  request: PptxWorkerRequest,
  post: (message: PptxWorkerResponse) => void,
): Promise<void> {
  const { convertPptxToPng } = await import("pptx-glimpse");
  const bytes = new Uint8Array(fs.readFileSync(request.file));
  fs.mkdirSync(request.outDir, { recursive: true });
  const files: string[] = [];
  const warnings = new Set<string>();
  const total = Math.max(1, request.total);
  try {
    // Chunked so progress can be reported and memory stays bounded.
    for (let start = 1; start <= request.maxSlides; start += CHUNK) {
      const slides = Array.from({ length: CHUNK }, (_, i) => start + i).filter((n) => n <= request.maxSlides);
      const report = await convertPptxToPng(bytes, { width: request.width, slides });
      for (const diagnostic of report.diagnostics) {
        if (diagnostic.severity === "warning" || diagnostic.severity === "error") warnings.add(diagnostic.message);
      }
      if (report.slides.length === 0) break;
      for (const slide of report.slides) {
        const target = path.join(request.outDir, `${request.prefix}-${String(files.length).padStart(3, "0")}.png`);
        fs.writeFileSync(target, slide.png);
        files.push(target);
      }
      post({ type: "progress", done: Math.min(files.length, total), total });
      if (report.slides.length < slides.length) break;
    }
    if (files.length === 0) throw new Error("La presentación no produjo ninguna imagen.");
    post({ type: "done", files, warnings: [...warnings].slice(0, 20) });
  } catch (error) {
    for (const file of files) fs.rmSync(file, { force: true });
    throw error;
  }
}
