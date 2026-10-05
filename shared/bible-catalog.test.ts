import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BIBLES_DOWNLOAD_BASE } from "./bible-download";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(fs.readFileSync(path.join(root, "data/bible-modules/bibles-catalog.json"), "utf8"));
const licenses = JSON.parse(fs.readFileSync(path.join(root, "shared/bible-licenses.json"), "utf8"));

const EXPECTED = ["bes", "onbv", "pddpt"];
const FORBIDDEN = ["rvg", "sparvg", "rvr1960", "nvi", "ntv", "dhh", "tla", "rvc", "lbla", "nblh"];

describe("bibles catalog", () => {
  it("lists only the approved free versions", () => {
    expect(catalog.baseUrl).toBe(BIBLES_DOWNLOAD_BASE);
    expect(catalog.versions.map((version: { id: string }) => version.id)).toEqual(EXPECTED);
    expect(catalog.extensionNote).toMatch(/sin cambiar el código/);
    const ids = [...catalog.versions, ...licenses.versions].map((version: { id: string }) => version.id);
    for (const id of FORBIDDEN) expect(ids).not.toContain(id);
    const onbv = catalog.versions.find((version: { id: string }) => version.id === "onbv");
    expect(onbv.copyright).toMatch(/Biblica® Open Nueva Biblia Viva™/);
    expect(onbv.copyright).toMatch(/2006, 2008 Biblica/);
    expect(onbv.license).toBe("CC BY-SA 4.0");
    for (const version of catalog.versions) {
      expect(version.file).toBe(`${version.id}.json`);
      expect(version.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(version.bytes).toBeGreaterThan(1_000_000);
      expect(version.attribution).toBeTruthy();
      expect(version.copyright).toBeTruthy();
      expect(version.license).toBeTruthy();
      expect(version.language).toBeTruthy();
    }
  });

  it("matches the SHA-256 of each generated module when the file is present", () => {
    for (const version of catalog.versions) {
      const file = path.join(root, "data/bible-modules", version.file);
      if (!fs.existsSync(file)) continue;
      const hash = createHash("sha256").update(fs.readFileSync(file)).digest("hex");
      expect(hash).toBe(version.sha256);
      expect(fs.statSync(file).size).toBe(version.bytes);
    }
  });

  it("keeps landing credits for bundled and downloadable versions", () => {
    const ids = licenses.versions.map((version: { id: string }) => version.id);
    expect(ids).toEqual(["rv1909", ...EXPECTED]);
    for (const version of licenses.versions) {
      expect(version.copyright).toBeTruthy();
      expect(version.attribution).toBeTruthy();
      expect(version.availability).toBeTruthy();
    }
    expect(licenses.excludedNote).toMatch(/Gómez/);
    expect(licenses.excludedNote).toMatch(/RVR1960/);
    expect(licenses.extensionNote).toMatch(/bibles-catalog\.json/);
  });
});
