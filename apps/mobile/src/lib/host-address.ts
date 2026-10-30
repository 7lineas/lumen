export const LUMEN_DEFAULT_PORT = 43124;

const HOST_PATTERN =
  /^(?:http:\/\/)?([a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)(?::(\d{1,5}))?\/?$/i;

/**
 * Turns what a volunteer types ("192.168.1.20", "192.168.1.20:43124",
 * "lumen.local") into the service origin. Lumen serves plain HTTP on the
 * local network only, so https and any other scheme return null.
 */
export function normalizeHostAddress(input: string): string | null {
  const match = HOST_PATTERN.exec(input.trim());
  if (!match) return null;
  const port = match[2] ? Number(match[2]) : LUMEN_DEFAULT_PORT;
  if (port < 1 || port > 65535) return null;
  return `http://${match[1]}:${port}`;
}
