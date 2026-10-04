import { contextBridge, ipcRenderer } from "electron";
import type { AppSettings, HistoryEntry, ProjectorPayload, QueueEntry, StoredSong, StoredSlideDeck, SlideImportResult } from "../shared/types";

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

export interface DisplayInfo {
  id: number;
  label: string;
  primary: boolean;
  bounds: { x: number; y: number; width: number; height: number };
}

contextBridge.exposeInMainWorld("proyector", {
  listBibleVersions: (): Promise<unknown[]> => ipcRenderer.invoke("bibles:list"),
  loadBible: (id: string): Promise<unknown> => ipcRenderer.invoke("bibles:load", id),
  getBibleCatalog: (): Promise<BibleLibraryView> => ipcRenderer.invoke("bibles:catalog"),
  downloadBible: (id: string): Promise<{ id: string }> => ipcRenderer.invoke("bibles:download", id),
  removeBible: (id: string): Promise<{ settings: AppSettings }> => ipcRenderer.invoke("bibles:remove", id),
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke("settings:get"),
  setSettings: (s: AppSettings): Promise<boolean> => ipcRenderer.invoke("settings:set", s),
  onSettingsUpdate: (cb: (s: AppSettings) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, settings: AppSettings) => cb(settings);
    ipcRenderer.on("settings:update", handler);
    return () => ipcRenderer.removeListener("settings:update", handler);
  },
  getHistory: (): Promise<HistoryEntry[]> => ipcRenderer.invoke("history:get"),
  addHistory: (e: HistoryEntry): Promise<HistoryEntry[]> => ipcRenderer.invoke("history:add", e),
  getQueue: (): Promise<QueueEntry[]> => ipcRenderer.invoke("queue:get"),
  setQueue: (q: QueueEntry[]): Promise<QueueEntry[]> => ipcRenderer.invoke("queue:set", q),
  getFavorites: (): Promise<QueueEntry[]> => ipcRenderer.invoke("favorites:get"),
  setFavorites: (f: QueueEntry[]): Promise<QueueEntry[]> => ipcRenderer.invoke("favorites:set", f),
  getSongs: (): Promise<StoredSong[]> => ipcRenderer.invoke("songs:get"),
  setSongs: (songs: StoredSong[]): Promise<StoredSong[]> => ipcRenderer.invoke("songs:set", songs),
  getSlideDecks: (): Promise<StoredSlideDeck[]> => ipcRenderer.invoke("slides:get"),
  setSlideDecks: (decks: StoredSlideDeck[]): Promise<StoredSlideDeck[]> => ipcRenderer.invoke("slides:set", decks),
  importSlideDeck: (): Promise<SlideImportResult | null> => ipcRenderer.invoke("slides:import"),
  discardSlideSource: (file: string): Promise<boolean> => ipcRenderer.invoke("slides:discardSource", file),
  readSlideSource: (file: string): Promise<string | null> => ipcRenderer.invoke("slides:readFile", file),
  saveSlidePngs: (images: string[]): Promise<string[] | null> => ipcRenderer.invoke("slides:savePngs", images),
  convertPptx: (request: { deckId: string; file: string; total: number }): Promise<{ ok: true; images: string[] } | { ok: false; error: string }> =>
    ipcRenderer.invoke("slides:convertPptx", request),
  onSlideProgress: (callback: (progress: { deckId: string; done: number; total: number }) => void): (() => void) => {
    const listener = (_event: unknown, progress: { deckId: string; done: number; total: number }) => callback(progress);
    ipcRenderer.on("slides:progress", listener);
    return () => ipcRenderer.removeListener("slides:progress", listener);
  },
  listDisplays: (): Promise<DisplayInfo[]> => ipcRenderer.invoke("displays:list"),
  openProjector: (): Promise<boolean> => ipcRenderer.invoke("projector:open"),
  getProjectorBounds: (): Promise<{ width: number; height: number } | null> =>
    ipcRenderer.invoke("projector:bounds"),
  onProjectorBounds: (cb: (bounds: { width: number; height: number }) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, bounds: { width: number; height: number }) => cb(bounds);
    ipcRenderer.on("projector:bounds", handler);
    return () => ipcRenderer.removeListener("projector:bounds", handler);
  },
  showOnProjector: (p: ProjectorPayload): Promise<boolean> => ipcRenderer.invoke("projector:show", p),
  pickBackgroundImage: (): Promise<string | null> => ipcRenderer.invoke("dialog:openImage"),
  deleteBackgroundMedia: (filePath: string): Promise<boolean> => ipcRenderer.invoke("background:delete", filePath),
  onProjectorUpdate: (cb: (p: ProjectorPayload) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, payload: ProjectorPayload) => cb(payload);
    ipcRenderer.on("projector:update", handler);
    return () => ipcRenderer.removeListener("projector:update", handler);
  },
  onBibleDownloadProgress: (cb: (progress: BibleDownloadProgress) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, progress: BibleDownloadProgress) => cb(progress);
    ipcRenderer.on("bibles:download-progress", handler);
    return () => ipcRenderer.removeListener("bibles:download-progress", handler);
  },
  onOperatorShortcut: (cb: (data: { action: string }) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: { action: string }) => cb(data);
    ipcRenderer.on("operator:shortcut", handler);
    return () => ipcRenderer.removeListener("operator:shortcut", handler);
  },
  getAppUpdateStatus: (): Promise<{
    version: string;
    platform: NodeJS.Platform;
    packaged: boolean;
    portable: boolean;
    supported: boolean;
    feedUrl: string;
  }> => ipcRenderer.invoke("updater:status"),
  checkForAppUpdate: (): Promise<{ version: string | null; updateAvailable: boolean }> =>
    ipcRenderer.invoke("updater:check"),
  downloadAppUpdate: (): Promise<boolean> => ipcRenderer.invoke("updater:download"),
  installAppUpdate: (): Promise<boolean> => ipcRenderer.invoke("updater:install"),
  openAppDownload: (url: string): Promise<boolean> => ipcRenderer.invoke("updater:openDownload", url),
  onAppUpdateEvent: (
    cb: (event: { type: string; version?: string; percent?: number; message?: string }) => void,
  ): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, event: { type: string }) => cb(event);
    ipcRenderer.on("updater:event", handler);
    return () => ipcRenderer.removeListener("updater:event", handler);
  },
});
