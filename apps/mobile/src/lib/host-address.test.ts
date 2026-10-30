import { describe, expect, it } from "vitest";
import { normalizeHostAddress } from "./host-address";

describe("normalizeHostAddress", () => {
  it("adds the default Lumen port when none is given", () => {
    expect(normalizeHostAddress("192.168.1.20")).toBe(
      "http://192.168.1.20:43124",
    );
  });

  it("keeps an explicit port and an http scheme", () => {
    expect(normalizeHostAddress(" http://192.168.1.20:5000/ ")).toBe(
      "http://192.168.1.20:5000",
    );
  });

  it("accepts a local hostname", () => {
    expect(normalizeHostAddress("lumen.local")).toBe(
      "http://lumen.local:43124",
    );
  });

  it("rejects https, empty input and out-of-range ports", () => {
    expect(normalizeHostAddress("https://192.168.1.20")).toBeNull();
    expect(normalizeHostAddress("   ")).toBeNull();
    expect(normalizeHostAddress("192.168.1.20:70000")).toBeNull();
    expect(normalizeHostAddress("192.168.1.20:0")).toBeNull();
  });
});
