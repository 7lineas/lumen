import type { BibleData, BibleVersionMeta } from "./types";

export const YV_ID_PREFIX = "yv-";

export function yvVersionId(numericId: number): string {
  return `${YV_ID_PREFIX}${numericId}`;
}

export function parseYvVersionId(id: string): number | null {
  const match = /^yv-(\d{1,9})$/.exec(id);
  return match ? Number(match[1]) : null;
}

export function isOnlineVersionId(id: string | null | undefined): boolean {
  return !!id && parseYvVersionId(id) !== null;
}

export interface YvBible {
  id: number;
  abbreviation?: string;
  title?: string;
  localized_title?: string;
  language_tag?: string;
  copyright?: string | null;
  promotional_content?: string | null;
  info?: string | null;
}

export interface YvLicense {
  id: number;
  name?: string;
  uri?: string;
  bible_ids?: number[];
}

export const DEFAULT_ONLINE_VERSION_IDS = [128, 103, 89, 147] as const;

export const COLOMBIA_PRIORITY = DEFAULT_ONLINE_VERSION_IDS;

const ABBR_OVERRIDES: Record<number, string> = { 3365: "PdDpt" };

function clean(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed
    .replace(/^"(.*)"$/s, "$1")
    .replace(/\s*\n+\s*/g, " · ")
    .trim();
}

export function attributionFor(bible: YvBible): string {
  return clean(bible.copyright) || clean(bible.promotional_content);
}

export function fallbackAttribution(bible: YvBible): string {
  const title = clean(bible.title) || clean(bible.localized_title);
  const abbr = clean(bible.abbreviation);
  return `${title || abbr}${title && abbr ? ` (${abbr})` : ""} · YouVersion Platform`;
}

function yearOf(title: string): string {
  return /\b(19|20)\d{2}\b/.exec(title)?.[0] ?? "";
}

export function buildOnlineVersions(
  catalog: YvBible[],
  licensedIds: Set<number>,
  licenses: YvLicense[],
): BibleVersionMeta[] {
  const abbrCount = new Map<string, number>();
  for (const bible of catalog) {
    const abbr = clean(bible.abbreviation);
    abbrCount.set(abbr, (abbrCount.get(abbr) ?? 0) + 1);
  }
  const licenseOf = (id: number) =>
    licenses.find((license) => license.bible_ids?.includes(id));
  const rank = (id: number) => {
    const at = (DEFAULT_ONLINE_VERSION_IDS as readonly number[]).indexOf(id);
    return at === -1 ? DEFAULT_ONLINE_VERSION_IDS.length : at;
  };
  return [...catalog]
    .sort(
      (a, b) =>
        rank(a.id) - rank(b.id) ||
        clean(a.abbreviation).localeCompare(clean(b.abbreviation)),
    )
    .map((bible) => {
      const title =
        clean(bible.title) ||
        clean(bible.localized_title) ||
        `Biblia ${bible.id}`;
      let abbr =
        ABBR_OVERRIDES[bible.id] ?? (clean(bible.abbreviation) || title);
      if ((abbrCount.get(clean(bible.abbreviation)) ?? 0) > 1) {
        abbr = `${abbr.replace(/-S$/, "")} ${yearOf(title)}`.trim();
      }
      const locked = !licensedIds.has(bible.id);
      const license = licenseOf(bible.id);
      return {
        id: yvVersionId(bible.id),
        name: title,
        abbr,
        language: "Español",
        license: license?.name,
        copyright: attributionFor(bible) || undefined,
        online: true,
        locked: locked || undefined,
        lockedReason: locked
          ? `Licencia no aceptada en el portal de YouVersion Platform de esta app (${license?.name ?? "editorial"}). Acéptala allí para usar ${abbr}.`
          : undefined,
      } satisfies BibleVersionMeta;
    });
}

export function emptyOnlineBible(meta: BibleVersionMeta): BibleData {
  return { meta, verses: {}, searchIndex: [] };
}

