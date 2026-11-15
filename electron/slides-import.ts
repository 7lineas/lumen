import JSZip from "jszip";
import type { StoredSlideDeck } from "../shared/types";

export async function countPptxSlides(
  data: Buffer | Uint8Array,
): Promise<number> {
  const zip = await JSZip.loadAsync(data);
  return Object.keys(zip.files).filter(
    (name) =>
      /^ppt\/slides\/slide\d+\.xml$/i.test(name) && !zip.files[name]?.dir,
  ).length;
}

export function isPptxPath(filePath: string): boolean {
  return /\.(pptx|ppsx)$/i.test(filePath);
}

export function isSlideImagePath(filePath: string): boolean {
  return /\.(png|jpe?g|webp)$/i.test(filePath);
}

export function isVideoPath(filePath: string): boolean {
  return /\.(mp4|m4v|webm|mov|ogv)$/i.test(filePath);
}

export function isAudioPath(filePath: string): boolean {
  return /\.(mp3|wav|m4a|aac|ogg|oga|opus|flac)$/i.test(filePath);
}

export function naturalCompare(a: string, b: string): number {
  const ax: Array<string | number> = [];
  const bx: Array<string | number> = [];
  a.replace(/(\d+)|(\D+)/g, (_m, num: string, str: string) => {
    ax.push(num ? Number(num) : str);
    return "";
  });
  b.replace(/(\d+)|(\D+)/g, (_m, num: string, str: string) => {
    bx.push(num ? Number(num) : str);
    return "";
  });
  for (let i = 0; i < Math.max(ax.length, bx.length); i++) {
    const x = ax[i];
    const y = bx[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (typeof x === "number" && typeof y === "number") {
      if (x !== y) return x - y;
    } else if (String(x) !== String(y)) {
      return String(x) < String(y) ? -1 : 1;
    }
  }
  return a < b ? -1 : a > b ? 1 : 0;
}

export function sortImagePathsNumerically(paths: string[]): string[] {
  return [...paths].sort((a, b) => naturalCompare(a, b));
}

export function sanitizeSlideDecks(decks: unknown): StoredSlideDeck[] {
  if (!Array.isArray(decks)) return [];
  return decks.flatMap((deck): StoredSlideDeck[] => {
    if (!deck || typeof deck !== "object") return [];
    const value = deck as {
      id?: unknown;
      title?: unknown;
      kind?: unknown;
      file?: unknown;
      images?: unknown;
      updatedAt?: unknown;
      pinned?: unknown;
    };
    if (typeof value.id !== "string" || typeof value.title !== "string")
      return [];
    const base = {
      id: value.id,
      title: value.title,
      updatedAt: Number.isFinite(value.updatedAt)
        ? (value.updatedAt as number)
        : Date.now(),
      pinned: Boolean(value.pinned),
    };
    if (value.kind === "video" || value.kind === "audio") {
      if (typeof value.file !== "string" || value.file.length === 0) return [];
      return [
        {
          id: base.id,
          title: base.title,
          kind: value.kind,
          images: [],
          file: value.file,
          updatedAt: base.updatedAt,
          pinned: base.pinned,
        },
      ];
    }
    if (!Array.isArray(value.images)) return [];
    const images = value.images.filter(
      (entry): entry is string => typeof entry === "string" && entry.length > 0,
    );
    if (images.length === 0) return [];
    return [
      {
        id: base.id,
        title: base.title,
        images,
        updatedAt: base.updatedAt,
        pinned: base.pinned,
      },
    ];
  });
}
