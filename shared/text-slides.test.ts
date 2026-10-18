import { describe, expect, it } from "vitest";
import { textSlides } from "./text-slides";

describe("textSlides", () => {
  it("makes one slide per block separated by a blank line", () => {
    expect(textSlides("Primera\nlínea dos\n\nSegunda")).toEqual(["Primera\nlínea dos", "Segunda"]);
  });

  it("keeps a text without blank lines as a single slide", () => {
    expect(textSlides("Un solo bloque\ncon dos líneas")).toEqual(["Un solo bloque\ncon dos líneas"]);
  });

  it("ignores extra blank lines, spaces and Windows line endings", () => {
    expect(textSlides("  Uno  \r\n\r\n\r\n   \n\t\nDos\n")).toEqual(["Uno", "Dos"]);
  });

  it("returns no slides for empty or blank text", () => {
    expect(textSlides("")).toEqual([]);
    expect(textSlides(" \n\n  ")).toEqual([]);
  });
});
