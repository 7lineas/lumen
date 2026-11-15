export type PairingLink = { origin: string; code: string };

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
