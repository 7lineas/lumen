import { createHash } from "node:crypto";

/** Public base for module files. The app never follows another host from the catalog. */
export const BIBLES_DOWNLOAD_BASE = "https://downloads.7lineas.com/bibles";
export const BIBLES_CATALOG_URL = `${BIBLES_DOWNLOAD_BASE}/bibles-catalog.json`;

const BIBLE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SHA256_HEX = /^[a-f0-9]{64}$/;

export class DownloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DownloadError";
  }
}

export class HashMismatchError extends DownloadError {
  readonly expected: string;
  readonly actual: string;

  constructor(expected: string, actual: string) {
    super("El archivo descargado no coincide con el SHA-256 del catálogo. No se instaló.");
    this.name = "HashMismatchError";
    this.expected = expected;
    this.actual = actual;
  }
}

export interface CatalogEntry {
  id: string;
  name: string;
  language: string;
  file: string;
  bytes: number;
  sha256: string;
  license: string;
  attribution: string;
  copyright: string;
  abbr: string;
  draft: boolean;
}

export interface BibleCatalog {
  format: string;
  baseUrl: string;
  extensionNote: string;
  versions: CatalogEntry[];
}

export interface DownloadProgress {
  loaded: number;
  total: number | null;
  attempt: number;
}

export interface FetchResponse {
  ok: boolean;
  status: number;
  headers?: { get(name: string): string | null };
  arrayBuffer(): Promise<ArrayBuffer>;
  body?: { getReader(): { read(): Promise<{ done: boolean; value?: Uint8Array }> } };
}

export type FetchLike = (url: string) => Promise<FetchResponse>;

