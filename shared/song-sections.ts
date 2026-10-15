/**
 * Song structure: labelled parts ("Verso 1", "Coro", "Puente" or "[Coro]")
 * and the order they are projected in, which is the order they are written.
 * Lyrics written without labels keep working: every blank-line block is its
 * own part, in the order it was written.
 */

export interface SongSection {
  /** Stable id inside the song: "coro", "verso-1", or "texto-<hash>" when unlabelled. */
  key: string;
  /** Label as written by the user ("Coro", "Verso 1"); empty when unlabelled. */
  label: string;
  text: string;
}

export interface ParsedSong {
  /** Unique parts in order of first appearance. */
  sections: SongSection[];
  /** Part keys in the order the lyrics were written, repeats included. */
  order: string[];
}

const LABEL_WORD = /^(verso|estrofa|coro|puente|pre-?coro|estribillo|refr[áa]n|intro|outro|final|tag|interludio|verse|chorus|bridge|pre-?chorus|refrain)(\s+\d+)?\s*:?$/i;

/** Part names offered when writing a song; numbered ones count up as they are added. */
export const SECTION_PRESETS: ReadonlyArray<{ label: string; numbered: boolean }> = [
  { label: "Verso", numbered: true },
  { label: "Coro", numbered: false },
  { label: "Pre-coro", numbered: false },
  { label: "Puente", numbered: false },
  { label: "Intro", numbered: false },
  { label: "Final", numbered: false },
];

/** Label for the next part of a kind: "Verso 3" after two verses, plain "Coro" for unnumbered kinds. */
export function nextSectionLabel(lyrics: string, preset: { label: string; numbered: boolean }): string {
  if (!preset.numbered) return preset.label;
  const prefix = `${slug(preset.label)}-`;
  const used = parseSong(lyrics).sections
    .map((section) => slug(section.label))
    .filter((key) => key.startsWith(prefix))
    .map((key) => Number(key.slice(prefix.length)))
    .filter(Number.isFinite);
  return `${preset.label} ${Math.max(0, ...used) + 1}`;
}
const LABEL_BRACKET = /^\[([^\]]+)\]$/;

/** Label written on the first line of a block, or null when the block has none. */
function labelOf(line: string): string | null {
  const trimmed = line.trim();
  const bracket = LABEL_BRACKET.exec(trimmed);
  if (bracket) return bracket[1].trim() || null;
  return LABEL_WORD.test(trimmed) ? trimmed.replace(/:$/, "").trim() : null;
}

/** Comparison key for labels: "Pre-coro 2" and "pre coro 2" both become "pre-coro-2". */
function slug(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-");
}

function hash(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function capitalise(label: string): string {
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function parseSong(lyrics: string): ParsedSong {
  const blocks = lyrics
    .replace(/\r/g, "")
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);

  const sections: SongSection[] = [];
  const order: string[] = [];

  const uniqueKey = (candidate: string): string => {
    let key = candidate;
    for (let n = 2; sections.some((s) => s.key === key); n++) key = `${candidate}-${n}`;
    return key;
  };

  for (const block of blocks) {
    const lines = block.split("\n");
    const label = labelOf(lines[0]);
    const text = (label === null ? lines : lines.slice(1)).join("\n").trim();

    if (label === null) {
      // Unlabelled blocks: identical text is the same part, otherwise a new one.
      const same = sections.find((s) => s.label === "" && s.text === text);
      if (same) {
        order.push(same.key);
        continue;
      }
      const key = uniqueKey(`texto-${hash(text)}`);
      sections.push({ key, label: "", text });
      order.push(key);
      continue;
    }

    const group = slug(label);
    if (text === "") {
      // A bare "[Coro]" repeats the first part with that label. With no such
      // part yet there is nothing to repeat, so the line is ignored.
      const first = sections.find((s) => slug(s.label) === group);
      if (first) order.push(first.key);
      continue;
    }

    const same = sections.find((s) => slug(s.label) === group && s.text === text);
    if (same) {
      order.push(same.key);
      continue;
    }
    const key = uniqueKey(group);
    sections.push({ key, label: capitalise(label), text });
    order.push(key);
  }

  return { sections, order };
}

/** Parts as they are projected: the written order, repeats included. */
export function songParts(lyrics: string): SongSection[] {
  const parsed = parseSong(lyrics);
  const byKey = new Map(parsed.sections.map((section) => [section.key, section]));
  return parsed.order.flatMap((key) => {
    const section = byKey.get(key);
    return section ? [section] : [];
  });
}

/** Short badge for a part: "Verso 1" → "V1", "Coro" → "C", "Pre-coro" → "PC". */
export function shortLabel(label: string): string {
  if (!label) return "";
  const match = /^(.*?)(?:-(\d+))?$/.exec(slug(label));
  const word = match?.[1] ?? slug(label);
  const number = match?.[2] ?? "";
  const letters: Record<string, string> = {
    verso: "V",
    estrofa: "V",
    verse: "V",
    coro: "C",
    chorus: "C",
    puente: "P",
    bridge: "B",
    "pre-coro": "PC",
    "pre-chorus": "PC",
    refrain: "R",
    estribillo: "E",
    refran: "R",
    intro: "I",
    outro: "O",
    final: "F",
    tag: "T",
    interludio: "I",
  };
  return `${letters[word] ?? word.charAt(0).toUpperCase()}${number}`;
}
