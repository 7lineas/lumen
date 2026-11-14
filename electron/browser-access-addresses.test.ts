import type os from "node:os";
import { describe, expect, it } from "vitest";
import { classifyBrowserAddresses } from "./browser-access-addresses";

function iface(
  address: string,
  overrides: Partial<os.NetworkInterfaceInfo> = {},
): os.NetworkInterfaceInfo {
  return {
    address,
    family: "IPv4",
    internal: false,
    netmask: "255.255.255.0",
    mac: "00:00:00:00:00:00",
    cidr: `${address}/24`,
    ...overrides,
  } as os.NetworkInterfaceInfo;
}

describe("classifyBrowserAccessAddresses", () => {
  it("returns private LAN addresses and skips loopback, overlay, and public ones", () => {
    const result = classifyBrowserAddresses({
      lo0: [iface("127.0.0.1", { internal: true })],
      en0: [iface("192.168.1.20")],
      utun3: [iface("100.101.102.103")],
      en1: [iface("8.8.8.8")],
    });

    expect(result).toEqual({
      lan: ["192.168.1.20"],
    });
  });

  it("does not treat carrier-grade NAT addresses as LAN addresses", () => {
    const result = classifyBrowserAddresses({
      en0: [
        iface("100.63.0.1"),
        iface("100.64.0.1"),
        iface("100.127.255.1"),
        iface("100.128.0.1"),
      ],
    });

    expect(result).toEqual({ lan: [] });
    expect(result.lan).toEqual([]);
  });

  it("ignores IPv6 entries and internal interfaces", () => {
    const result = classifyBrowserAddresses({
      en0: [
        iface("fe80::1", { family: "IPv6" }),
        iface("100.100.1.1", { internal: true }),
      ],
    });

    expect(result).toEqual({ lan: [] });
  });
});
