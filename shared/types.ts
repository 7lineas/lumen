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
  /** Imported by the user from a file (id is `custom-<abbr>`). */
  custom?: boolean;
  /** Size of an imported Bible, shown in the Biblias panel. */
  stats?: { books: number; verses: number };
  /** Epoch ms when the user imported it. */
  importedAt?: number;
  /** Served on demand by YouVersion Platform (id is `yv-<number>`). */
  online?: boolean;
  /** Online version whose publisher license the app has not accepted yet (content answers 403). */
  locked?: boolean;
  /** Why a locked version cannot be used, e.g. "Acepta la licencia Biblica Fast-track en el portal de YouVersion". */
  lockedReason?: string;
}

export interface BibleData {
  meta: BibleVersionMeta;
  /** bookCode -> chapter -> verse -> text */
  verses: Record<string, Record<string, Record<string, string>>>;
  /** precomputed for search: ref key GEN:1:1 -> text */
  searchIndex: Array<{ key: string; book: string; chapter: number; verse: number; text: string }>;
}

/** How an image/video fills the projector: crop to fill ("cover") or show it whole ("contain"). */
export type MediaFit = "cover" | "contain";

export type ProjectorMode = "verse" | "slides" | "video" | "blank" | "logo" | "countdown";

/**
 * Playback of the video on screen. The operator owns the clock: every window
 * seeks to the same position from these fields, so they stay in step.
 */
export interface VideoPlayback {
  /** Managed video file (copied into app data). */
  path: string;
  playing: boolean;
  /** Epoch ms at which position 0 was (or would have been) on screen while playing. */
  startedAt: number;
  /** Position in seconds while paused. */
  position: number;
  /** 0–1, applied on the projector only; the operator monitors are always silent. */
  volume: number;
}

export interface ProjectorPayload {
  mode: ProjectorMode;
  referenceLabel: string;
  blocks: Array<{ label?: string; text: string }>;
  churchName: string;
  fontSize: number;
  brightness: number;
  /** Uniform projector content padding in viewport width units. */
  padding: number;
  theme: "dark" | "light";
  backgroundColor: string;
  /** Color of the top-left reference (e.g. "Juan 5:13"). */
  referenceColor?: string;
  /** Color of the bottom-right version tag (e.g. "RV1909"). */
  versionColor?: string;
  /** Fade transition duration in ms. */
  fadeMs?: number;
  backgroundFadeMs?: number;
  /**
   * Managed background media path. Kept optional so blank/logo payloads stay lean.
   */
  backgroundImagePath?: string | null;
  /** Managed logo image shown on the logo screen. */
  logoImagePath?: string | null;
  /** Managed per-slide image (PNG) for diapositivas. */
  slideImagePath?: string | null;
  /** Countdown on screen: the caption above the time, and when it reaches zero (epoch ms). */
  countdown?: { caption: string; endsAt: number };
  /** Video on screen (mode "video"). */
  video?: VideoPlayback;
  /** Typeface of this content (a song or text with its own font). Unset: Ajustes > Tipo de letra applies. */
  fontFamily?: FontFamilyId;
  /** Weight of this content, with fontFamily. Unset: normal. */
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
  /** Images copied into this user's app data folder for reuse. */
  backgroundImages: string[];
  /** How background media (image/video) fills the screen. Default: cover. */
  backgroundFit: MediaFit;
  /** How a diapositiva image fills the screen. Default: contain (whole slide visible). */
  slideFit: MediaFit;
  projectorDisplayId: number | null;
  /** Bible text transition duration in ms. */
  fadeMs: number;
  /** Songs text transition duration in ms. */
  songFadeMs: number;
  /** Project song lyrics in capitals. Songs only: Bible text is never changed. */
  songUppercase: boolean;
  /** Typeface for everything projected (text, reference and version). Size stays in fontSize. */
  fontFamily: FontFamilyId;
  backgroundFadeMs: number;
  /** Name shown on the logo screen. Unused now that the logo screen shows an image. */
  churchName: string;
  /** Managed logo image copied into app data. Null until the operator picks one. */
  logoImagePath: string | null;
  /** 0.35–1, applied on the projector. */
  brightness: number;
  /** Uniform projector content padding in viewport width units. */
  padding: number;
  /** Single accent color for the reference (top-left) and version tag (bottom-right). */
  accentColor: string;
  /** Fade windows and dialogs in and out. Off by default so they open and close at once. */
  overlayAnimation: boolean;
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

/** Upper bound on how many references can be stored in the service rundown. */
export const MAX_QUEUE_ITEMS = 99;

/** User-created song saved in the application's persistent user data. */
export interface StoredSong {
  id: string;
  title: string;
  /** Author or credit, shown in the library only (never projected). */
  author?: string;
  lyrics: string;
  /** Transition duration in ms for this song. Unset: Ajustes > Canciones applies. */
  fadeMs?: number;
  /** Typeface and weight of this song. Unset: Ajustes > Tipo de letra applies. */
  fontFamily?: FontFamilyId;
  fontWeight?: number;
  updatedAt: number;
  pinned: boolean;
}

/** Free text saved in the application's persistent user data (the Textos workspace). */
export interface StoredText {
  id: string;
  title: string;
  /** Text as written; each block separated by a blank line is one slide. */
  body: string;
  /** Typeface and weight of this text. Unset: Ajustes > Tipo de letra applies. */
  fontFamily?: FontFamilyId;
  fontWeight?: number;
  updatedAt: number;
  pinned: boolean;
}

/** What a media item is: a deck of slide images (the default), a video or an audio track. */
export type MediaKind = "slides" | "video" | "audio";

/**
 * Media item saved in the application's persistent user data. A slide deck
 * holds one PNG per slide; a video or audio item holds a single managed file.
 */
export interface StoredSlideDeck {
  id: string;
  title: string;
  /** Absent means "slides" (decks saved before audio and video existed). */
  kind?: "video" | "audio";
  /** Managed PNG per slide (copied into app data), in presentation order. Empty for video and audio. */
  images: string[];
  /** Managed video or audio file (copied into app data). */
  file?: string;
  updatedAt: number;
  pinned: boolean;
}

export function mediaKind(item: Pick<StoredSlideDeck, "kind">): MediaKind {
  return item.kind ?? "slides";
}

/** An import whose PNGs are still to be generated (never persisted). */
export interface PendingSlideImport {
  id: string;
  title: string;
  source: { kind: "pptx" | "pdf"; file: string };
  /** Expected slide count (0 = unknown until rasterized). */
  total: number;
}

export type SlideImportResult =
  | { kind: "ready"; deck: StoredSlideDeck; more?: StoredSlideDeck[] }
  | { kind: "pending"; pending: PendingSlideImport }
  | { kind: "error"; error: string };
