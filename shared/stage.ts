import type { VerseRange, VerseRef } from "./reference";
import type { ProjectorPayload } from "./types";

export function rangeFromVerseClick(
  anchor: VerseRef | null,
  book: string,
  chapter: number,
  verse: number,
  shiftKey: boolean,
): { range: VerseRange; anchor: VerseRef } {
  const clicked: VerseRef = { book, chapter, verse };
  if (
    shiftKey &&
    anchor &&
    anchor.book === book &&
    anchor.chapter === chapter
  ) {
    const lo = Math.min(anchor.verse, verse);
    const hi = Math.max(anchor.verse, verse);
    return {
      range: {
        start: { book, chapter, verse: lo },
        end: { book, chapter, verse: hi },
      },
      anchor,
    };
  }
  return {
    range: { start: clicked, end: clicked },
    anchor: clicked,
  };
}

export function payloadContentKey(p: ProjectorPayload | null): string {
  if (!p || p.mode === "blank") return "blank";
  if (p.mode === "logo") return `logo:${p.logoImagePath ?? ""}`;
  if (p.mode === "video") return `video:${p.video?.path ?? ""}`;
  if (p.mode === "countdown")
    return `countdown:${p.countdown?.caption ?? ""}|${p.countdown?.endsAt ?? 0}`;
  return `${p.mode}:${p.referenceLabel}|${p.slideImagePath ?? ""}|${p.blocks.map((b) => `${b.label ?? ""}=${b.text}`).join("|")}`;
}

export function videoPosition(
  video: { playing: boolean; startedAt: number; position: number },
  now: number,
  duration?: number | null,
): number {
  const raw = video.playing ? (now - video.startedAt) / 1000 : video.position;
  const max =
    duration != null && Number.isFinite(duration) && duration > 0
      ? duration
      : Infinity;
  return Math.min(Math.max(raw, 0), max);
}
