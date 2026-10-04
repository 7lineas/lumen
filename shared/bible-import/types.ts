import type { BibleVersionMeta } from "../types";
import type { ImportMetaErrors } from "./build";
import type { ImportMetaHint, ImportSummary } from "./parsers";

export interface ImportPreview {
  previewId: string;
  fileNames: string[];
  summary: ImportSummary;
  hint: ImportMetaHint;
}

export type ImportPreviewResult = { ok: true; preview: ImportPreview } | { ok: false; error: string };

/** What the file dialog IPC answers: a preview, an error to show, or "canceled". */
export type BibleImportPickResult = { ok: true; preview: ImportPreview } | { ok: false; error?: string; canceled?: boolean };

export type BibleImportCommitResult =
  | { ok: true; version: BibleVersionMeta }
  | { ok: false; errors: ImportMetaErrors; error?: string };
