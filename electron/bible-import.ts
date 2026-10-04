import fs from "fs";
import path from "path";
import { buildImportedBible, validateImportMeta, type ImportMetaInput } from "../shared/bible-import/build";
import {
  ImportError,
  mergeParsed,
  parseBibleText,
  summarize,
  type ParsedBible,
} from "../shared/bible-import/parsers";
import type { BibleVersionMeta } from "../shared/types";
import type { BibleImportCommitResult, ImportPreviewResult } from "../shared/bible-import/types";

export const MAX_IMPORT_BYTES = 80 * 1024 * 1024;

export function decodeBibleBytes(bytes: Buffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    // Old Windows modules are often Latin-1 / Windows-1252.
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/** Reads and parses one or more files into a single Bible (nothing is written). */
export function parseBibleFiles(files: string[]): { parsed: ParsedBible; fileNames: string[] } {
  if (files.length === 0) throw new ImportError("No se eligió ningún archivo.");
  const parsedList: ParsedBible[] = [];
  const failures: string[] = [];
  for (const file of files) {
    const name = path.basename(file);
    const size = fs.statSync(file).size;
    if (size > MAX_IMPORT_BYTES) {
      throw new ImportError(`${name} es demasiado grande (máximo ${MAX_IMPORT_BYTES / 1024 / 1024} MB).`);
    }
    try {
      parsedList.push(parseBibleText(name, decodeBibleBytes(fs.readFileSync(file))));
    } catch (error) {
      if (!(error instanceof ImportError)) throw error;
      failures.push(files.length > 1 ? `${name}: ${error.message}` : error.message);
    }
  }
  if (parsedList.length === 0) throw new ImportError(failures.join("\n"));
  const merged = mergeParsed(parsedList);
  if (failures.length > 0) merged.warnings.push(...failures.map((failure) => `Se omitió ${failure}`));
  return { parsed: merged, fileNames: files.map((file) => path.basename(file)) };
}

export class ImportSession {
  private readonly previews = new Map<string, { parsed: ParsedBible }>();
  private counter = 0;

  preview(files: string[]): ImportPreviewResult {
    try {
      const { parsed, fileNames } = parseBibleFiles(files);
      const summary = summarize(parsed);
      this.counter += 1;
      const previewId = `p${Date.now().toString(36)}${this.counter}`;
      // Only the latest preview is kept: files are large and the dialog is modal.
      this.previews.clear();
      this.previews.set(previewId, { parsed });
      return { ok: true, preview: { previewId, fileNames, summary, hint: parsed.hint } };
    } catch (error) {
      if (error instanceof ImportError) return { ok: false, error: error.message };
      return { ok: false, error: error instanceof Error ? `No se pudo leer el archivo: ${error.message}` : "No se pudo leer el archivo" };
    }
  }

  /** Validates the user's fields, writes `<userDir>/<id>.json` and forgets the preview. */
  commit(
    previewId: string,
    input: ImportMetaInput,
    userDir: string,
    existing: ReadonlyArray<Pick<BibleVersionMeta, "id" | "name" | "abbr">>,
  ): BibleImportCommitResult {
    const entry = this.previews.get(previewId);
    if (!entry) return { ok: false, errors: {}, error: "La vista previa caducó. Elija el archivo otra vez." };
    const errors = validateImportMeta(input, existing);
    if (Object.keys(errors).length > 0) return { ok: false, errors };
    const bible = buildImportedBible(entry.parsed, input, existing);
    fs.mkdirSync(userDir, { recursive: true });
    const dest = path.join(userDir, `${bible.meta.id}.json`);
    const tmp = path.join(userDir, `.${bible.meta.id}.partial`);
    try {
      fs.writeFileSync(tmp, JSON.stringify(bible));
      fs.renameSync(tmp, dest);
    } catch (error) {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
      return { ok: false, errors: {}, error: `No se pudo guardar: ${error instanceof Error ? error.message : "error de disco"}` };
    }
    this.previews.delete(previewId);
    return { ok: true, version: bible.meta };
  }

  discard(): void {
    this.previews.clear();
  }
}
