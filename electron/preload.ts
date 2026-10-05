import { contextBridge, ipcRenderer } from "electron";
import type { BibleImportPickResult, BibleImportCommitResult } from "../shared/bible-import/types";
import type { ImportMetaInput } from "../shared/bible-import/build";
import type { AppUpdateState } from "../shared/app-update";
import type { ChapterResult, OnlineVersionsResult } from "../shared/youversion";
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
  getBrowserAccess: () => ipcRenderer.invoke("browser:status"),
  setBrowserAccess: (enabled: boolean) => ipcRenderer.invoke("browser:configure", enabled),
  listBibleVersions: (): Promise<unknown[]> => ipcRenderer.invoke("bibles:list"),
  loadBible: (id: string): Promise<unknown> => ipcRenderer.invoke("bibles:load", id),
  listOnlineBibles: (force?: boolean): Promise<OnlineVersionsResult> => ipcRenderer.invoke("yvp:versions", force === true),
  getOnlineChapter: (id: string, book: string, chapter: number): Promise<ChapterResult> =>
    ipcRenderer.invoke("yvp:chapter", id, book, chapter),
  getBibleCatalog: (): Promise<BibleLibraryView> => ipcRenderer.invoke("bibles:catalog"),
  downloadBible: (id: string): Promise<{ id: string }> => ipcRenderer.invoke("bibles:download", id),
  removeBible: (id: string): Promise<{ settings: AppSettings }> => ipcRenderer.invoke("bibles:remove", id),
  pickBibleImport: (): Promise<BibleImportPickResult> => ipcRenderer.invoke("bibles:import-pick"),
  commitBibleImport: (previewId: string, input: ImportMetaInput): Promise<BibleImportCommitResult> =>
    ipcRenderer.invoke("bibles:import-commit", previewId, input),
  cancelBibleImport: (): Promise<void> => ipcRenderer.invoke("bibles:import-cancel"),
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
  saveBackgroundThumbnail: (filePath: string, jpegBase64: string): Promise<boolean> =>
    ipcRenderer.invoke("background:saveThumbnail", filePath, jpegBase64),
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
  getAppUpdateState: (): Promise<AppUpdateState> => ipcRenderer.invoke("updater:get-state"),
  startAppUpdate: (): Promise<AppUpdateState> => ipcRenderer.invoke("updater:start"),
  installAppUpdate: (): Promise<AppUpdateState> => ipcRenderer.invoke("updater:install"),
  onAppUpdateState: (cb: (state: AppUpdateState) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, state: AppUpdateState) => cb(state);
    ipcRenderer.on("updater:state", handler);
    return () => ipcRenderer.removeListener("updater:state", handler);
  },
});
