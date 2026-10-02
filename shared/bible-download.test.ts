import { describe, expect, it } from "vitest";
import {
  describeLibrary,
  downloadAndInstall,
  HashMismatchError,
  parseCatalog,
  sha256Hex,
  type BibleCatalog,
  type FetchLike,
} from "./bible-download";

const payload = new TextEncoder().encode('{"meta":{"id":"bes"},"verses":{}}');
const goodHash = sha256Hex(payload);
const badHash = "ab".repeat(32);

function okResponse(): Awaited<ReturnType<FetchLike>> {
  return {
    ok: true,
    status: 200,
    headers: { get: () => String(payload.byteLength) },
    arrayBuffer: async () =>
      payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength),
  };
}

const catalog: BibleCatalog = {
  format: "proyector-bible-json-v1",
  baseUrl: "https://downloads.7lineas.com/bibles",
  extensionNote: "archivo y entrada",
  versions: [
    {
      id: "bes",
      name: "Biblia en Español Sencillo",
      language: "Español",
      file: "bes.json",
      bytes: 10,
      sha256: goodHash,
      license: "CC BY 4.0",
      attribution: "AudioBiblia.org",
      copyright: "CC BY 4.0",
      abbr: "BES",
      draft: false,
    },
  ],
};

describe("downloadAndInstall", () => {
  it("writes the file when the SHA-256 matches", async () => {
    const writes: Uint8Array[] = [];
    const result = await downloadAndInstall({
      url: "https://downloads.7lineas.com/bibles/bes.json",
      expectedSha256: goodHash.toUpperCase(),
      fetchImpl: async () => okResponse(),
      write: (bytes) => {
        writes.push(bytes);
      },
      retryDelayMs: 0,
    });
    expect(result.sha256).toBe(goodHash);
    expect(writes).toHaveLength(1);
    expect(sha256Hex(writes[0]!)).toBe(goodHash);
  });

  it("does not write when the SHA-256 is wrong", async () => {
    const writes: Uint8Array[] = [];
    let calls = 0;
    await expect(
      downloadAndInstall({
        url: "https://downloads.7lineas.com/bibles/bes.json",
        expectedSha256: badHash,
        fetchImpl: async () => {
          calls += 1;
          return okResponse();
        },
        write: (bytes) => {
          writes.push(bytes);
        },
        maxAttempts: 2,
        retryDelayMs: 0,
      }),
    ).rejects.toBeInstanceOf(HashMismatchError);
    expect(writes).toHaveLength(0);
    expect(calls).toBe(2);
  });

  it("retries after a connection failure and then installs", async () => {
    const writes: Uint8Array[] = [];
    const attempts: number[] = [];
    let calls = 0;
    const result = await downloadAndInstall({
      url: "https://downloads.7lineas.com/bibles/bes.json",
      expectedSha256: goodHash,
      fetchImpl: async () => {
        calls += 1;
        if (calls < 3) throw new TypeError("fetch failed");
        return okResponse();
      },
      write: (bytes) => {
        writes.push(bytes);
      },
      onProgress: (progress) => attempts.push(progress.attempt),
      retryDelayMs: 0,
    });
    expect(result.bytes).toBe(payload.byteLength);
    expect(writes).toHaveLength(1);
    expect(calls).toBe(3);
    expect(attempts).toContain(3);
  });

  it("fails offline and does not install", async () => {
    const writes: Uint8Array[] = [];
    await expect(
      downloadAndInstall({
        url: "https://downloads.7lineas.com/bibles/bes.json",
        expectedSha256: goodHash,
        fetchImpl: async () => {
          throw new TypeError("network down");
        },
        write: (bytes) => {
          writes.push(bytes);
        },
        maxAttempts: 3,
        retryDelayMs: 0,
      }),
    ).rejects.toThrow(/Sin conexión/);
    expect(writes).toHaveLength(0);
  });
});

describe("parseCatalog", () => {
  it("drops path traversal and keeps a valid entry on the fixed host", () => {
    const parsed = parseCatalog({
      extensionNote: "solo datos",
      versions: [
        { ...catalog.versions[0], file: "../bes.json" },
        catalog.versions[0],
      ],
    });
    expect(parsed?.versions.map((version) => version.id)).toEqual(["bes"]);
    expect(parsed?.baseUrl).toBe("https://downloads.7lineas.com/bibles");
    expect(parsed?.extensionNote).toBe("solo datos");
  });
});

describe("describeLibrary", () => {
  it("keeps bundled editions installed and marks downloads", () => {
    const view = describeLibrary({
      bundled: [
        {
          id: "rv1909",
          name: "Reina-Valera 1909",
          abbr: "RV1909",
          language: "Español",
          bytes: 100,
          license: "Dominio público",
          attribution: "eBible",
          copyright: "Dominio público",
          draft: false,
        },
      ],
      catalog,
      installedIds: new Set(["bes"]),
      catalogSource: "bundled",
    });
    expect(view.offline).toBe(true);
    expect(view.entries.map((entry) => [entry.id, entry.availability])).toEqual([
      ["rv1909", "included"],
      ["bes", "installed"],
    ]);
  });

  it("lists a catalog edition as available when it is not on disk", () => {
    const view = describeLibrary({
      bundled: [],
      catalog,
      installedIds: new Set(),
      catalogSource: "remote",
    });
    expect(view.offline).toBe(false);
    expect(view.entries[0]?.availability).toBe("available");
  });
});
