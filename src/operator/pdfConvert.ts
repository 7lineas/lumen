import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import PdfWorker from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import type { PngEncodeResponse } from "./pngEncodeWorker";

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

/** The encoder pool itself failed (not the PDF): retried on the main thread. */
class EncoderPoolError extends Error {}

/** Turns a rendered page canvas into base64 PNG. */
interface PngEncoder {
  encode(canvas: HTMLCanvasElement): Promise<string>;
  /** Resolves once fewer pages are waiting, so memory stays bounded. */
  ready(): Promise<void>;
  close(): void;
}

/** One page at a time with canvas.toBlob (Chromium runs these one by one). */
function mainThreadEncoder(): PngEncoder {
  return {
    async encode(canvas) {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      );
      canvas.width = canvas.height = 0;
      if (!blob) throw new Error("rasterize failed");
      return bytesToBase64(await blob.arrayBuffer());
    },
    ready: () => Promise.resolve(),
    close() {},
  };
}

/**
 * Encode pages in parallel workers: same Chromium PNG encoder, same bytes,
 * while the next page is already being drawn. Two cores stay free for the UI
 * and the projector.
 */
function workerPoolEncoder(): PngEncoder | null {
  if (
    typeof Worker === "undefined" ||
    typeof OffscreenCanvas === "undefined" ||
    typeof createImageBitmap === "undefined"
  )
    return null;
  const size = Math.max(
    1,
    Math.min(4, (navigator.hardwareConcurrency || 2) - 2),
  );
  const workers: Worker[] = [];
  try {
    for (let i = 0; i < size; i++)
      workers.push(
        new Worker(new URL("./pngEncodeWorker.ts", import.meta.url), {
          type: "module",
        }),
      );
  } catch {
    for (const worker of workers) worker.terminate();
    return null;
  }
  const busy = workers.map(() => 0);
  const waiting = new Map<
    number,
    { resolve: (base64: string) => void; reject: (error: Error) => void }
  >();
  const freed: (() => void)[] = [];
  let nextId = 0;
  const settle = (index: number) => {
    busy[index]!--;
    freed.shift()?.();
  };
  workers.forEach((worker, index) => {
    worker.onmessage = (event: MessageEvent<PngEncodeResponse>) => {
      const message = event.data;
      const entry = waiting.get(message.id);
      waiting.delete(message.id);
      settle(index);
      if (!entry) return;
      if ("error" in message) entry.reject(new EncoderPoolError(message.error));
      else entry.resolve(message.base64);
    };
    worker.onerror = (event) => {
      event.preventDefault();
      for (const [id, entry] of waiting) {
        entry.reject(
          new EncoderPoolError(event.message || "png encoder failed"),
        );
        waiting.delete(id);
      }
    };
  });
  const inFlight = () => busy.reduce((sum, n) => sum + n, 0);
  return {
    async encode(canvas) {
      const bitmap = await createImageBitmap(canvas);
      canvas.width = canvas.height = 0;
      const index = busy.indexOf(Math.min(...busy));
      busy[index]!++;
      const id = nextId++;
      const result = new Promise<string>((resolve, reject) =>
        waiting.set(id, { resolve, reject }),
      );
      workers[index]!.postMessage({ id, bitmap }, [bitmap]);
      return result;
    },
    ready() {
      if (inFlight() < size * 2) return Promise.resolve();
      return new Promise((resolve) => freed.push(resolve));
    },
    close() {
      for (const worker of workers) worker.terminate();
    },
  };
}

/**
 * Rasterize every PDF page to PNG (screenshots of the real slide design).
 * Pure Chromium path: pdf.js + canvas, no native deps.
 */
export async function rasterizePdfToPngs(
  base64: string,
  opts: RasterizeOptions = {},
): Promise<{ pngBase64: string[] }> {
  const data = base64ToBytes(base64);
  const pool = workerPoolEncoder();
  if (pool) {
    try {
      // pdf.js takes ownership of the bytes it is given, so it gets a copy.
      return await rasterize(data.slice(), pool, opts);
    } catch (error) {
      if (!(error instanceof EncoderPoolError)) throw error;
      console.warn(
        "[pdf] encoder workers failed, encoding on the main thread",
        error,
      );
    }
  }
  return rasterize(data, mainThreadEncoder(), opts);
}

interface RasterizeOptions {
  targetWidth?: number;
  onProgress?: (done: number, total: number) => void;
}

async function rasterize(
  data: Uint8Array,
  encoder: PngEncoder,
  opts: RasterizeOptions,
): Promise<{ pngBase64: string[] }> {
  const targetWidth = opts.targetWidth ?? 1920;
  const loadingTask = pdfjsLib.getDocument({ data, useSystemFonts: true });
  const encodes: Promise<string>[] = [];
  try {
    const pdf = await loadingTask.promise;
    const total = Math.min(pdf.numPages, MAX_PAGES);
    if (total === 0) throw new Error("empty pdf");
    let done = 0;
    for (let pageNumber = 1; pageNumber <= total; pageNumber++) {
      await encoder.ready();
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
        await page.render({ canvas, canvasContext: context, viewport: scaled })
          .promise;
        const encoded = encoder.encode(canvas).then((png) => {
          opts.onProgress?.(++done, total);
          return png;
        });
        // Observed here so an early failure isn't reported as unhandled;
        // Promise.all below still rejects with it.
        encoded.catch(() => undefined);
        encodes.push(encoded);
      } finally {
        page.cleanup();
      }
    }
    return { pngBase64: await Promise.all(encodes) };
  } finally {
    encoder.close();
    // The loading task owns the worker resources (the document proxy has no destroy()).
    await loadingTask.destroy();
  }
}
