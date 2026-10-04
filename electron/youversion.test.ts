import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CHAPTER_TTL_MS, YouVersionClient, resolveAppKey, type FetchLike } from "./youversion";

type Reply = { status: number; body?: unknown; headers?: Record<string, string> } | Error;

const JHN3 =
  '<div class="p"><span class="yv-v" v="1"></span><span class="yv-vlbl">1</span>Había un hombre.</div>' +
  '<div class="p"><span class="yv-v" v="2"></span><span class="yv-vlbl">2</span>Este vino a Jesús.</div>';

const INFO: Reply = { status: 200, body: { id: 147, abbreviation: "RVES", title: "Reina-Valera Antigua", copyright: "© Test" } };

let dir: string;
let clock: number;
let sleeps: number[];
let calls: Array<{ url: string; key?: string }>;
let replies: Reply[];
/** When set, answers by URL (the three list requests run interleaved). */
let router: ((url: string) => Reply) | null;

const fetchImpl: FetchLike = async (url, init) => {
  calls.push({ url, key: init?.headers?.["X-YVP-App-Key"] });
  const reply = router ? router(url) : replies.shift();
  if (!reply) throw new Error("no more replies");
  if (reply instanceof Error) throw reply;
  const headers = reply.headers ?? {};
  return {
    status: reply.status,
    ok: reply.status >= 200 && reply.status < 300,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    text: async () => (typeof reply.body === "string" ? reply.body : JSON.stringify(reply.body ?? "")),
  };
};

function client(overrides: { appKey?: string } = {}) {
  return new YouVersionClient({
    appKey: overrides.appKey ?? "test-key",
    cacheDir: dir,
    fetchImpl,
    now: () => clock,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    baseBackoffMs: 100,
    maxAttempts: 3,
  });
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "lumen-yvp-"));
  clock = 1_700_000_000_000;
  sleeps = [];
  calls = [];
  replies = [];
  router = null;
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("resolveAppKey", () => {
  it("prefers the runtime environment and trims", () => {
    expect(resolveAppKey({ YVP_APP_KEY: "  abc " } as NodeJS.ProcessEnv)).toBe("abc");
    expect(resolveAppKey({} as NodeJS.ProcessEnv)).toBe("");
  });
});

