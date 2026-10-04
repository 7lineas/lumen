import { describe, expect, it } from "vitest";
import { isPdfPath, isSlideTextPath, isUnsupportedPresentationPath, reconcileSlides } from "./slide-deck";

describe("slide-deck helpers", () => {
  it("detects formats that need exporting to PDF/PPTX", () => {
    for (const file of ["a.key", "a.PPT", "a.odp", "a.pps", "a.otp", "a.pot"]) {
      expect(isUnsupportedPresentationPath(file)).toBe(true);
    }
    for (const file of ["a.pptx", "a.ppsx", "a.pdf", "a.png"]) {
      expect(isUnsupportedPresentationPath(file)).toBe(false);
    }
  });

  it("only treats txt/md/json as text decks", () => {
    expect(["a.txt", "a.MD", "a.json"].every(isSlideTextPath)).toBe(true);
    expect(["a.docx", "a.exe", "a"].some(isSlideTextPath)).toBe(false);
  });

  it("recognises pdf paths", () => {
    expect(isPdfPath("/x/Deck.PDF")).toBe(true);
    expect(isPdfPath("/x/deck.pptx")).toBe(false);
  });

  it("reconciles texts with the real page count", () => {
    expect(reconcileSlides(["Uno", "  ", "Tres"], 4)).toEqual(["Uno", "Diapositiva 2", "Tres", "Diapositiva 4"]);
    expect(reconcileSlides(["A", "B", "C"], 2)).toEqual(["A", "B"]);
  });
});
