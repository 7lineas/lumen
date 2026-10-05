import fs from "fs";
import path from "path";
import {
  attributionFor,
  buildOnlineVersions,
  fallbackAttribution,
  mergeSelectedOnlineIds,
  parseYvVersionId,
  pickSelectedOnlineVersions,
  sanitizeCustomOnlineIds,
  searchOnlineCatalog,
  yvVersionId,
  type ChapterResult,
  type OnlineSearchResult,
  type OnlineVersionsResult,
  type YvBible,
  type YvLicense,
} from "../shared/youversion";
import { parseChapterContent } from "../shared/youversion-parse";
import type { BibleVersionMeta } from "../shared/types";

/**
 * Injected at build time by vite (`define`) from YVP_APP_KEY in .env.local or
 * the environment; never committed. It lives only in the main process: the
 * renderer and the projector talk to this module through IPC.
 */
declare const __YVP_APP_KEY__: string | undefined;

export function resolveAppKey(env: NodeJS.ProcessEnv = process.env): string {
  const runtime = env.YVP_APP_KEY?.trim();
  if (runtime) return runtime;
  return (typeof __YVP_APP_KEY__ === "string" ? __YVP_APP_KEY__ : "").trim();
}

export const YVP_BASE_URL = "https://api.youversion.com/v1";
export const CHAPTER_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const VERSIONS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** While some version is still locked the list is re-read soon: the user may have accepted a license since. */
export const LOCKED_VERSIONS_TTL_MS = 30 * 60 * 1000;
/** Retry-After above this is not waited for: the call fails fast and the UI says when to retry. */
const MAX_INLINE_WAIT_SEC = 10;

export type FetchLike = (
  url: string,
  init?: { headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<{
  status: number;
  ok: boolean;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}>;

export class YvError extends Error {
  constructor(
    message: string,
    readonly reason: "locked" | "offline" | "rate-limited" | "not-found" | "error",
    readonly retryAfterSec?: number,
  ) {
    super(message);
    this.name = "YvError";
  }
}

export interface YouVersionOptions {
  appKey: string;
  cacheDir: string;
  fetchImpl: FetchLike;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
  maxAttempts?: number;
  baseBackoffMs?: number;
}

interface CachedChapter {
  fetchedAt: number;
  verses: Record<string, string>;
}

interface CachedAttribution {
  fetchedAt: number;
  copyright: string;
}

interface CachedVersions {
  fetchedAt: number;
  versions: BibleVersionMeta[];
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}

function writeJsonAtomic(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value));
  fs.renameSync(tmp, file);
}

export class YouVersionClient {
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly timeoutMs: number;
  private readonly maxAttempts: number;
  private readonly baseBackoffMs: number;
  /** Epoch ms until which the API told us to stop calling it (429 with a long Retry-After). */
  private blockedUntil = 0;
  /** One request at a time: the limit is per key and shared by prefetches. */
  private queue: Promise<unknown> = Promise.resolve();
  private readonly inflight = new Map<string, Promise<ChapterResult>>();

  constructor(private readonly options: YouVersionOptions) {
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.maxAttempts = options.maxAttempts ?? 4;
    this.baseBackoffMs = options.baseBackoffMs ?? 800;
  }

  get configured(): boolean {
    return this.options.appKey.length > 0;
  }

  private versionsFile(): string {
    return path.join(this.options.cacheDir, "versions.json");
  }

  private selectedFile(): string {
    return path.join(this.options.cacheDir, "selected-versions.json");
  }

  /** User-added ids only (defaults are never stored). */
  private readCustomIds(): number[] {
    const cached = readJson<{ ids?: unknown }>(this.selectedFile());
    if (!Array.isArray(cached?.ids)) return [];
    return sanitizeCustomOnlineIds(cached.ids.map((value) => Number(value)));
  }

  private writeCustomIds(ids: readonly number[]): void {
    writeJsonAtomic(this.selectedFile(), { ids: sanitizeCustomOnlineIds(ids) });
  }

  private selectedNumericIds(): number[] {
    return mergeSelectedOnlineIds(this.readCustomIds());
  }

  private selectedIdSet(): Set<string> {
    return new Set(this.selectedNumericIds().map((id) => yvVersionId(id)));
  }

  private toListed(catalog: BibleVersionMeta[]): OnlineVersionsResult["versions"] {
    return pickSelectedOnlineVersions(catalog, this.selectedNumericIds());
  }

  private chapterFile(versionId: number, book: string, chapter: number): string {
    return path.join(this.options.cacheDir, String(versionId), `${book}.${chapter}.json`);
  }

