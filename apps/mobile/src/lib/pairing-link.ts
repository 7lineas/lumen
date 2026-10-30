export type PairingLink = { origin: string; code: string };

/**
 * Reads the link Lumen shows in its QR codes, `http://<address>:<port>/?pair=<code>`.
 * The address can be a local-network IP or a Tailscale IP: the QR carries the
 * one the phone should use, so the phone never has to guess. Returns null for
 * anything else, including https, which Lumen does not serve.
 */
export function parsePairingLink(input: string): PairingLink | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" || !url.port) return null;

  const code = url.searchParams.get("pair") ?? "";
  if (!/^\d{6}$/.test(code)) return null;

  return { origin: `http://${url.hostname}:${url.port}`, code };
}
