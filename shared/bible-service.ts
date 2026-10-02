import type { BibleData, BibleVersionMeta } from "./types";
import type { VerseRange, VerseRef } from "./reference";
import { expandRange, formatRange } from "./reference";
import { normalizeSearchText } from "./reference";
import { bookDisplayName } from "./books";

let manifest: BibleVersionMeta[] = [];
const cache = new Map<string, BibleData>();

export function setManifest(m: BibleVersionMeta[]): void {
  manifest = m;
}

export function getVersions(): BibleVersionMeta[] {
  return manifest;
}

export function loadBible(data: BibleData): void {
  cache.set(data.meta.id, data);
}

export function getBible(id: string): BibleData | undefined {
  return cache.get(id);
}

export function getVerseText(bible: BibleData, ref: VerseRef): string | null {
  const ch = bible.verses[ref.book]?.[String(ref.chapter)]?.[String(ref.verse)];
  return ch ?? null;
}

export function getChapterVerseCount(bible: BibleData, book: string, chapter: number): number {
  const ch = bible.verses[book]?.[String(chapter)];
  if (!ch) return 0;
  return Object.keys(ch).length;
}

export function fetchRangeTexts(
  primaryId: string,
  secondaryId: string | null,
  range: VerseRange,
): { referenceLabel: string; blocks: Array<{ label?: string; text: string }> } | null {
  const primary = cache.get(primaryId);
  if (!primary) return null;
  const secondary = secondaryId ? cache.get(secondaryId) : null;

  const refs = expandRange(range);
  const lines: string[] = [];
  const linesSecondary: string[] = [];

  for (const ref of refs) {
    const t1 = getVerseText(primary, ref);
    if (!t1) continue;
    const num = refs.length > 1 ? `${ref.verse} ` : "";
    lines.push(`${num}${t1}`);
    if (secondary) {
      const t2 = getVerseText(secondary, ref);
      if (t2) linesSecondary.push(`${num}${t2}`);
    }
  }

  if (!lines.length) return null;

  const label = formatRange(range, primary.meta.abbr);
  if (secondary && linesSecondary.length) {
    return {
      referenceLabel: `${formatRange(range)} — ${primary.meta.abbr} / ${secondary.meta.abbr}`,
      blocks: [
        { label: primary.meta.abbr, text: lines.join("\n") },
        { label: secondary.meta.abbr, text: linesSecondary.join("\n") },
      ],
    };
  }

  return {
    referenceLabel: label,
    blocks: [{ text: lines.join("\n") }],
  };
}

export function searchVerses(
  versionId: string,
  query: string,
  limit = 50,
): Array<{ book: string; chapter: number; verse: number; text: string; snippet: string }> {
  const bible = cache.get(versionId);
  if (!bible || !query.trim()) return [];

  const q = normalizeSearchText(query);
  const results: Array<{ book: string; chapter: number; verse: number; text: string; snippet: string }> = [];

  for (const entry of bible.searchIndex) {
    if (normalizeSearchText(entry.text).includes(q)) {
      const snippet =
        entry.text.length > 120 ? `${entry.text.slice(0, 117)}…` : entry.text;
      results.push({
        book: entry.book,
        chapter: entry.chapter,
        verse: entry.verse,
        text: entry.text,
        snippet: `${bookDisplayName(entry.book)} ${entry.chapter}:${entry.verse} — ${snippet}`,
      });
      if (results.length >= limit) break;
    }
  }
  return results;
}
