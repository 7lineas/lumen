import fs from "fs";
import path from "path";
import {
  buildOnlineVersions,
  parseYvVersionId,
  type ChapterResult,
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
          throw new YvError("La licencia de esta versión no está aceptada en YouVersion Platform", "locked");
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

  /** Spanish catalog with licensing state. Cached on disk; stale cache is served when offline. */
  async listVersions(force = false): Promise<OnlineVersionsResult> {
    if (!this.configured) return { configured: false, versions: [], stale: false };
    const cached = readJson<CachedVersions>(this.versionsFile());
    if (!force && cached && this.now() - cached.fetchedAt < VERSIONS_TTL_MS) {
      return { configured: true, versions: cached.versions, stale: false };
    }
    try {
      const [catalog, licensed, licenses] = await Promise.all([
        this.fetchPaged<YvBible>("/bibles?language_ranges[]=es&all_available=true"),
        this.fetchPaged<YvBible>("/bibles?language_ranges[]=es"),
        this.fetchPaged<YvLicense>("/licenses?all_available=true"),
      ]);
      const versions = buildOnlineVersions(catalog, new Set(licensed.map((bible) => bible.id)), licenses);
      writeJsonAtomic(this.versionsFile(), { fetchedAt: this.now(), versions } satisfies CachedVersions);
      return { configured: true, versions, stale: false };
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo leer YouVersion";
      if (cached) return { configured: true, versions: cached.versions, stale: true, error: message };
      return { configured: true, versions: [], stale: false, error: message };
    }
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

  private async loadChapter(lumenVersionId: string, book: string, chapter: number): Promise<ChapterResult> {
    const numeric = parseYvVersionId(lumenVersionId);
    if (numeric === null || !/^[1-3A-Z]{3}$/.test(book) || !Number.isInteger(chapter) || chapter < 1 || chapter > 150) {
      return { ok: false, reason: "error", message: "Referencia no válida" };
    }
    const file = this.chapterFile(numeric, book, chapter);
    const cached = readJson<CachedChapter>(file);
    if (cached && this.now() - cached.fetchedAt < CHAPTER_TTL_MS) {
      return { ok: true, verses: cached.verses, fromCache: true, stale: false };
    }
    if (!this.configured) {
      if (cached) return { ok: true, verses: cached.verses, fromCache: true, stale: true };
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
      return { ok: true, verses, fromCache: false, stale: false };
    } catch (error) {
      if (cached) return { ok: true, verses: cached.verses, fromCache: true, stale: true };
      if (error instanceof YvError) {
        return { ok: false, reason: error.reason, message: error.message, retryAfterSec: error.retryAfterSec };
      }
      return { ok: false, reason: "error", message: error instanceof Error ? error.message : "Error de YouVersion" };
    }
  }
}

class TransientError extends Error {}
