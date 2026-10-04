import { app, BrowserWindow, ipcMain, net, shell } from "electron";
import { UPDATE_FEED_URL, type AppUpdateMode, type AppUpdateState } from "../shared/app-update";
import { createUpdateController, type UpdateBackend, type UpdateController } from "./update-controller";

export function isPortableExe(exePath = app.getPath("exe")): boolean {
  if (process.env.PORTABLE_EXECUTABLE_DIR) return true;
  return /portable/i.test(exePath);
}

/**
 * - Instalador NSIS de Windows: electron-updater descarga e instala (`auto`).
 * - Portable de Windows: no puede reemplazarse a sí mismo; solo avisa y abre la descarga (`manual`).
 * - Ejecución sin empaquetar u otras plataformas: sin actualizaciones (`disabled`).
 * - Solo para pruebas: sin empaquetar y con `LUMEN_UPDATE_DEV_FEED`, usa electron-updater contra ese feed.
 */
export function resolveUpdateMode(options: {
  platform: NodeJS.Platform;
  packaged: boolean;
  portable: boolean;
  devFeed?: string | null;
}): AppUpdateMode {
  if (!options.packaged) return options.devFeed ? "auto" : "disabled";
  if (options.platform !== "win32") return "disabled";
  return options.portable ? "manual" : "auto";
}

function devFeedUrl(): string | null {
  if (app.isPackaged) return null;
  const value = process.env.LUMEN_UPDATE_DEV_FEED?.trim();
  return value ? value.replace(/\/+$/, "") : null;
}

/** Solo URLs https del bucket de descargas (nunca algo que llegue del renderer). */
export function safeDownloadUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith(`${UPDATE_FEED_URL}/`)) return null;
  if (trimmed.includes("..") || trimmed.includes(" ") || trimmed.includes("\\")) return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

interface ReleasesManifest {
  version?: unknown;
  files?: Array<{ id?: unknown; filename?: unknown }>;
}

export function pickManualDownload(manifest: ReleasesManifest, portable: boolean): { version: string; url: string } | null {
  const version = typeof manifest.version === "string" ? manifest.version : "";
  if (!version) return null;
  const wanted = portable ? "portable" : "setup";
  const file = manifest.files?.find((entry) => entry.id === wanted && typeof entry.filename === "string");
  if (!file) return null;
  const url = safeDownloadUrl(`${UPDATE_FEED_URL}/${String(file.filename)}`);
  return url ? { version, url } : null;
}

function createManualBackend(portable: boolean): UpdateBackend {
  let target: { version: string; url: string } | null = null;
  return {
    async check() {
      const response = await net.fetch(`${UPDATE_FEED_URL}/releases.json`, {
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error(`releases.json respondió ${response.status}`);
      target = pickManualDownload((await response.json()) as ReleasesManifest, portable);
      return target ? { version: target.version } : null;
    },
    async download() {
      if (!target) throw new Error("No hay descarga disponible");
      await shell.openExternal(target.url);
    },
    install() {
      throw new Error("La versión portable no se instala sola");
    },
  };
}

async function createAutoBackend(feedUrl: string, forceDev: boolean): Promise<UpdateBackend> {
  // Carga perezosa: las pruebas y el modo desarrollo no la necesitan.
  const { autoUpdater } = await import("electron-updater");
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;
  autoUpdater.allowDowngrade = false;
  if (forceDev) autoUpdater.forceDevUpdateConfig = true;
  autoUpdater.setFeedURL({ provider: "generic", url: feedUrl });
  // Sin oyente, un "error" asíncrono del actualizador sería una excepción no capturada;
  // los fallos ya llegan al controlador por las promesas y el vigilante de instalación.
  autoUpdater.on("error", (error: unknown) => {
    log(`[updater] evento de error: ${error instanceof Error ? error.message : String(error)}`);
  });
  return {
    async check() {
      const result = await autoUpdater.checkForUpdates();
      return result?.updateInfo?.version ? { version: String(result.updateInfo.version) } : null;
    },
    async download(onProgress) {
      const listener = (progress: { percent?: number }) => onProgress(progress?.percent ?? 0);
      autoUpdater.on("download-progress", listener);
      try {
        await autoUpdater.downloadUpdate();
      } finally {
        autoUpdater.removeListener("download-progress", listener);
      }
    },
    install() {
      // Instalación silenciosa y reapertura de Lumen al terminar.
      autoUpdater.quitAndInstall(true, true);
    },
  };
}

export interface UpdaterSetup {
  getOperatorWindow: () => BrowserWindow | null;
  isProjectionActive: () => boolean;
}

let controller: UpdateController | null = null;

function log(message: string): void {
  console.log(message);
}

export function setupUpdater(setup: UpdaterSetup): void {
  if (controller) return;
  const devFeed = devFeedUrl();
  const portable = app.isPackaged ? isPortableExe() : false;
  const mode = resolveUpdateMode({ platform: process.platform, packaged: app.isPackaged, portable, devFeed });

  const lazyBackend: UpdateBackend = (() => {
    let backend: Promise<UpdateBackend> | null = null;
    const get = () => {
      backend ??=
        mode === "manual"
          ? Promise.resolve(createManualBackend(portable))
          : createAutoBackend(devFeed ?? UPDATE_FEED_URL, devFeed !== null);
      return backend;
    };
    let resolved: UpdateBackend | null = null;
    void get().then((value) => {
      resolved = value;
    }).catch(() => undefined);
    return {
      check: async () => (await get()).check(),
      download: async (onProgress) => (await get()).download(onProgress),
      install: () => {
        if (!resolved) throw new Error("El actualizador no está listo");
        resolved.install();
      },
    };
  })();

  controller = createUpdateController({
    backend: lazyBackend,
    currentVersion: app.getVersion(),
    mode,
    isOnline: () => devFeed !== null || net.isOnline(),
    isProjectionActive: setup.isProjectionActive,
    log,
    onState: (state: AppUpdateState) => {
      const win = setup.getOperatorWindow();
      if (win && !win.isDestroyed()) win.webContents.send("updater:state", state);
    },
  });

  const fromOperator = (event: Electron.IpcMainInvokeEvent): boolean => {
    const win = setup.getOperatorWindow();
    return Boolean(win && !win.isDestroyed() && event.sender === win.webContents);
  };

  ipcMain.handle("updater:get-state", () => controller?.getState());
  ipcMain.handle("updater:start", (event) => (fromOperator(event) ? controller?.startUpdate() : controller?.getState()));
  ipcMain.handle("updater:install", (event) => (fromOperator(event) ? controller?.install() : controller?.getState()));

  controller.start();
}
