import { describe, expect, it } from "vitest";
import { isPdfPath, isUnsupportedPresentationPath, slideLabel } from "./slide-deck";

describe("slide-deck helpers", () => {
  it("detects formats that need exporting to PDF/PPTX", () => {
    for (const file of ["a.key", "a.PPT", "a.odp", "a.pps", "a.otp", "a.pot"]) {
      expect(isUnsupportedPresentationPath(file)).toBe(true);
    }
    for (const file of ["a.pptx", "a.ppsx", "a.pdf", "a.png"]) {
      expect(isUnsupportedPresentationPath(file)).toBe(false);
    }
  });

  it("recognises pdf paths", () => {
    expect(isPdfPath("/x/Deck.PDF")).toBe(true);
    expect(isPdfPath("/x/deck.pptx")).toBe(false);
  });

  it("labels slides starting at 1", () => {
    expect(slideLabel(0)).toBe("Diapositiva 1");
    expect(slideLabel(9)).toBe("Diapositiva 10");
  });
});
