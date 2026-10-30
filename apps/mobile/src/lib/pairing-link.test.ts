import { describe, expect, it } from "vitest";
import { parsePairingLink } from "./pairing-link";

describe("parsePairingLink", () => {
  it("reads the QR link from a local-network address", () => {
    expect(parsePairingLink("http://192.168.1.20:43124/?pair=123456")).toEqual({
      origin: "http://192.168.1.20:43124",
      code: "123456",
    });
  });

  it("reads the QR link from a Tailscale address", () => {
    expect(
      parsePairingLink("http://100.101.102.103:43124/?pair=000042"),
    ).toEqual({
      origin: "http://100.101.102.103:43124",
      code: "000042",
    });
  });

  it("accepts a link with surrounding spaces", () => {
    expect(
      parsePairingLink("  http://192.168.1.20:43124/?pair=123456 "),
    ).toEqual({
      origin: "http://192.168.1.20:43124",
      code: "123456",
    });
  });

  it("rejects https, which Lumen does not serve", () => {
    expect(
      parsePairingLink("https://192.168.1.20:43124/?pair=123456"),
    ).toBeNull();
  });

  it("rejects a link without a port", () => {
    expect(parsePairingLink("http://192.168.1.20/?pair=123456")).toBeNull();
  });

  it("rejects a code that is not six digits", () => {
    expect(
      parsePairingLink("http://192.168.1.20:43124/?pair=12345"),
    ).toBeNull();
    expect(
      parsePairingLink("http://192.168.1.20:43124/?pair=abcdef"),
    ).toBeNull();
    expect(parsePairingLink("http://192.168.1.20:43124/")).toBeNull();
  });

  it("rejects text that is not a URL", () => {
    expect(parsePairingLink("Juan 3:16")).toBeNull();
    expect(parsePairingLink("")).toBeNull();
  });
});