export function assertBibleId(id: string): string {
  if (!BIBLE_ID.test(id)) {
    throw new DownloadError("Identificador de Biblia no válido");
  }
  return id;
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function moduleDownloadUrl(id: string): string {
  return `${BIBLES_DOWNLOAD_BASE}/${assertBibleId(id)}.json`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** Keeps only complete entries. Download URLs stay on the fixed public host. */
export function parseCatalog(data: unknown, extensionNote = ""): BibleCatalog | null {
  const root = asRecord(data);
  if (!root || !Array.isArray(root.versions)) return null;
  const versions: CatalogEntry[] = [];
  for (const item of root.versions) {
    const row = asRecord(item);
    if (!row) continue;
    if (typeof row.id !== "string" || !BIBLE_ID.test(row.id)) continue;
    if (typeof row.name !== "string" || row.name.trim() === "") continue;
    if (typeof row.language !== "string" || row.language.trim() === "") continue;
    if (row.file !== `${row.id}.json`) continue;
    if (typeof row.bytes !== "number" || !Number.isFinite(row.bytes) || row.bytes <= 0) continue;
    if (typeof row.sha256 !== "string" || !SHA256_HEX.test(row.sha256.toLowerCase())) continue;
    if (typeof row.license !== "string" || row.license.trim() === "") continue;
    if (typeof row.attribution !== "string" || row.attribution.trim() === "") continue;
    if (typeof row.copyright !== "string" || row.copyright.trim() === "") continue;
    versions.push({
      id: row.id,
      name: row.name.trim(),
      language: row.language.trim(),
      file: `${row.id}.json`,
      bytes: row.bytes,
      sha256: row.sha256.toLowerCase(),
      license: row.license.trim(),
      attribution: row.attribution.trim(),
      copyright: row.copyright.trim(),
      abbr: typeof row.abbr === "string" && row.abbr.trim() ? row.abbr.trim() : row.id.toUpperCase(),
      draft: row.draft === true,
    });
  }
  if (versions.length === 0) return null;
  const note = typeof root.extensionNote === "string" && root.extensionNote.trim()
    ? root.extensionNote.trim()
    : extensionNote;
  return {
    format: "proyector-bible-json-v1",
    baseUrl: BIBLES_DOWNLOAD_BASE,
    extensionNote: note,
    versions,
  };
}

async function readResponseBytes(
  response: FetchResponse,
  attempt: number,
  expectedBytes: number | null,
  onProgress?: (progress: DownloadProgress) => void,
): Promise<Uint8Array> {
  const header = response.headers?.get("content-length");
  const parsedHeader = header ? Number(header) : NaN;
  const total = Number.isFinite(parsedHeader) && parsedHeader > 0 ? parsedHeader : expectedBytes;
  onProgress?.({ loaded: 0, total, attempt });

  if (response.body && typeof response.body.getReader === "function") {
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let loaded = 0;
    for (;;) {
      const step = await reader.read();
      if (step.done) break;
      if (!step.value) continue;
      chunks.push(step.value);
      loaded += step.value.byteLength;
      onProgress?.({ loaded, total, attempt });
    }
    const out = new Uint8Array(loaded);
    let offset = 0;
    for (const chunk of chunks) {
      out.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return out;
  }

  const buffer = new Uint8Array(await response.arrayBuffer());
  onProgress?.({ loaded: buffer.byteLength, total: buffer.byteLength, attempt });
  return buffer;
}

function delay(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function downloadAndInstall(options: {
  url: string;
  expectedSha256: string;
  expectedBytes?: number | null;
  fetchImpl: FetchLike;
  write: (bytes: Uint8Array) => Promise<void> | void;
  maxAttempts?: number;
  retryDelayMs?: number;
  onProgress?: (progress: DownloadProgress) => void;
}): Promise<{ sha256: string; bytes: number }> {
  const expected = options.expectedSha256.toLowerCase();
  if (!SHA256_HEX.test(expected)) {
    throw new DownloadError("El catálogo no trae un SHA-256 válido");
  }
  const maxAttempts = options.maxAttempts ?? 3;
  const retryDelayMs = options.retryDelayMs ?? 400;
  let lastError: Error = new DownloadError("No se pudo descargar");

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      let response: FetchResponse;
      try {
        response = await options.fetchImpl(options.url);
      } catch {
        throw new DownloadError("Sin conexión. Inténtelo de nuevo.");
      }
      if (!response.ok) {
        throw new DownloadError(`No se pudo descargar el archivo (HTTP ${response.status}).`);
      }
      const bytes = await readResponseBytes(
        response,
        attempt,
        options.expectedBytes ?? null,
        options.onProgress,
      );
      const actual = sha256Hex(bytes);
      if (actual !== expected) {
        throw new HashMismatchError(expected, actual);
      }
      await options.write(bytes);
      return { sha256: actual, bytes: bytes.byteLength };
    } catch (error) {
      lastError = error instanceof Error ? error : new DownloadError("No se pudo descargar");
      if (attempt < maxAttempts) await delay(retryDelayMs);
    }
  }

  throw lastError;
}

export interface LibraryEntry {
  id: string;
  name: string;
  abbr: string;
  language: string;
  bytes: number | null;
  license: string;
  attribution: string;
  copyright: string;
  draft: boolean;
  availability: "included" | "installed" | "available";
}

export interface LibraryView {
  offline: boolean;
  extensionNote: string;
  entries: LibraryEntry[];
}

export interface BundledLibraryEntry {
  id: string;
  name: string;
  abbr: string;
  language: string;
  bytes: number | null;
  license: string;
  attribution: string;
  copyright: string;
  draft: boolean;
}

export function describeLibrary(input: {
  bundled: BundledLibraryEntry[];
  catalog: BibleCatalog;
  installedIds: ReadonlySet<string>;
  catalogSource: "remote" | "bundled";
}): LibraryView {
  const bundledIds = new Set(input.bundled.map((entry) => entry.id));
  const entries: LibraryEntry[] = input.bundled.map((entry) => ({
    ...entry,
    availability: "included",
  }));

  for (const version of input.catalog.versions) {
    if (bundledIds.has(version.id)) continue;
    entries.push({
      id: version.id,
      name: version.name,
      abbr: version.abbr,
      language: version.language,
      bytes: version.bytes,
      license: version.license,
      attribution: version.attribution,
      copyright: version.copyright,
      draft: version.draft,
      availability: input.installedIds.has(version.id) ? "installed" : "available",
    });
  }

  return {
    offline: input.catalogSource === "bundled",
    extensionNote: input.catalog.extensionNote,
    entries,
  };
}