export function mergeChapter(
  bible: BibleData,
  book: string,
  chapter: number,
  verses: Record<string, string>,
): BibleData {
  const key = String(chapter);
  bible.verses[book] = { ...(bible.verses[book] ?? {}), [key]: verses };
  const prefix = `${book}:${chapter}:`;
  const kept = bible.searchIndex.filter(
    (entry) => !entry.key.startsWith(prefix),
  );
  const added = Object.entries(verses).map(([verse, text]) => ({
    key: `${prefix}${verse}`,
    book,
    chapter,
    verse: Number(verse),
    text,
  }));
  bible.searchIndex = [...kept, ...added];
  return bible;
}

export function hasChapter(
  bible: BibleData | undefined,
  book: string,
  chapter: number,
): boolean {
  return !!bible?.verses[book]?.[String(chapter)];
}

export function parseDefaultOnlineNumericId(id: string): number | null {
  const numeric = parseYvVersionId(id);
  if (numeric === null) return null;
  return (DEFAULT_ONLINE_VERSION_IDS as readonly number[]).includes(numeric)
    ? numeric
    : null;
}

export function isDefaultOnlineVersionId(id: string): boolean {
  return parseDefaultOnlineNumericId(id) !== null;
}

export function mergeSelectedOnlineIds(customIds: readonly number[]): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const id of DEFAULT_ONLINE_VERSION_IDS) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  for (const id of customIds) {
    if (!Number.isInteger(id) || id < 1 || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function sanitizeCustomOnlineIds(ids: readonly number[]): number[] {
  const defaults = new Set<number>(DEFAULT_ONLINE_VERSION_IDS);
  const seen = new Set<number>();
  const out: number[] = [];
  for (const id of ids) {
    if (!Number.isInteger(id) || id < 1 || defaults.has(id) || seen.has(id))
      continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function normalizeSearchText(value: string): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

export interface OnlineSearchHit {
  id: string;
  name: string;
  abbr: string;
  language: string;
  license?: string;
  locked?: boolean;
  lockedReason?: string;
  added: boolean;
}

export function searchOnlineCatalog(
  catalog: readonly BibleVersionMeta[],
  query: string,
  selectedIds: ReadonlySet<string>,
  limit = 30,
): OnlineSearchHit[] {
  const needle = normalizeSearchText(query);
  if (!needle) return [];
  const hits: OnlineSearchHit[] = [];
  for (const version of catalog) {
    if (!version.online) continue;
    const haystack = normalizeSearchText(
      [
        version.name,
        version.abbr,
        version.language,
        version.license,
        version.id,
      ]
        .filter(Boolean)
        .join(" "),
    );
    if (!haystack.includes(needle)) continue;
    hits.push({
      id: version.id,
      name: version.name,
      abbr: version.abbr,
      language: version.language,
      license: version.license,
      locked: version.locked,
      lockedReason: version.lockedReason,
      added: selectedIds.has(version.id),
    });
    if (hits.length >= limit) break;
  }
  return hits;
}

export function pickSelectedOnlineVersions(
  catalog: readonly BibleVersionMeta[],
  selectedNumericIds: readonly number[],
): BibleVersionMeta[] {
  const byId = new Map(catalog.map((version) => [version.id, version]));
  const out: BibleVersionMeta[] = [];
  for (const numeric of selectedNumericIds) {
    const version = byId.get(yvVersionId(numeric));
    if (!version) continue;
    out.push(version);
  }
  return out;
}

export interface OnlineSearchResult {
  configured: boolean;
  query: string;
  hits: OnlineSearchHit[];
  stale: boolean;
  error?: string;
}

export type ChapterResult =
  | {
      ok: true;
      verses: Record<string, string>;
      fromCache: boolean;
      stale: boolean;
      copyright: string;
    }
  | {
      ok: false;
      reason:
        | "no-key"
        | "locked"
        | "offline"
        | "rate-limited"
        | "not-found"
        | "error";
      message: string;
      retryAfterSec?: number;
    };

export interface OnlineVersionsResult {
  configured: boolean;
  versions: BibleVersionMeta[];
  stale: boolean;
  error?: string;
}
