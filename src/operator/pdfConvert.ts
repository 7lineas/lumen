import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import PdfWorker from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

// Legacy build on purpose: the modern pdf.js build needs newer JS built-ins
// (e.g. Uint8Array.prototype.toHex) than the Chromium bundled with Electron 34 has.
pdfjsLib.GlobalWorkerOptions.workerSrc = PdfWorker;

const MAX_PAGES = 300;

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < view.length; i += CHUNK) {
    binary += String.fromCharCode(...view.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * Rasterize every PDF page to PNG (screenshots of the real slide design).
 * Pure Chromium path: pdf.js + canvas, no native deps.
 */
export async function rasterizePdfToPngs(
  base64: string,
  opts: { targetWidth?: number; onProgress?: (done: number, total: number) => void } = {},
): Promise<{ pngBase64: string[] }> {
  const targetWidth = opts.targetWidth ?? 1920;
  const loadingTask = pdfjsLib.getDocument({ data: base64ToBytes(base64), useSystemFonts: true });
  const pdf = await loadingTask.promise;
  try {
    const total = Math.min(pdf.numPages, MAX_PAGES);
    if (total === 0) throw new Error("empty pdf");
    const pngBase64: string[] = [];
    for (let pageNumber = 1; pageNumber <= total; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      try {
        const viewport = page.getViewport({ scale: 1 });
        const scale = targetWidth / Math.max(1, viewport.width);
        const scaled = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(scaled.width));
        canvas.height = Math.max(1, Math.round(scaled.height));
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) throw new Error("no 2d context");
        await page.render({ canvas, canvasContext: context, viewport: scaled }).promise;
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
        if (!blob) throw new Error("rasterize failed");
        pngBase64.push(bytesToBase64(await blob.arrayBuffer()));
      } finally {
        page.cleanup();
      }
      opts.onProgress?.(pageNumber, total);
    }
    return { pngBase64 };
  } finally {
    // The loading task owns the worker resources (the document proxy has no destroy()).
    await loadingTask.destroy();
  }
}
