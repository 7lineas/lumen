import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { sha256Hex } from "../shared/bible-download";
import {
  buildLibraryView,
  downloadModule,
  listSelectableVersions,
  readCatalogFile,
  removeModule,
  resolveCatalog,
  resolveModulePath,
} from "./bible-library";

const dirs: string[] = [];

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "biblias-"));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function writeModule(dir: string, id: string, text = "En el principio"): { sha256: string; bytes: number } {
  const body = Buffer.from(
    JSON.stringify({
      meta: { id, name: id, abbr: id.toUpperCase(), language: "es", copyright: "Prueba" },
      verses: { GEN: { "1": { "1": text } } },
      searchIndex: [],
    }),
  );
  fs.writeFileSync(path.join(dir, `${id}.json`), body);
  return { sha256: sha256Hex(body), bytes: body.byteLength };
}

function seed(root: string) {
  const bibles = path.join(root, "bibles");
  const modules = path.join(root, "modules");
  const user = path.join(root, "user");
  fs.mkdirSync(bibles, { recursive: true });
  fs.mkdirSync(modules, { recursive: true });
  fs.writeFileSync(
    path.join(bibles, "manifest.json"),
    JSON.stringify([{ id: "rv1909", name: "Reina-Valera 1909", abbr: "RV1909", language: "es" }]),
  );
  fs.writeFileSync(path.join(bibles, "rv1909.json"), "{}");
  const bes = writeModule(modules, "bes");
  const catalog = {
    format: "proyector-bible-json-v1",
    baseUrl: "https://downloads.7lineas.com/bibles",
    extensionNote: "archivo y entrada",
    versions: [
      {
        id: "bes",
        name: "Biblia en Español Sencillo",
        language: "Español",
        file: "bes.json",
        bytes: bes.bytes,
        sha256: bes.sha256,
        license: "CC BY 4.0",
        attribution: "Prueba",
        copyright: "Prueba",
        abbr: "BES",
        draft: false,
      },
    ],
  };
  const catalogFile = path.join(modules, "bibles-catalog.json");
  fs.writeFileSync(catalogFile, JSON.stringify(catalog));
  return { bibles, modules, user, catalogFile, besBody: fs.readFileSync(path.join(modules, "bes.json")) };
}

describe("bible library", () => {
  it("uses the bundled catalog when the network fails", async () => {
    const root = tempDir();
    const seeded = seed(root);
    const view = await buildLibraryView(seeded.bibles, seeded.user, seeded.catalogFile, async () => {
      throw new Error("offline");
    });
    expect(view.offline).toBe(true);
    expect(view.entries.map((entry) => entry.availability)).toEqual(["included", "available"]);
    expect(view.entries[0]?.id).toBe("rv1909");
  });

  it("installs a matching download and then removes it", async () => {
    const root = tempDir();
    const seeded = seed(root);
    const catalog = readCatalogFile(seeded.catalogFile);
    await downloadModule({
      catalog,
      id: "bes",
      userDir: seeded.user,
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        arrayBuffer: async () =>
          seeded.besBody.buffer.slice(
            seeded.besBody.byteOffset,
            seeded.besBody.byteOffset + seeded.besBody.byteLength,
          ),
      }),
    });
    expect(resolveModulePath(seeded.bibles, seeded.user, "bes")).toContain("bes.json");
    expect(listSelectableVersions(seeded.bibles, seeded.user).map((version) => version.id)).toEqual([
      "rv1909",
      "bes",
    ]);
    removeModule(seeded.user, new Set(["rv1909"]), "bes");
    expect(listSelectableVersions(seeded.bibles, seeded.user).map((version) => version.id)).toEqual(["rv1909"]);
  });

  it("does not install a file with the wrong hash", async () => {
    const root = tempDir();
    const seeded = seed(root);
    const catalog = readCatalogFile(seeded.catalogFile);
    catalog.versions[0]!.sha256 = "ab".repeat(32);
    await expect(
      downloadModule({
        catalog,
        id: "bes",
        userDir: seeded.user,
        fetchImpl: async () => ({
          ok: true,
          status: 200,
          arrayBuffer: async () =>
            seeded.besBody.buffer.slice(
              seeded.besBody.byteOffset,
              seeded.besBody.byteOffset + seeded.besBody.byteLength,
            ),
        }),
        maxAttempts: 1,
        retryDelayMs: 0,
      }),
    ).rejects.toThrow(/SHA-256/);
    expect(fs.existsSync(path.join(seeded.user, "bes.json"))).toBe(false);
  });

  it("refuses to remove a bundled version", () => {
    const root = tempDir();
    const seeded = seed(root);
    expect(() => removeModule(seeded.user, new Set(["rv1909"]), "rv1909")).toThrow(/programa/);
  });

  it("keeps the bundled catalog when the remote payload is empty", async () => {
    const root = tempDir();
    const seeded = seed(root);
    const bundled = readCatalogFile(seeded.catalogFile);
    const resolved = await resolveCatalog(bundled, async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => new TextEncoder().encode('{"versions":[]}').buffer,
    }));
    expect(resolved.source).toBe("bundled");
    expect(resolved.catalog.versions).toHaveLength(1);
  });
});
