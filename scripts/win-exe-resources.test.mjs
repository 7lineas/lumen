import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ICO_SIZES, buildIco } from "./build-icon.mjs";

const require = createRequire(import.meta.url);
const { applyWindowsResources, inspectExe, readIcoSizes } = require("./win-exe-resources.cjs");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ico = fs.readFileSync(path.join(root, "build", "icon.ico"));
// Small real PE (electron-builder's elevate.exe, MIT) used as a stand-in for Lumen.exe.
const sample = fs.readFileSync(path.join(root, "scripts", "fixtures", "sample-pe.bin"));

describe("build/icon.ico", () => {
  it("covers every size Windows asks for (taskbar 16/24/32/48, large 256)", () => {
    const sizes = readIcoSizes(ico);
    for (const size of [16, 24, 32, 48, 256]) expect(sizes).toContain(size);
    expect(sizes).toEqual(ICO_SIZES);
  });

  it("is what scripts/build-icon.mjs produces from build/icon.png", async () => {
    const rebuilt = await buildIco(path.join(root, "build", "icon.png"));
    expect(readIcoSizes(rebuilt)).toEqual(readIcoSizes(ico));
  });

  it("rejects things that are not icons", () => {
    expect(() => readIcoSizes(Buffer.from("not an icon at all"))).toThrow(/ico/);
  });
});

describe("applyWindowsResources", () => {
  it("puts our icon group and version info into an exe", () => {
    expect(inspectExe(sample).groups).toEqual([]);
    const out = applyWindowsResources(sample, {
      icoBuffer: ico,
      productName: "Lumen",
      version: "1.2.3",
      companyName: "7Lineas",
      originalFilename: "Lumen.exe",
    });
    const result = inspectExe(out);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].sizes).toEqual(readIcoSizes(ico));
    expect(result.strings).toMatchObject({
      ProductName: "Lumen",
      FileDescription: "Lumen",
      CompanyName: "7Lineas",
      FileVersion: "1.2.3",
      OriginalFilename: "Lumen.exe",
    });
    // Idempotent: a second pass leaves one group and the same strings.
    const again = inspectExe(applyWindowsResources(out, { icoBuffer: ico, productName: "Lumen", version: "1.2.3", companyName: "7Lineas" }));
    expect(again.groups).toHaveLength(1);
    expect(again.strings.ProductName).toBe("Lumen");
  });
});
