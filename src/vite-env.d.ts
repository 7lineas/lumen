/// <reference types="vite/client" />

import type { AppSettings, HistoryEntry, ProjectorPayload, QueueEntry } from "../shared/types";

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
  getBibleCatalog: () => Promise<BibleLibraryView>;
  downloadBible: (id: string) => Promise<{ id: string }>;
  removeBible: (id: string) => Promise<{ settings: AppSettings }>;
  getSettings: () => Promise<AppSettings>;
  setSettings: (s: AppSettings) => Promise<boolean>;
  getHistory: () => Promise<HistoryEntry[]>;
  addHistory: (e: HistoryEntry) => Promise<HistoryEntry[]>;
  getQueue: () => Promise<QueueEntry[]>;
  setQueue: (q: QueueEntry[]) => Promise<QueueEntry[]>;
  getFavorites: () => Promise<QueueEntry[]>;
  setFavorites: (f: QueueEntry[]) => Promise<QueueEntry[]>;
  listDisplays: () => Promise<DisplayInfo[]>;
  openProjector: () => Promise<boolean>;
  showOnProjector: (p: ProjectorPayload) => Promise<boolean>;
  pickBackgroundImage: () => Promise<string | null>;
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