describe("getChapter", () => {
  it("fetches html, parses verses, sends the key and caches on disk", async () => {
    replies = [{ status: 200, body: { id: 147, content: JHN3, reference: "Juan 3" } }, INFO];
    const result = await client().getChapter("yv-147", "JHN", 3);
    expect(result).toEqual({
      ok: true,
      verses: { "1": "Había un hombre.", "2": "Este vino a Jesús." },
      fromCache: false,
      stale: false,
      copyright: "© Test",
    });
    expect(calls[1].url).toBe("https://api.youversion.com/v1/bibles/147");
    expect(calls[0].url).toBe("https://api.youversion.com/v1/bibles/147/passages/JHN.3?format=html");
    expect(calls[0].key).toBe("test-key");
    expect(fs.existsSync(path.join(dir, "147", "JHN.3.json"))).toBe(true);
  });

  it("serves a fresh cache without touching the network (also with another client)", async () => {
    replies = [{ status: 200, body: { content: JHN3 } }, INFO];
    await client().getChapter("yv-147", "JHN", 3);
    const again = await client().getChapter("yv-147", "JHN", 3);
    expect(again).toMatchObject({ ok: true, fromCache: true, stale: false, copyright: "© Test" });
    expect(calls).toHaveLength(2);
  });

  it("refreshes an expired cache and falls back to it when offline", async () => {
    replies = [{ status: 200, body: { content: JHN3 } }, INFO];
    await client().getChapter("yv-147", "JHN", 3);
    clock += CHAPTER_TTL_MS + 1;
    replies = Array.from({ length: 6 }, () => new TypeError("fetch failed"));
    const result = await client().getChapter("yv-147", "JHN", 3);
    expect(result).toMatchObject({ ok: true, fromCache: true, stale: true, copyright: "© Test" });
    expect(result.ok && result.verses["1"]).toBe("Había un hombre.");
  });

  it("reports offline when nothing is cached, after retrying with exponential backoff", async () => {
    replies = [new TypeError("x"), new TypeError("x"), new TypeError("x")];
    const result = await client().getChapter("yv-147", "JHN", 3);
    expect(result).toMatchObject({ ok: false, reason: "offline" });
    expect(calls).toHaveLength(3);
    expect(sleeps).toEqual([100, 200]);
  });

  it("retries 5xx and then succeeds", async () => {
    replies = [{ status: 503 }, { status: 502 }, { status: 200, body: { content: JHN3 } }, INFO];
    const result = await client().getChapter("yv-147", "JHN", 3);
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(4);
    expect(sleeps).toEqual([100, 200]);
  });

  it("gives up on persistent 5xx as an error, not offline", async () => {
    replies = [{ status: 500 }, { status: 500 }, { status: 500 }];
    expect(await client().getChapter("yv-147", "JHN", 3)).toMatchObject({ ok: false, reason: "error" });
  });

  it("waits a short Retry-After and retries", async () => {
    replies = [{ status: 429, headers: { "retry-after": "2" } }, { status: 200, body: { content: JHN3 } }, INFO];
    const result = await client().getChapter("yv-147", "JHN", 3);
    expect(result.ok).toBe(true);
    expect(sleeps).toEqual([2000]);
  });

  it("fails fast on a long Retry-After and blocks further calls until it passes", async () => {
    replies = [{ status: 429, headers: { "retry-after": "300" } }];
    const yv = client();
    const first = await yv.getChapter("yv-147", "JHN", 3);
    expect(first).toMatchObject({ ok: false, reason: "rate-limited", retryAfterSec: 300 });
    expect(sleeps).toEqual([]);
    const second = await yv.getChapter("yv-147", "JHN", 4);
    expect(second).toMatchObject({ ok: false, reason: "rate-limited" });
    expect(calls).toHaveLength(1);
    clock += 301_000;
    replies = [{ status: 200, body: { content: JHN3 } }, INFO];
    expect((await yv.getChapter("yv-147", "JHN", 4)).ok).toBe(true);
  });

  it("maps 403 to locked and 404 to not-found without retrying", async () => {
    replies = [{ status: 403 }];
    expect(await client().getChapter("yv-128", "JHN", 3)).toMatchObject({ ok: false, reason: "locked" });
    replies = [{ status: 404 }];
    expect(await client().getChapter("yv-147", "JHN", 99)).toMatchObject({ ok: false, reason: "not-found" });
    expect(calls).toHaveLength(2);
  });

  it("rejects bad references and local ids without calling the API", async () => {
    const yv = client();
    expect(await yv.getChapter("rv1909", "JHN", 3)).toMatchObject({ ok: false });
    expect(await yv.getChapter("yv-147", "../x", 3)).toMatchObject({ ok: false });
    expect(await yv.getChapter("yv-147", "JHN", 0)).toMatchObject({ ok: false });
    expect(calls).toHaveLength(0);
  });

  it("without a key it never calls the API but still serves the cache", async () => {
    replies = [{ status: 200, body: { content: JHN3 } }, INFO];
    await client().getChapter("yv-147", "JHN", 3);
    const keyless = client({ appKey: "" });
    expect(await keyless.getChapter("yv-147", "JHN", 4)).toMatchObject({ ok: false, reason: "no-key" });
    expect(await keyless.getChapter("yv-147", "JHN", 3)).toMatchObject({ ok: true, fromCache: true });
    expect(calls).toHaveLength(2);
  });

  it("treats a chapter without verse markers as an error and does not cache it", async () => {
    replies = [{ status: 200, body: { content: "<p>nada</p>" } }];
    expect(await client().getChapter("yv-147", "JHN", 3)).toMatchObject({ ok: false, reason: "error" });
    expect(fs.existsSync(path.join(dir, "147", "JHN.3.json"))).toBe(false);
  });

  it("uses a generic attribution when the publisher gave none (public domain RVES)", async () => {
    replies = [
      { status: 200, body: { content: JHN3 } },
      { status: 200, body: { id: 147, abbreviation: "RVES", title: "Reina-Valera Antigua", copyright: null, promotional_content: null } },
    ];
    const result = await client().getChapter("yv-147", "JHN", 3);
    expect(result).toMatchObject({ ok: true, copyright: "Reina-Valera Antigua (RVES) · YouVersion Platform" });
  });

  it("does not return text without attribution, but keeps the chapter on disk for the retry", async () => {
    replies = [{ status: 200, body: { content: JHN3 } }, { status: 403 }];
    expect(await client().getChapter("yv-147", "JHN", 3)).toMatchObject({ ok: false, reason: "locked" });
    expect(fs.existsSync(path.join(dir, "147", "JHN.3.json"))).toBe(true);
    replies = [INFO];
    expect(await client().getChapter("yv-147", "JHN", 3)).toMatchObject({ ok: true, fromCache: true, copyright: "© Test" });
  });

  it("shares one request between concurrent calls for the same chapter", async () => {
    replies = [{ status: 200, body: { content: JHN3 } }, INFO];
    const yv = client();
    const [a, b] = await Promise.all([yv.getChapter("yv-147", "JHN", 3), yv.getChapter("yv-147", "JHN", 3)]);
    expect(a.ok && b.ok).toBe(true);
    expect(calls).toHaveLength(2);
  });
});

