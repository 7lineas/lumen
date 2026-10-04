/// <reference types="vite/client" />

import type { BibleImportPickResult, BibleImportCommitResult } from "../shared/bible-import/types";
import type { ImportMetaInput } from "../shared/bible-import/build";
import type { ChapterResult, OnlineVersionsResult } from "../shared/youversion";
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

export interface AppUpdateStatus {
  version: string;
  platform: NodeJS.Platform;
  packaged: boolean;
  portable: boolean;
  supported: boolean;
  feedUrl: string;
}

export interface AppUpdateEvent {
  type:
    | "checking-for-update"
    | "update-available"
    | "update-not-available"
    | "download-progress"
    | "update-downloaded"
    | "error";
  version?: string;
  percent?: number;
  message?: string;
}

export interface ProyectorApi {
  listBibleVersions: () => Promise<Array<{ id: string; name: string; abbr: string; language: string }>>;
  loadBible: (id: string) => Promise<unknown>;
  listOnlineBibles: (force?: boolean) => Promise<OnlineVersionsResult>;
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
  deleteBackgroundMedia: (path: string) => Promise<boolean>;
  getAppUpdateStatus: () => Promise<AppUpdateStatus>;
  checkForAppUpdate: () => Promise<{ version: string | null; updateAvailable: boolean }>;
  downloadAppUpdate: () => Promise<boolean>;
  installAppUpdate: () => Promise<boolean>;
  openAppDownload: (url: string) => Promise<boolean>;
  onAppUpdateEvent: (cb: (event: AppUpdateEvent) => void) => () => void;
  onProjectorUpdate: (cb: (p: ProjectorPayload) => void) => () => void;
  onBibleDownloadProgress: (cb: (progress: BibleDownloadProgress) => void) => () => void;
  onOperatorShortcut: (cb: (data: { action: string }) => void) => () => void;
}

declare global {
  interface Window {
    proyector?: ProyectorApi;
  }
}