  /** GET with retries, exponential backoff and Retry-After. Returns the response text. */
  private request(pathAndQuery: string): Promise<string> {
    const run = () => this.requestNow(pathAndQuery);
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async requestNow(pathAndQuery: string): Promise<string> {
    const remaining = Math.ceil((this.blockedUntil - this.now()) / 1000);
    if (remaining > 0) {
      throw new YvError("YouVersion pidió esperar antes de volver a consultar", "rate-limited", remaining);
    }
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await this.options.fetchImpl(`${YVP_BASE_URL}${pathAndQuery}`, {
          headers: { "X-YVP-App-Key": this.options.appKey, Accept: "application/json" },
          signal: controller.signal,
        });
        const text = await response.text();
        if (response.status >= 200 && response.status < 300) return text;
        if (response.status === 429) {
          const retryAfter = Math.max(1, Number(response.headers.get("retry-after")) || 5);
          if (retryAfter > MAX_INLINE_WAIT_SEC || attempt === this.maxAttempts) {
            this.blockedUntil = this.now() + retryAfter * 1000;
            throw new YvError("Se alcanzó el límite de consultas de YouVersion", "rate-limited", retryAfter);
          }
          await this.sleep(retryAfter * 1000);
          continue;
        }
        if (response.status === 403) {
          throw new YvError(
            "Licencia no aceptada en el portal de YouVersion Platform de esta app. Acéptala allí para usar esta versión.",
            "locked",
          );
        }
        if (response.status === 404 || response.status === 204) {
          throw new YvError("YouVersion no tiene ese pasaje", "not-found");
        }
        if (response.status === 401 || response.status === 412) {
          throw new YvError("YouVersion rechazó la clave de la app", "error");
        }
        if (response.status >= 500 || response.status === 408) {
          throw new TransientError(`YouVersion respondió ${response.status}`);
        }
        throw new YvError(`YouVersion respondió ${response.status}`, "error");
      } catch (error) {
        if (error instanceof YvError) throw error;
        lastError = error;
        if (attempt < this.maxAttempts) {
          await this.sleep(this.baseBackoffMs * 2 ** (attempt - 1));
        }
      } finally {
        clearTimeout(timer);
      }
    }
    const offline = !(lastError instanceof TransientError);
    throw new YvError(
      offline ? "Sin conexión con YouVersion" : "YouVersion no responde",
      offline ? "offline" : "error",
    );
  }

  private async fetchPaged<T>(base: string): Promise<T[]> {
    const items: T[] = [];
    let token = "";
    for (let page = 0; page < 20; page += 1) {
      const url = `${base}${base.includes("?") ? "&" : "?"}page_size=99${token ? `&page_token=${encodeURIComponent(token)}` : ""}`;
      const text = await this.request(url);
      if (!text) break;
      const body = JSON.parse(text) as { data?: T[]; next_page_token?: string };
      items.push(...(body.data ?? []));
      token = body.next_page_token ?? "";
      if (!token) break;
    }
    return items;
  }

  /**
   * Full Spanish catalog with licensing state, cached on disk.
   * The operator only *sees* the selected subset (defaults + user-added).
   */
  private async loadCatalog(force = false): Promise<{ versions: BibleVersionMeta[]; stale: boolean; error?: string }> {
    const cached = readJson<CachedVersions>(this.versionsFile());
    const ttl = cached?.versions.some((version) => version.locked) ? LOCKED_VERSIONS_TTL_MS : VERSIONS_TTL_MS;
    if (!force && cached && this.now() - cached.fetchedAt < ttl) {
      return { versions: cached.versions, stale: false };
    }
    try {
      const [catalog, licensed, licenses] = await Promise.all([
        this.fetchPaged<YvBible>("/bibles?language_ranges[]=es&all_available=true"),
        this.fetchPaged<YvBible>("/bibles?language_ranges[]=es"),
        this.fetchPaged<YvLicense>("/licenses?all_available=true"),
      ]);
      const versions = buildOnlineVersions(catalog, new Set(licensed.map((bible) => bible.id)), licenses);
      writeJsonAtomic(this.versionsFile(), { fetchedAt: this.now(), versions } satisfies CachedVersions);
      return { versions, stale: false };
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo leer YouVersion";
      if (cached) return { versions: cached.versions, stale: true, error: message };
      return { versions: [], stale: false, error: message };
    }
  }

  /** Selected online list (defaults + versions the user added). */
  async listVersions(force = false): Promise<OnlineVersionsResult> {
    if (!this.configured) return { configured: false, versions: [], stale: false };
    const catalog = await this.loadCatalog(force);
    return {
      configured: true,
      versions: this.toListed(catalog.versions),
      stale: catalog.stale,
      error: catalog.error,
    };
  }

  /**
   * Search the cached Spanish catalog by name, abbreviation or language.
   * Does not hit the network per keystroke; refreshes the catalog only when stale/missing.
   */
  async searchVersions(query: string): Promise<OnlineSearchResult> {
    const normalized = String(query ?? "").trim();
    if (!this.configured) return { configured: false, query: normalized, hits: [], stale: false };
    const catalog = await this.loadCatalog(false);
    return {
      configured: true,
      query: normalized,
      hits: searchOnlineCatalog(catalog.versions, normalized, this.selectedIdSet()),
      stale: catalog.stale,
      error: catalog.error,
    };
  }

  /** Persist a catalog version into the user's online list. */
  async addVersion(lumenId: string): Promise<OnlineVersionsResult> {
    if (!this.configured) return { configured: false, versions: [], stale: false };
    const numeric = parseYvVersionId(String(lumenId ?? ""));
    if (numeric === null) throw new YvError("Versión en línea no válida", "error");
    const catalog = await this.loadCatalog(false);
    if (!catalog.versions.some((version) => version.id === yvVersionId(numeric))) {
      throw new YvError("Esa versión no está en el catálogo de YouVersion", "not-found");
    }
    this.writeCustomIds([...this.readCustomIds(), numeric]);
    return {
      configured: true,
      versions: this.toListed(catalog.versions),
      stale: catalog.stale,
      error: catalog.error,
    };
  }

  /** Remove a user-added version (defaults cannot be removed). */
  async removeVersion(lumenId: string): Promise<OnlineVersionsResult> {
    if (!this.configured) return { configured: false, versions: [], stale: false };
    const numeric = parseYvVersionId(String(lumenId ?? ""));
    if (numeric === null) throw new YvError("Versión en línea no válida", "error");
    this.writeCustomIds(this.readCustomIds().filter((id) => id !== numeric));
    const catalog = await this.loadCatalog(false);
    return {
      configured: true,
      versions: this.toListed(catalog.versions),
      stale: catalog.stale,
      error: catalog.error,
    };
  }

  /** One chapter: fresh disk cache, else network (stale cache if the network fails). */
  getChapter(lumenVersionId: string, book: string, chapter: number): Promise<ChapterResult> {
    const key = `${lumenVersionId}/${book}.${chapter}`;
    const running = this.inflight.get(key);
    if (running) return running;
    const task = this.loadChapter(lumenVersionId, book, chapter).finally(() => this.inflight.delete(key));
    this.inflight.set(key, task);
    return task;
  }

  /** Verses plus the publisher's attribution, which must be shown with the text. */
  private async loadChapter(lumenVersionId: string, book: string, chapter: number): Promise<ChapterResult> {
    const verses = await this.loadVerses(lumenVersionId, book, chapter);
    if (!verses.ok) return verses;
    try {
      const copyright = await this.attribution(parseYvVersionId(lumenVersionId) as number);
      return { ...verses, copyright };
    } catch (error) {
      // The chapter is already on disk; without attribution it must not be shown.
      return this.failure(error);
    }
  }

  private failure(error: unknown): ChapterResult {
    if (error instanceof YvError) {
      return { ok: false, reason: error.reason, message: error.message, retryAfterSec: error.retryAfterSec };
    }
    return { ok: false, reason: "error", message: error instanceof Error ? error.message : "Error de YouVersion" };
  }

  /**
   * Attribution of one version (`copyright`, else `promotional_content`, else a
   * generic line naming the version when the publisher gave none, as for
   * public-domain RVES). Cached 7 days; a stale copy is used when offline.
   */
  async attribution(numeric: number): Promise<string> {
    const file = path.join(this.options.cacheDir, String(numeric), "version.json");
    const cached = readJson<CachedAttribution>(file);
    if (cached && (this.now() - cached.fetchedAt < VERSIONS_TTL_MS || !this.configured)) return cached.copyright;
    if (!this.configured) throw new YvError("Esta compilación no incluye la clave de YouVersion", "error");
    try {
      const text = await this.request(`/bibles/${numeric}`);
      const info = JSON.parse(text) as YvBible;
      const copyright = attributionFor(info) || fallbackAttribution(info);
      writeJsonAtomic(file, { fetchedAt: this.now(), copyright } satisfies CachedAttribution);
      return copyright;
    } catch (error) {
      if (cached) return cached.copyright;
      throw error;
    }
  }

  private async loadVerses(lumenVersionId: string, book: string, chapter: number): Promise<ChapterResult> {
    const numeric = parseYvVersionId(lumenVersionId);
    if (numeric === null || !/^[1-3A-Z]{3}$/.test(book) || !Number.isInteger(chapter) || chapter < 1 || chapter > 150) {
      return { ok: false, reason: "error", message: "Referencia no válida" };
    }
    const file = this.chapterFile(numeric, book, chapter);
    const cached = readJson<CachedChapter>(file);
    if (cached && this.now() - cached.fetchedAt < CHAPTER_TTL_MS) {
      return { ok: true, verses: cached.verses, fromCache: true, stale: false, copyright: "" };
    }
    if (!this.configured) {
      if (cached) return { ok: true, verses: cached.verses, fromCache: true, stale: true, copyright: "" };
      return { ok: false, reason: "no-key", message: "Esta compilación no incluye la clave de YouVersion" };
    }
    try {
      const text = await this.request(`/bibles/${numeric}/passages/${book}.${chapter}?format=html`);
      const body = JSON.parse(text) as { content?: string };
      const verses = parseChapterContent(String(body.content ?? ""));
      if (Object.keys(verses).length === 0) {
        throw new YvError("YouVersion devolvió un capítulo vacío", "error");
      }
      writeJsonAtomic(file, { fetchedAt: this.now(), verses } satisfies CachedChapter);
      return { ok: true, verses, fromCache: false, stale: false, copyright: "" };
    } catch (error) {
      if (cached) return { ok: true, verses: cached.verses, fromCache: true, stale: true, copyright: "" };
      return this.failure(error);
    }
  }
}

class TransientError extends Error {}
