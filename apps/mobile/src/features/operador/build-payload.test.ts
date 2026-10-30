import { describe, expect, it } from "vitest";
import type { AppSettings } from "@shared/types";
import { DEFAULT_SETTINGS } from "@shared/types";
import { buildBlankPayload, buildVersePayload } from "./build-payload";

const settings: AppSettings = { ...DEFAULT_SETTINGS };

describe("buildVersePayload", () => {
  it("carries the verse text and maps the accent to both labels", () => {
    const payload = buildVersePayload(settings, {
      referenceLabel: "Juan 3:16 — RV1909",
      blocks: [{ text: "Porque de tal manera amó Dios al mundo" }],
    });
    expect(payload.mode).toBe("verse");
    expect(payload.referenceLabel).toBe("Juan 3:16 — RV1909");
    expect(payload.blocks).toHaveLength(1);
    expect(payload.referenceColor).toBe(settings.accentColor);
    expect(payload.versionColor).toBe(settings.accentColor);
    expect(payload.fontSize).toBe(settings.fontSize);
  });
});

describe("buildBlankPayload", () => {
  it("blanks the projector without content", () => {
    const payload = buildBlankPayload(settings);
    expect(payload.mode).toBe("blank");
    expect(payload.blocks).toEqual([]);
    expect(payload.referenceLabel).toBe("");
    expect(payload.backgroundColor).toBe(settings.backgroundColor);
  });
});
