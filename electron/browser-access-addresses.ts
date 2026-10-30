import type os from "node:os";

export interface BrowserAccessAddresses {
  /** Private addresses on the same Wi-Fi or cable network as the host. */
  lan: string[];
  /** Tailscale addresses. They work from any network where the phone is also on Tailscale. */
  tailnet: string[];
}

type NetworkInterfaces = NodeJS.Dict<os.NetworkInterfaceInfo[]>;

function ipv4Octets(address: string): number[] | null {
  const octets = address.split(".").map(Number);
  if (
    octets.length !== 4 ||
    octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  )
    return null;
  return octets;
}

export function isPrivateIpv4(address: string): boolean {
  const octets = ipv4Octets(address);
  if (!octets) return false;
  const [first, second] = octets;
  return (
    first === 10 ||
    (first === 172 && second! >= 16 && second! <= 31) ||
    (first === 192 && second === 168) ||
    (first === 169 && second === 254)
  );
}

/** Tailscale assigns addresses from the carrier-grade NAT block 100.64.0.0/10. */
export function isTailnetIpv4(address: string): boolean {
  const octets = ipv4Octets(address);
  if (!octets) return false;
  const [first, second] = octets;
  return first === 100 && second! >= 64 && second! <= 127;
}

export function classifyBrowserAddresses(
  interfaces: NetworkInterfaces,
): BrowserAccessAddresses {
  const lan: string[] = [];
  const tailnet: string[] = [];
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      const isIpv4 =
        String(entry.family) === "IPv4" || String(entry.family) === "4";
      if (!isIpv4 || entry.internal) continue;
      if (isTailnetIpv4(entry.address)) tailnet.push(entry.address);
      else if (isPrivateIpv4(entry.address)) lan.push(entry.address);
    }
  }
  return { lan, tailnet };
}
