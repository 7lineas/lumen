import { app, BrowserWindow, ipcMain, shell } from "electron";
import { UPDATE_FEED_URL } from "../shared/app-update";

export type UpdaterStatus = {
  version: string;
  platform: NodeJS.Platform;
  packaged: boolean;
  portable: boolean;
  supported: boolean;
  feedUrl: string;
};

export type UpdaterRendererEvent =
  | { type: "checking-for-update" }
  | { type: "update-available"; version: string }
  | { type: "update-not-available"; version: string }
  | { type: "download-progress"; percent: number }
  | { type: "update-downloaded"; version: string }
  | { type: "error"; message: string };

export function isPortableExe(exePath = app.getPath("exe")): boolean {
  if (process.env.PORTABLE_EXECUTABLE_DIR) return true;
  return /portable/i.test(exePath);
}

export function isUpdaterSupported(
  platform = process.platform,
  packaged = app.isPackaged,
  portable = isPortableExe(),
): boolean {
  // electron-updater handles the installed NSIS build on Windows.
  // Portable, unpackaged dev runs and other platforms fall back to a manual download.
  if (!packaged) return false;
  if (platform !== "win32") return false;
  if (portable) return false;
  return true;
}

export function updaterStatus(): UpdaterStatus {
  const portable = app.isPackaged ? isPortableExe() : false;
  return {
    version: app.getVersion(),
    platform: process.platform,
    packaged: app.isPackaged,
    portable,
    supported: isUpdaterSupported(process.platform, app.isPackaged, portable),
    feedUrl: UPDATE_FEED_URL,
  };
}

function sendToOperator(event: UpdaterRendererEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send("updater:event", event);
    }
  }
}

let initialized = false;

async function loadAutoUpdater() {
  // Imported lazily so unit tests and dev runs without the feed still work.
  const { autoUpdater } = await import("electron-updater");
  return autoUpdater;
}

export function initAutoUpdater(): void {
  if (initialized) return;
  initialized = true;
  if (!app.isPackaged || process.platform !== "win32") return;

  void loadAutoUpdater().then((autoUpdater) => {
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    try {
      autoUpdater.setFeedURL({ provider: "generic", url: UPDATE_FEED_URL });
    } catch {
      // setFeedURL throws only for a malformed feed; the check handler reports it.
    }

    autoUpdater.on("checking-for-update", () => {
      sendToOperator({ type: "checking-for-update" });
    });
    autoUpdater.on("update-available", (info) => {
      sendToOperator({ type: "update-available", version: String(info?.version ?? "") });
    });
    autoUpdater.on("update-not-available", (info) => {
      sendToOperator({ type: "update-not-available", version: String(info?.version ?? "") });
    });
    autoUpdater.on("download-progress", (progress) => {
      const percent = Math.round(progress?.percent ?? 0);
      sendToOperator({ type: "download-progress", percent });
    });
    autoUpdater.on("update-downloaded", (info) => {
      sendToOperator({ type: "update-downloaded", version: String(info?.version ?? "") });
    });
    autoUpdater.on("error", (error) => {
      sendToOperator({
        type: "error",
        message: error instanceof Error ? error.message : "No se pudo buscar la actualización",
      });
    });
  });
}

function safeDownloadUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith(`${UPDATE_FEED_URL}/`)) return null;
  if (trimmed.includes("..") || trimmed.includes(" ") || trimmed.includes("\\")) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:") return null;
    return url.href;
  } catch {
    return null;
  }
}

export function registerUpdaterHandlers(): void {
  ipcMain.handle("updater:status", () => updaterStatus());

  ipcMain.handle("updater:check", async () => {
    const autoUpdater = await loadAutoUpdater();
    if (!isUpdaterSupported()) {
      throw new Error("La actualización automática solo está disponible en la versión instalada de Windows");
    }
    try {
      autoUpdater.setFeedURL({ provider: "generic", url: UPDATE_FEED_URL });
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "Fuente de actualización no válida");
    }
    const result = await autoUpdater.checkForUpdates();
    return {
      version: result?.updateInfo?.version ?? null,
      updateAvailable: Boolean(result?.cancellationToken == null && result?.updateInfo),
    };
  });

  ipcMain.handle("updater:download", async () => {
    const autoUpdater = await loadAutoUpdater();
    if (!isUpdaterSupported()) {
      throw new Error("La actualización automática solo está disponible en la versión instalada de Windows");
    }
    await autoUpdater.downloadUpdate();
    return true;
  });

  ipcMain.handle("updater:install", () => {
    void loadAutoUpdater().then((autoUpdater) => {
      autoUpdater.quitAndInstall(false, true);
    });
    return true;
  });

  ipcMain.handle("updater:openDownload", async (_event, url: unknown) => {
    const safe = safeDownloadUrl(url);
    if (!safe) throw new Error("Enlace de descarga no válido");
    await shell.openExternal(safe);
    return true;
  });
}
