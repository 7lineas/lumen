import type os from "node:os";

export interface BrowserAccessAddresses {
  /** Private addresses on the same Wi-Fi or cable network as the host. */
  lan: string[];
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

export function classifyBrowserAddresses(
  interfaces: NetworkInterfaces,
): BrowserAccessAddresses {
  const lan: string[] = [];
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      const isIpv4 =
        String(entry.family) === "IPv4" || String(entry.family) === "4";
      if (!isIpv4 || entry.internal) continue;
      if (isPrivateIpv4(entry.address)) lan.push(entry.address);
    }
  }
  return { lan };
}
