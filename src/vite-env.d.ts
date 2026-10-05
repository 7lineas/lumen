/// <reference types="vite/client" />

import type { BibleImportPickResult, BibleImportCommitResult } from "../shared/bible-import/types";
import type { ImportMetaInput } from "../shared/bible-import/build";
import type { ChapterResult, OnlineSearchResult, OnlineVersionsResult } from "../shared/youversion";
import type { AppUpdateState } from "../shared/app-update";
import type { AppSettings, HistoryEntry, ProjectorPayload, QueueEntry, StoredSong, StoredSlideDeck, SlideImportResult } from "../shared/types";

export interface DisplayInfo {
  id: number;
  label: string;
  primary: boolean;
  bounds: { x: number; y: number; width: number; height: number };
}

export interface BibleLibraryEntry {
  id: string;
  name: string;
  abbr: string;
  language: string;
  bytes: number | null;
  license: string;
  attribution: string;
  copyright: string;
  draft: boolean;
  availability: "included" | "installed" | "available";
}

export interface BibleLibraryView {
  offline: boolean;
  extensionNote: string;
  entries: BibleLibraryEntry[];
}

export interface BibleDownloadProgress {
  id: string;
  loaded: number;
  total: number | null;
  attempt: number;
}

export interface BrowserAccessInfo {
  enabled: boolean;
  pairingCode: string;
  port: number;
  addresses: string[];
}

export interface ProyectorApi {
  getBrowserAccess: () => Promise<BrowserAccessInfo>;
  setBrowserAccess: (enabled: boolean) => Promise<BrowserAccessInfo>;
  listBibleVersions: () => Promise<Array<{ id: string; name: string; abbr: string; language: string }>>;
  loadBible: (id: string) => Promise<unknown>;
  listOnlineBibles: (force?: boolean) => Promise<OnlineVersionsResult>;
  searchOnlineBibles: (query: string) => Promise<OnlineSearchResult>;
  addOnlineBible: (id: string) => Promise<OnlineVersionsResult>;
  removeOnlineBible: (id: string) => Promise<OnlineVersionsResult>;
  getOnlineChapter: (id: string, book: string, chapter: number) => Promise<ChapterResult>;
  getBibleCatalog: () => Promise<BibleLibraryView>;
  downloadBible: (id: string) => Promise<{ id: string }>;
  removeBible: (id: string) => Promise<{ settings: AppSettings }>;
  pickBibleImport: () => Promise<BibleImportPickResult>;
  commitBibleImport: (previewId: string, input: ImportMetaInput) => Promise<BibleImportCommitResult>;
  cancelBibleImport: () => Promise<void>;
  getSettings: () => Promise<AppSettings>;
  setSettings: (s: AppSettings) => Promise<boolean>;
  onSettingsUpdate: (cb: (s: AppSettings) => void) => () => void;
  getHistory: () => Promise<HistoryEntry[]>;
  addHistory: (e: HistoryEntry) => Promise<HistoryEntry[]>;
  getQueue: () => Promise<QueueEntry[]>;
  setQueue: (q: QueueEntry[]) => Promise<QueueEntry[]>;
  getFavorites: () => Promise<QueueEntry[]>;
  setFavorites: (f: QueueEntry[]) => Promise<QueueEntry[]>;
  getSongs: () => Promise<StoredSong[]>;
  setSongs: (songs: StoredSong[]) => Promise<StoredSong[]>;
  getSlideDecks: () => Promise<StoredSlideDeck[]>;
  setSlideDecks: (decks: StoredSlideDeck[]) => Promise<StoredSlideDeck[]>;
  importSlideDeck: () => Promise<SlideImportResult | null>;
  discardSlideSource: (file: string) => Promise<boolean>;
  readSlideSource: (file: string) => Promise<string | null>;
  saveSlidePngs: (images: string[]) => Promise<string[] | null>;
  convertPptx: (request: { deckId: string; file: string; total: number }) => Promise<{ ok: true; images: string[] } | { ok: false; error: string }>;
  onSlideProgress: (callback: (progress: { deckId: string; done: number; total: number }) => void) => () => void;
  listDisplays: () => Promise<DisplayInfo[]>;
  openProjector: () => Promise<boolean>;
  getProjectorBounds: () => Promise<{ width: number; height: number } | null>;
  onProjectorBounds: (cb: (bounds: { width: number; height: number }) => void) => () => void;
  showOnProjector: (p: ProjectorPayload) => Promise<boolean>;
  pickBackgroundImage: () => Promise<string | null>;
  saveBackgroundThumbnail: (videoPath: string, jpegBase64: string) => Promise<boolean>;
  deleteBackgroundMedia: (path: string) => Promise<boolean>;
  getAppUpdateState: () => Promise<AppUpdateState>;
  startAppUpdate: () => Promise<AppUpdateState>;
  installAppUpdate: () => Promise<AppUpdateState>;
  onAppUpdateState: (cb: (state: AppUpdateState) => void) => () => void;
  onProjectorUpdate: (cb: (p: ProjectorPayload) => void) => () => void;
  onBibleDownloadProgress: (cb: (progress: BibleDownloadProgress) => void) => () => void;
  onOperatorShortcut: (cb: (data: { action: string }) => void) => () => void;
}

declare global {
  interface Window {
    proyector?: ProyectorApi;
    __LUMEN_BROWSER__?: boolean;
  }
}
