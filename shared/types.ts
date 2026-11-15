import type { FontFamilyId } from "./fonts";

export interface BibleVersionMeta {
  id: string;
  name: string;
  abbr: string;
  language: string;
  languageLabel?: string;
  license?: string;
  attribution?: string;
  copyright?: string;
  draft?: boolean;
  bundled?: boolean;
  custom?: boolean;
  stats?: { books: number; verses: number };
  importedAt?: number;
  online?: boolean;
  locked?: boolean;
  lockedReason?: string;
}

export interface BibleData {
  meta: BibleVersionMeta;
  verses: Record<string, Record<string, Record<string, string>>>;
  searchIndex: Array<{
    key: string;
    book: string;
    chapter: number;
    verse: number;
    text: string;
  }>;
}

export type MediaFit = "cover" | "contain";

export type ProjectorMode =
  | "verse"
  | "slides"
  | "video"
  | "blank"
  | "logo"
  | "countdown";

export interface VideoPlayback {
  path: string;
  playing: boolean;
  startedAt: number;
  position: number;
  volume: number;
}

export interface ProjectorPayload {
  mode: ProjectorMode;
  referenceLabel: string;
  blocks: Array<{ label?: string; text: string }>;
  churchName: string;
  fontSize: number;
  brightness: number;
  padding: number;
  theme: "dark" | "light";
  backgroundColor: string;
  referenceColor?: string;
  versionColor?: string;
  fadeMs?: number;
  backgroundFadeMs?: number;
  backgroundImagePath?: string | null;
  logoImagePath?: string | null;
  slideImagePath?: string | null;
  countdown?: { caption: string; endsAt: number };
  video?: VideoPlayback;
  fontFamily?: FontFamilyId;
  fontWeight?: number;
}

export interface AppSettings {
  primaryVersionId: string;
  secondaryVersionId: string | null;
  dualView: boolean;
  theme: "dark" | "light";
  fontSize: number;
  backgroundColor: string;
  backgroundImagePath: string | null;
  backgroundImages: string[];
  backgroundFit: MediaFit;
  slideFit: MediaFit;
  projectorDisplayId: number | null;
  fadeMs: number;
  songFadeMs: number;
  songUppercase: boolean;
  fontFamily: FontFamilyId;
  backgroundFadeMs: number;
  churchName: string;
  logoImagePath: string | null;
  brightness: number;
  padding: number;
  accentColor: string;
  overlayAnimation: boolean;
  launchAtStartup: boolean;
  doubleClickProjects: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  primaryVersionId: "rv1909",
  secondaryVersionId: null,
  dualView: false,
  theme: "dark",
  fontSize: 74,
  backgroundColor: "#0f1419",
  backgroundImagePath: null,
  backgroundImages: [],
  backgroundFit: "cover",
  slideFit: "contain",
  projectorDisplayId: null,
  fadeMs: 400,
  songFadeMs: 100,
  songUppercase: false,
  fontFamily: "system",
  backgroundFadeMs: 100,
  churchName: "Iglesia",
  logoImagePath: null,
  brightness: 0.4,
  padding: 9,
  accentColor: "#f6a623",
  overlayAnimation: false,
  launchAtStartup: true,
  doubleClickProjects: false,
};

export interface HistoryEntry {
  at: number;
  reference: string;
  versionId: string;
}

export interface QueueEntry {
  id: string;
  reference: string;
  label?: string;
}

export const MAX_QUEUE_ITEMS = 99;

export interface StoredSong {
  id: string;
  title: string;
  author?: string;
  lyrics: string;
  fadeMs?: number;
  fontFamily?: FontFamilyId;
  fontWeight?: number;
  updatedAt: number;
  pinned: boolean;
}

export interface StoredText {
  id: string;
  title: string;
  body: string;
  fontFamily?: FontFamilyId;
  fontWeight?: number;
  updatedAt: number;
  pinned: boolean;
}

export type MediaKind = "slides" | "video" | "audio";

export interface StoredSlideDeck {
  id: string;
  title: string;
  kind?: "video" | "audio";
  images: string[];
  file?: string;
  updatedAt: number;
  pinned: boolean;
}

export function mediaKind(item: Pick<StoredSlideDeck, "kind">): MediaKind {
  return item.kind ?? "slides";
}

export interface PendingSlideImport {
  id: string;
  title: string;
  source: { kind: "pptx" | "pdf"; file: string };
  total: number;
}

export type SlideImportResult =
  | { kind: "ready"; deck: StoredSlideDeck; more?: StoredSlideDeck[] }
  | { kind: "pending"; pending: PendingSlideImport }
  | { kind: "error"; error: string };
