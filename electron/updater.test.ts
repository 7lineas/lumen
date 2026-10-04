import { describe, expect, it } from "vitest";
import { pickManualDownload, resolveUpdateMode, safeDownloadUrl } from "./updater";

describe("resolveUpdateMode", () => {
  it("updates packaged Windows installs automatically", () => {
    expect(resolveUpdateMode({ platform: "win32", packaged: true, portable: false })).toBe("auto");
  });

  it("only notifies on the portable build", () => {
    expect(resolveUpdateMode({ platform: "win32", packaged: true, portable: true })).toBe("manual");
  });

  it("is disabled in development and on other platforms", () => {
    expect(resolveUpdateMode({ platform: "win32", packaged: false, portable: false })).toBe("disabled");
    expect(resolveUpdateMode({ platform: "darwin", packaged: true, portable: false })).toBe("disabled");
    expect(resolveUpdateMode({ platform: "linux", packaged: true, portable: false })).toBe("disabled");
  });

  it("allows a test feed only when unpackaged", () => {
    expect(resolveUpdateMode({ platform: "darwin", packaged: false, portable: false, devFeed: "http://127.0.0.1:9" })).toBe("auto");
    expect(resolveUpdateMode({ platform: "darwin", packaged: true, portable: false, devFeed: "http://127.0.0.1:9" })).toBe("disabled");
  });
});

describe("safeDownloadUrl", () => {
  it("accepts only https URLs from the downloads bucket", () => {
    expect(safeDownloadUrl("https://downloads.7lineas.com/lumen-1.0.7-setup.exe")).toBe("https://downloads.7lineas.com/lumen-1.0.7-setup.exe");
    expect(safeDownloadUrl("http://downloads.7lineas.com/a.exe")).toBeNull();
    expect(safeDownloadUrl("https://evil.example.com/a.exe")).toBeNull();
    expect(safeDownloadUrl("https://downloads.7lineas.com/../a.exe")).toBeNull();
    expect(safeDownloadUrl("https://downloads.7lineas.com.evil.com/a.exe")).toBeNull();
  });
});

describe("pickManualDownload", () => {
  const manifest = {
    version: "1.0.7",
    files: [
      { id: "setup", filename: "lumen-1.0.7-setup.exe" },
      { id: "portable", filename: "lumen-1.0.7-portable.exe" },
    ],
  };

  it("picks the portable file for the portable build", () => {
    expect(pickManualDownload(manifest, true)).toEqual({ version: "1.0.7", url: "https://downloads.7lineas.com/lumen-1.0.7-portable.exe" });
    expect(pickManualDownload(manifest, false)?.url).toBe("https://downloads.7lineas.com/lumen-1.0.7-setup.exe");
  });

  it("rejects incomplete manifests and unsafe file names", () => {
    expect(pickManualDownload({ files: manifest.files }, true)).toBeNull();
    expect(pickManualDownload({ version: "1.0.7", files: [] }, true)).toBeNull();
    expect(pickManualDownload({ version: "1.0.7", files: [{ id: "portable", filename: "../x.exe" }] }, true)).toBeNull();
  });
});
