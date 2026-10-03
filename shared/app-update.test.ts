import { describe, expect, it } from "vitest";
import { compareVersions, isNewerVersion, UPDATE_FEED_URL } from "./app-update";

describe("app-update", () => {
  it("points at the downloads bucket", () => {
    expect(UPDATE_FEED_URL).toBe("https://downloads.7lineas.com");
  });

  it("compares versions", () => {
    expect(compareVersions("1.0.2", "1.0.2")).toBe(0);
    expect(compareVersions("1.0.3", "1.0.2")).toBe(1);
    expect(compareVersions("1.0.2", "1.0.3")).toBe(-1);
    expect(compareVersions("1.10.0", "1.9.9")).toBe(1);
    expect(compareVersions("2.0.0", "1.99.99")).toBe(1);
  });

  it("detects newer releases", () => {
    expect(isNewerVersion("1.0.2", "1.0.3")).toBe(true);
    expect(isNewerVersion("1.0.2", "1.0.2")).toBe(false);
    expect(isNewerVersion("1.0.3", "1.0.2")).toBe(false);
    expect(isNewerVersion("", "1.0.3")).toBe(false);
  });
});
