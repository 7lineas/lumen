import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "./types";

describe("media fit defaults", () => {
  it("keeps background media covering the screen (as before)", () => {
    expect(DEFAULT_SETTINGS.backgroundFit).toBe("cover");
  });

  it("shows whole slides by default (as before)", () => {
    expect(DEFAULT_SETTINGS.slideFit).toBe("contain");
  });

  it("older stored settings without the new keys fall back to the defaults", () => {
    const merged = { ...DEFAULT_SETTINGS, ...({ fontSize: 80 } as Partial<typeof DEFAULT_SETTINGS>) };
    expect(merged.backgroundFit).toBe("cover");
    expect(merged.slideFit).toBe("contain");
  });
});
