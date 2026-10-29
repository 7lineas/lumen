import fs from "fs";
import path from "path";
import licenses from "../shared/bible-licenses.json";
import {
  BIBLES_CATALOG_URL,
  assertBibleId,
  describeLibrary,
  downloadAndInstall,
  moduleDownloadUrl,
  parseCatalog,
  type BibleCatalog,
  type BundledLibraryEntry,
  type DownloadProgress,
  type FetchLike,
  type FetchResponse,
  type LibraryView,
} from "../shared/bible-download";
import type { BibleVersionMeta } from "../shared/types";

export function readCatalogFile(file: string): BibleCatalog {
  const parsed = parseCatalog(JSON.parse(fs.readFileSync(file, "utf8")));
  if (!parsed) throw new Error("El catálogo de Biblias no es válido");
  return parsed;
}

export function resolveCatalogPath(candidates: string[]): string {
  const tried: string[] = [];
  for (const file of candidates) {
    const normalized = path.normalize(file);
    tried.push(normalized);
    if (fs.existsSync(normalized)) return normalized;
  }
  throw new Error(`No se encontró bibles-catalog.json.\n${tried.join("\n")}`);
}

export function catalogCandidates(
  resourcesPath: string,
  appPath: string,
  mainDir: string,
  cwd: string,
): string[] {
  return [
    path.join(resourcesPath, "data", "bible-modules", "bibles-catalog.json"),
    path.join(mainDir, "..", "data", "bible-modules", "bibles-catalog.json"),
    path.join(appPath, "data", "bible-modules", "bibles-catalog.json"),
    path.join(cwd, "data", "bible-modules", "bibles-catalog.json"),
  ];
}

export async function nodeFetch(url: string): Promise<FetchResponse> {
  const response = await fetch(url);
  return response as unknown as FetchResponse;
}

export async function resolveCatalog(
  bundled: BibleCatalog,
  fetchImpl: FetchLike,
  timeoutMs = 5000,
): Promise<{ catalog: BibleCatalog; source: "remote" | "bundled" }> {
  const timeout = new Promise<null>((resolve) =>
    setTimeout(() => resolve(null), timeoutMs),
  );
  try {
    const response = await Promise.race([
      fetchImpl(BIBLES_CATALOG_URL),
      timeout,
    ]);
    if (!response || !response.ok)
      return { catalog: bundled, source: "bundled" };
    const text = new TextDecoder().decode(
      new Uint8Array(await response.arrayBuffer()),
    );
    const parsed = parseCatalog(JSON.parse(text), bundled.extensionNote);
    if (!parsed) return { catalog: bundled, source: "bundled" };
    return { catalog: parsed, source: "remote" };
  } catch {
    return { catalog: bundled, source: "bundled" };
  }
}

function licenseRow(id: string) {
  return licenses.versions.find((version) => version.id === id);
}

export function bundledLibraryEntries(bibleDir: string): BundledLibraryEntry[] {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(bibleDir, "manifest.json"), "utf8"),
  ) as BibleVersionMeta[];
  return manifest.map((meta) => {
    const file = path.join(bibleDir, `${meta.id}.json`);
    const row = licenseRow(meta.id);
    return {
      id: meta.id,
      name: row?.name ?? meta.name,
      abbr: meta.abbr,
      language: row?.language ?? meta.language,
      bytes: fs.existsSync(file) ? fs.statSync(file).size : null,
      license: row?.license ?? "Dominio público",
      attribution: row?.attribution ?? "",
      copyright: row?.copyright ?? "",
      draft: row?.draft === true,
    };
  });
}

export function installedModuleIds(userDir: string): Set<string> {
  if (!fs.existsSync(userDir)) return new Set();
  const ids = fs
    .readdirSync(userDir)
    .filter((name) => name.endsWith(".json") && !name.startsWith("."))
    .map((name) => name.slice(0, -".json".length))
    .filter((id) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id));
  return new Set(ids);
}

export function listSelectableVersions(
  bibleDir: string,
  userDir: string,
): BibleVersionMeta[] {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(bibleDir, "manifest.json"), "utf8"),
  ) as BibleVersionMeta[];
  const versions: BibleVersionMeta[] = manifest.map((meta) => ({
    ...meta,
    bundled: true,
  }));
  const seen = new Set(manifest.map((meta) => meta.id));
  for (const id of installedModuleIds(userDir)) {
    if (seen.has(id)) continue;
    try {
      const raw = JSON.parse(
        fs.readFileSync(path.join(userDir, `${id}.json`), "utf8"),
      ) as {
        meta?: BibleVersionMeta;
      };
      if (raw.meta?.id !== id) continue;
      if (raw.meta?.draft === true) continue;
      versions.push(raw.meta);
    } catch {
      // A broken download stays out of the version list.
    }
  }
  return versions;
}

