import { describe, it, expect } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { buildBibleDataCandidates, resolveBibleDataDir } from "./bible-data-path";

describe("resolveBibleDataDir", () => {
  it("picks the first directory that contains manifest.json", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pb-bibles-"));
    const wrong = path.join(tmp, "wrong");
    const right = path.join(tmp, "right");
    fs.mkdirSync(wrong);
    fs.mkdirSync(right);
    fs.writeFileSync(path.join(right, "manifest.json"), "[]");

    const dir = resolveBibleDataDir([wrong, right]);
    expect(dir).toBe(right);
  });

  it("builds standard candidate order", () => {
    const list = buildBibleDataCandidates("/res", "/app", "/app/dist-electron", "/cwd");
    expect(list[0]).toBe("/res/data/bibles");
    expect(list[1]).toBe("/app/data/bibles");
  });
});
