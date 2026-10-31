/** Messages exchanged between the main process and the PPTX render worker. */
export interface PptxWorkerRequest {
  type: "render";
  file: string;
  outDir: string;
  /** File-name prefix for the generated PNGs. */
  prefix: string;
  width: number;
  /** Expected slide count (progress denominator only). */
  total: number;
  /** Hard cap on rendered slides. */
  maxSlides: number;
  /** First slide (1-based) this worker renders. Defaults to 1. */
  firstSlide?: number;
  /** Last slide this worker renders (inclusive). Defaults to maxSlides. */
  lastSlide?: number;
  /** Font folders used after the system fonts (per-user installs). */
  fontDirs?: string[];
}

export type PptxWorkerResponse =
  | { type: "progress"; done: number; total: number }
  | { type: "done"; files: string[]; warnings: string[] }
  | { type: "error"; message: string };
