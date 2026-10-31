import { utilityProcess } from "electron";
import fs from "fs";
import os from "os";
import path from "path";
import type {
  PptxWorkerRequest,
  PptxWorkerResponse,
} from "./pptx-worker-protocol";
import { planSlideRanges } from "./pptx-ranges";

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

/**
 * Worker count: rasterizing is CPU-bound and single-threaded per process, so
 * a deck is split across processes. Two cores are left for the UI, the
 * projector and video playback.
 */
function workerBudget(): number {
  const cores =
    typeof os.availableParallelism === "function"
      ? os.availableParallelism()
      : os.cpus().length;
  return Math.max(1, Math.min(4, cores - 2));
}

/** Per-user fonts (Windows 10+ installs fonts there by default). */
function userFontDirs(): string[] {
  if (process.platform !== "win32" || !process.env.LOCALAPPDATA) return [];
  return [path.join(process.env.LOCALAPPDATA, "Microsoft", "Windows", "Fonts")];
}

/**
 * Render a .pptx to one PNG per slide in utilityProcesses (system fonts, no
 * UI blocking). Large decks are split into contiguous slide ranges rendered
 * in parallel; the last range stays open-ended in case the slide count was
 * an underestimate.
 */
export function renderPptxInWorker(
  options: RenderPptxOptions,
): Promise<RenderPptxResult> {
  const maxSlides = options.maxSlides ?? 300;
  const ranges = planSlideRanges(
    Math.min(Math.max(1, options.total), maxSlides),
    maxSlides,
    workerBudget(),
  );
  return new Promise((resolve, reject) => {
    const children = ranges.map(() =>
      utilityProcess.fork(path.join(__dirname, "pptx-worker.js"), [], {
        serviceName: "lumen-pptx-render",
      }),
    );
    const done = ranges.map(() => 0);
    const results: (RenderPptxResult | null)[] = ranges.map(() => null);
    let settled = false;
    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      for (const child of children) child.kill();
      action();
    };
    const fail = (error: Error) =>
      finish(() => {
        // A failed import keeps nothing, including the other ranges' PNGs.
        for (const result of results)
          for (const file of result?.files ?? [])
            fs.rmSync(file, { force: true });
        reject(error);
      });
    const timer = setTimeout(
      () => fail(new Error("La conversión tardó demasiado y se canceló.")),
      options.timeoutMs ?? 10 * 60 * 1000,
    );
    children.forEach((child, index) => {
      child.on("message", (message: PptxWorkerResponse) => {
        if (message.type === "progress") {
          done[index] = message.done;
          const total = Math.max(1, options.total);
          options.onProgress?.(
            Math.min(
              total,
              done.reduce((sum, n) => sum + n, 0),
            ),
            total,
          );
        } else if (message.type === "done") {
          results[index] = { files: message.files, warnings: message.warnings };
          if (results.every(Boolean)) {
            const files = results.flatMap((result) => result!.files);
            const warnings = [
              ...new Set(results.flatMap((result) => result!.warnings)),
            ].slice(0, 20);
            if (files.length === 0)
              fail(new Error("La presentación no produjo ninguna imagen."));
            else finish(() => resolve({ files, warnings }));
          }
        } else fail(new Error(message.message));
      });
      child.on("exit", (code) => {
        if (results[index]) return;
        fail(
          new Error(
            `El proceso de conversión terminó inesperadamente (código ${code}).`,
          ),
        );
      });
      const range = ranges[index]!;
      const request: PptxWorkerRequest = {
        type: "render",
        file: options.file,
        outDir: options.outDir,
        prefix: options.prefix,
        width: options.width ?? 1920,
        total: range.last - range.first + 1,
        maxSlides,
        firstSlide: range.first,
        lastSlide: range.last,
        fontDirs: userFontDirs(),
      };
      child.postMessage(request);
    });
  });
}
