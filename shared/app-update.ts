export const UPDATE_FEED_URL = "https://downloads.7lineas.com";
export const UPDATE_MANIFEST_URL = `${UPDATE_FEED_URL}/latest.yml`;
export const UPDATE_DOWNLOADS_PAGE_HINT = UPDATE_FEED_URL;

export type VersionPart = number | string;

export function parseVersionParts(version: string): VersionPart[] {
  return String(version ?? "")
    .trim()
    .replace(/^[vV]/, "")
    .split(".")
    .map((part) => {
      const numeric = /^\d+$/.test(part) ? Number(part) : part;
      return numeric;
    });
}

/** Compare SemVer-like strings. Returns 1 when a > b, -1 when a < b, 0 when equal. */
export function compareVersions(a: string, b: string): 1 | -1 | 0 {
  const left = parseVersionParts(a);
  const right = parseVersionParts(b);
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    const l = left[i] ?? 0;
    const r = right[i] ?? 0;
    if (typeof l === "number" && typeof r === "number") {
      if (l > r) return 1;
      if (l < r) return -1;
    } else {
      const ls = String(l);
      const rs = String(r);
      if (ls > rs) return 1;
      if (ls < rs) return -1;
    }
  }
  return 0;
}

export function isNewerVersion(current: string, latest: string): boolean {
  if (!current || !latest) return false;
  return compareVersions(latest, current) === 1;
}
