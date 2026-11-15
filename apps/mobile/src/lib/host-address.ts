export const LUMEN_DEFAULT_PORT = 43124;

const HOST_PATTERN =
  /^(?:http:\/\/)?([a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)(?::(\d{1,5}))?\/?$/i;

export function normalizeHostAddress(input: string): string | null {
  const match = HOST_PATTERN.exec(input.trim());
  if (!match) return null;
  const port = match[2] ? Number(match[2]) : LUMEN_DEFAULT_PORT;
  if (port < 1 || port > 65535) return null;
  return `http://${match[1]}:${port}`;
}
