import { utilityProcess } from "electron";
import path from "path";
import type { PptxWorkerRequest, PptxWorkerResponse } from "./pptx-worker-protocol";

export interface RenderPptxOptions {
  file: string;
  outDir: string;
  prefix: string;
  total: number;
  width?: number;
  maxSlides?: number;
  onProgress?: (done: number, total: number) => void;
  /** Hard timeout so a corrupt file can never hang the UI forever. */
  timeoutMs?: number;
}

export interface RenderPptxResult {
  files: string[];
  warnings: string[];
}

/** Render a .pptx to one PNG per slide in a utilityProcess (system fonts, no UI blocking). */
export function renderPptxInWorker(options: RenderPptxOptions): Promise<RenderPptxResult> {
  return new Promise((resolve, reject) => {
    const child = utilityProcess.fork(path.join(__dirname, "pptx-worker.js"), [], { serviceName: "lumen-pptx-render" });
    let settled = false;
    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      action();
    };
    const timer = setTimeout(
      () => finish(() => reject(new Error("La conversión tardó demasiado y se canceló."))),
      options.timeoutMs ?? 10 * 60 * 1000,
    );
    child.on("message", (message: PptxWorkerResponse) => {
      if (message.type === "progress") options.onProgress?.(message.done, message.total);
      else if (message.type === "done") finish(() => resolve({ files: message.files, warnings: message.warnings }));
      else finish(() => reject(new Error(message.message)));
    });
    child.on("exit", (code) => {
      finish(() => reject(new Error(`El proceso de conversión terminó inesperadamente (código ${code}).`)));
    });
    const request: PptxWorkerRequest = {
      type: "render",
      file: options.file,
      outDir: options.outDir,
      prefix: options.prefix,
      width: options.width ?? 1920,
      total: options.total,
      maxSlides: options.maxSlides ?? 300,
    };
    child.postMessage(request);
  });
}
