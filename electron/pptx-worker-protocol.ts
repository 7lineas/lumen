export interface PptxWorkerRequest {
  type: "render";
  file: string;
  outDir: string;
  prefix: string;
  width: number;
  total: number;
  maxSlides: number;
  firstSlide?: number;
  lastSlide?: number;
  fontDirs?: string[];
}

export type PptxWorkerResponse =
  | { type: "progress"; done: number; total: number }
  | { type: "done"; files: string[]; warnings: string[] }
  | { type: "error"; message: string };
