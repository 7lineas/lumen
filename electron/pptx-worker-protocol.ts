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
}

export type PptxWorkerResponse =
  | { type: "progress"; done: number; total: number }
  | { type: "done"; files: string[]; warnings: string[] }
  | { type: "error"; message: string };