describe("listVersions", () => {
  const bible = (id: number, abbreviation: string) => ({ id, abbreviation, title: `Biblia ${abbreviation}` });
  const page = (data: unknown[], next?: string) => ({ status: 200, body: { data, next_page_token: next } });

  it("merges catalog, licensed ids and licenses, follows pagination and caches", async () => {
    router = (url) => {
      if (url.includes("/licenses")) return page([{ id: 2, name: "Biblica Fast-track", bible_ids: [128] }]);
      if (url.includes("all_available=true")) {
        return url.includes("page_token=tok") ? page([bible(147, "RVES")]) : page([bible(128, "NVI-S")], "tok");
      }
      return page([bible(147, "RVES")]);
    };
    const yv = client();
    const result = await yv.listVersions();
    expect(result.configured).toBe(true);
    expect(result.versions.map((v) => [v.id, !!v.locked])).toEqual([
      ["yv-128", true],
      ["yv-147", false],
    ]);
    expect(result.versions[0].lockedReason).toContain("Biblica Fast-track");
    expect(calls.some((c) => c.url.includes("page_token=tok"))).toBe(true);
    expect(calls.every((c) => c.url.includes("language_ranges[]=es") || c.url.includes("/licenses"))).toBe(true);
    expect(calls.filter((c) => c.url.includes("all_available=true")).length).toBeGreaterThanOrEqual(2);
    const cached = await client().listVersions();
    expect(cached.versions).toHaveLength(2);
    expect(calls.length).toBe(4);
  });

  it("serves the stale list when the network fails", async () => {
    router = (url) => (url.includes("/licenses") ? page([]) : page([bible(147, "RVES")]));
    await client().listVersions();
    clock += 8 * 24 * 60 * 60 * 1000;
    router = () => new TypeError("offline");
    const result = await client().listVersions();
    expect(result.stale).toBe(true);
    expect(result.versions).toHaveLength(1);
    expect(result.error).toBeTruthy();
  });

  it("reports not configured without a key", async () => {
    expect(await client({ appKey: "" }).listVersions()).toEqual({ configured: false, versions: [], stale: false });
    expect(calls).toHaveLength(0);
  });
});
