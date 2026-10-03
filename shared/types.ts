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
}

export interface BibleData {
  meta: BibleVersionMeta;
  /** bookCode -> chapter -> verse -> text */
  verses: Record<string, Record<string, Record<string, string>>>;
  /** precomputed for search: ref key GEN:1:1 -> text */
  searchIndex: Array<{ key: string; book: string; chapter: number; verse: number; text: string }>;
}

export type ProjectorMode = "verse" | "blank" | "logo";

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
  projectorDisplayId: number | null;
  fadeMs: number;
  backgroundFadeMs: number;
  /** Name shown on the logo screen. */
  churchName: string;
  /** 0.35–1, applied on the projector. */
  brightness: number;
  /** Uniform projector content padding in viewport width units. */
  padding: number;
  /** Copyright line on the projection footer. */
  showCopyright: boolean;
  /** Color of the top-left reference on the projection. */
  referenceColor: string;
  /** Color of the bottom-right version tag on the projection. */
  versionColor: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  primaryVersionId: "rv1909",
  secondaryVersionId: null,
  dualView: false,
  theme: "dark",
  fontSize: 72,
  backgroundColor: "#0f1419",
  backgroundImagePath: null,
  backgroundImages: [],
  projectorDisplayId: null,
  fadeMs: 100,
  backgroundFadeMs: 400,
  churchName: "Iglesia",
  brightness: 1,
  padding: 5,
  showCopyright: true,
  referenceColor: "#f6a623",
  versionColor: "#f6a623",
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
