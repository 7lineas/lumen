import { describe, expect, it } from "vitest";
import { isUpdaterSupported } from "./updater";

describe("isUpdaterSupported", () => {
  it("supports packaged Windows installs", () => {
    expect(isUpdaterSupported("win32", true, false)).toBe(true);
  });

  it("falls back for portable, dev and other platforms", () => {
    expect(isUpdaterSupported("win32", true, true)).toBe(false);
    expect(isUpdaterSupported("win32", false, false)).toBe(false);
    expect(isUpdaterSupported("darwin", true, false)).toBe(false);
    expect(isUpdaterSupported("linux", true, false)).toBe(false);
  });
});
