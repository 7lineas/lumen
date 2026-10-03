import { contextBridge, ipcRenderer } from "electron";
import type { AppSettings, HistoryEntry, ProjectorPayload, QueueEntry } from "../shared/types";

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
  getHistory: (): Promise<HistoryEntry[]> => ipcRenderer.invoke("history:get"),
  addHistory: (e: HistoryEntry): Promise<HistoryEntry[]> => ipcRenderer.invoke("history:add", e),
  getQueue: (): Promise<QueueEntry[]> => ipcRenderer.invoke("queue:get"),
  setQueue: (q: QueueEntry[]): Promise<QueueEntry[]> => ipcRenderer.invoke("queue:set", q),
  getFavorites: (): Promise<QueueEntry[]> => ipcRenderer.invoke("favorites:get"),
  setFavorites: (f: QueueEntry[]): Promise<QueueEntry[]> => ipcRenderer.invoke("favorites:set", f),
  listDisplays: (): Promise<DisplayInfo[]> => ipcRenderer.invoke("displays:list"),
  openProjector: (): Promise<boolean> => ipcRenderer.invoke("projector:open"),
  showOnProjector: (p: ProjectorPayload): Promise<boolean> => ipcRenderer.invoke("projector:show", p),
  pickBackgroundImage: (): Promise<string | null> => ipcRenderer.invoke("dialog:openImage"),
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
