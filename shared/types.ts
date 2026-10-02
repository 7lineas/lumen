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
  theme: "dark" | "light";
  backgroundColor: string;
  /** Shown in the projection footer when the operator leaves the option on. */
  copyright?: string;
}

export interface AppSettings {
  primaryVersionId: string;
  secondaryVersionId: string | null;
  dualView: boolean;
  theme: "dark" | "light";
  fontSize: number;
  backgroundColor: string;
  backgroundImagePath: string | null;
  projectorDisplayId: number | null;
  fadeMs: number;
  /** Name shown on the logo screen. */
  churchName: string;
  /** 0.35–1, applied on the projector. */
  brightness: number;
  /** Copyright line on the projection footer. */
  showCopyright: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  primaryVersionId: "rv1909",
  secondaryVersionId: null,
  dualView: false,
  theme: "dark",
  fontSize: 72,
  backgroundColor: "#0f1419",
  backgroundImagePath: null,
  projectorDisplayId: null,
  fadeMs: 350,
  churchName: "Iglesia",
  brightness: 1,
  showCopyright: true,
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
