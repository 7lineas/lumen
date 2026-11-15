export interface SongSection {
  key: string;
  label: string;
  text: string;
}

export interface ParsedSong {
  sections: SongSection[];
  order: string[];
}

const LABEL_WORD =
  /^(verso|estrofa|coro|puente|pre-?coro|estribillo|refr[áa]n|intro|outro|final|tag|interludio|verse|chorus|bridge|pre-?chorus|refrain)(\s+\d+)?\s*:?$/i;

const LABEL_BRACKET = /^\[([^\]]+)\]$/;

function labelOf(line: string): string | null {
  const trimmed = line.trim();
  const bracket = LABEL_BRACKET.exec(trimmed);
  if (bracket) return bracket[1].trim() || null;
  return LABEL_WORD.test(trimmed) ? trimmed.replace(/:$/, "").trim() : null;
}

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
    for (let n = 2; sections.some((s) => s.key === key); n++)
      key = `${candidate}-${n}`;
    return key;
  };

  for (const block of blocks) {
    const lines = block.split("\n");
    const label = labelOf(lines[0]);
    const text = (label === null ? lines : lines.slice(1)).join("\n").trim();

    if (label === null) {
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
      const first = sections.find((s) => slug(s.label) === group);
      if (first) order.push(first.key);
      continue;
    }

    const same = sections.find(
      (s) => slug(s.label) === group && s.text === text,
    );
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

export function songParts(lyrics: string): SongSection[] {
  const parsed = parseSong(lyrics);
  const byKey = new Map(
    parsed.sections.map((section) => [section.key, section]),
  );
  return parsed.order.flatMap((key) => {
    const section = byKey.get(key);
    return section ? [section] : [];
  });
}

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
