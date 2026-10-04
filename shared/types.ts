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

export type ProjectorMode = "verse" | "slides" | "blank" | "logo";

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
  /** Shown in the projection footer when the operator leaves the option on. */
  copyright?: string;
  /** The projected version(s) carry a copyright: render a ® mark by the
   * bottom-right version tag when the full line above is hidden. */
  hasCopyright?: boolean;
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
  /** Managed per-slide image (PNG) for diapositivas. */
  slideImagePath?: string | null;
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
  backgroundFadeMs: number;
  /** Name shown on the logo screen. */
  churchName: string;
  /** 0.35–1, applied on the projector. */
  brightness: number;
  /** Uniform projector content padding in viewport width units. */
  padding: number;
  /** Copyright line on the projection footer. */
  showCopyright: boolean;
  /** Single accent color for the reference (top-left) and version tag (bottom-right). */
  accentColor: string;
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
  backgroundFadeMs: 100,
  churchName: "Iglesia",
  brightness: 0.4,
  padding: 9,
  showCopyright: true,
  accentColor: "#f6a623",
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

/** User-created song saved in the application's persistent user data. */
export interface StoredSong {
  id: string;
  title: string;
  lyrics: string;
  updatedAt: number;
  pinned: boolean;
}

/** Slide deck saved in the application's persistent user data: images only, one PNG per slide. */
export interface StoredSlideDeck {
  id: string;
  title: string;
  /** Managed PNG per slide (copied into app data), in presentation order. */
  images: string[];
  updatedAt: number;
  pinned: boolean;
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
  | { kind: "ready"; deck: StoredSlideDeck }
  | { kind: "pending"; pending: PendingSlideImport }
  | { kind: "error"; error: string };