export function resolveModulePath(
  bibleDir: string,
  userDir: string,
  id: string,
): string {
  const safe = assertBibleId(id);
  const bundled = path.join(bibleDir, `${safe}.json`);
  if (fs.existsSync(bundled)) return bundled;
  const downloaded = path.join(userDir, `${safe}.json`);
  if (fs.existsSync(downloaded)) return downloaded;
  throw new Error("Esa versión no está instalada");
}

/** Remote catalog kept in memory so opening Biblias does not wait on the network each time. */
const CATALOG_TTL_MS = 60 * 60 * 1000;
let remoteCatalog: { catalog: BibleCatalog; at: number } | null = null;
let remoteRefresh: Promise<void> | null = null;

function refreshRemoteCatalog(
  bundled: BibleCatalog,
  fetchImpl: FetchLike,
): Promise<void> {
  remoteRefresh ??= resolveCatalog(bundled, fetchImpl)
    .then((resolved) => {
      if (resolved.source === "remote")
        remoteCatalog = { catalog: resolved.catalog, at: Date.now() };
    })
    .finally(() => {
      remoteRefresh = null;
    });
  return remoteRefresh;
}

/**
 * Answers from the last remote catalog right away and refreshes it in the
 * background once it is older than the TTL. Without a cached copy it waits
 * for one fetch, then falls back to the bundled list.
 */
export async function resolveCatalogCached(
  bundled: BibleCatalog,
  fetchImpl: FetchLike,
): Promise<{ catalog: BibleCatalog; source: "remote" | "bundled" }> {
  if (remoteCatalog) {
    if (Date.now() - remoteCatalog.at > CATALOG_TTL_MS)
      void refreshRemoteCatalog(bundled, fetchImpl);
    return { catalog: remoteCatalog.catalog, source: "remote" };
  }
  await refreshRemoteCatalog(bundled, fetchImpl);
  // TS cannot see the assignment made inside the refresh, so read it again.
  const fetched = remoteCatalog as { catalog: BibleCatalog; at: number } | null;
  return fetched
    ? { catalog: fetched.catalog, source: "remote" }
    : { catalog: bundled, source: "bundled" };
}

export async function buildLibraryView(
  bibleDir: string,
  userDir: string,
  catalogFile: string,
  fetchImpl: FetchLike,
): Promise<LibraryView> {
  const bundledCatalog = readCatalogFile(catalogFile);
  const resolved = await resolveCatalogCached(bundledCatalog, fetchImpl);
  return describeLibrary({
    bundled: bundledLibraryEntries(bibleDir),
    catalog: resolved.catalog,
    installedIds: installedModuleIds(userDir),
    catalogSource: resolved.source,
  });
}

export async function downloadModule(options: {
  catalog: BibleCatalog;
  id: string;
  userDir: string;
  fetchImpl: FetchLike;
  onProgress?: (progress: DownloadProgress) => void;
  maxAttempts?: number;
  retryDelayMs?: number;
}): Promise<void> {
  const id = assertBibleId(options.id);
  const entry = options.catalog.versions.find((version) => version.id === id);
  if (!entry) throw new Error("Esa versión no está en el catálogo");
  fs.mkdirSync(options.userDir, { recursive: true });
  const dest = path.join(options.userDir, `${id}.json`);
  const tmp = path.join(options.userDir, `.${id}.partial`);
  try {
    await downloadAndInstall({
      url: moduleDownloadUrl(id),
      expectedSha256: entry.sha256,
      expectedBytes: entry.bytes,
      fetchImpl: options.fetchImpl,
      onProgress: options.onProgress,
      maxAttempts: options.maxAttempts,
      retryDelayMs: options.retryDelayMs,
      write: (bytes) => {
        let parsed: { meta?: { id?: string } };
        try {
          parsed = JSON.parse(new TextDecoder().decode(bytes)) as {
            meta?: { id?: string };
          };
        } catch {
          throw new Error("El archivo no es un módulo de Biblia válido");
        }
        if (parsed.meta?.id !== id) {
          throw new Error("El módulo no corresponde a esta versión");
        }
        fs.writeFileSync(tmp, bytes);
        fs.renameSync(tmp, dest);
      },
    });
  } finally {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  }
}

export function removeModule(
  userDir: string,
  bundledIds: ReadonlySet<string>,
  id: string,
): void {
  const safe = assertBibleId(id);
  if (bundledIds.has(safe)) {
    throw new Error("Esta versión viene con el programa y no se puede quitar");
  }
  const dest = path.join(userDir, `${safe}.json`);
  if (!fs.existsSync(dest)) throw new Error("Esa versión no está descargada");
  fs.unlinkSync(dest);
}

export function bundledIds(bibleDir: string): Set<string> {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(bibleDir, "manifest.json"), "utf8"),
  ) as BibleVersionMeta[];
  return new Set(manifest.map((meta) => meta.id));
}
