import {
  app,
  BrowserWindow,
  ipcMain,
  screen,
  globalShortcut,
  dialog,
  Menu,
  net,
  nativeImage,
  protocol,
} from "electron";
import path from "path";
import { pathToFileURL } from "url";
import fs from "fs";
import { Readable } from "node:stream";
import os from "node:os";
import { randomInt } from "node:crypto";
import Store from "electron-store";
import { isPdfPath } from "../shared/slide-deck";
import { renderPptxInWorker } from "./pptx-render";
import {
  countPptxSlides,
  isAudioPath,
  isPptxPath,
  isSlideImagePath,
  isVideoPath,
  sanitizeSlideDecks,
  sortImagePathsNumerically,
} from "./slides-import";

function slideImagesDir(): string {
  return path.join(app.getPath("userData"), "slide-images");
}

function slideDecksDir(): string {
  return path.join(app.getPath("userData"), "slide-decks");
}

/** Video and audio imported in the Media workspace. */
function mediaFilesDir(): string {
  return path.join(app.getPath("userData"), "media-files");
}

/** Folders under userData whose files may be shown or played in the app windows. */
const SERVED_MEDIA_DIRS = [
  "background-images",
  "logo-images",
  "slide-images",
  "media-files",
  "fonts",
];

const MEDIA_CONTENT_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".ogv": "video/ogg",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".ogg": "application/ogg",
  ".oga": "audio/ogg",
  ".opus": "audio/ogg",
  ".flac": "audio/flac",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

/**
 * Serve part of a managed file. Chromium asks for audio and video with a
 * Range header and can only seek when it gets a 206 back, which net.fetch on
 * a file:// URL does not give.
 */
const MEDIA_CHUNK_BYTES = 1024 * 1024;

function rangeResponse(target: string, rangeHeader: string): Response | null {
  const size = fs.statSync(target).size;
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match || (!match[1] && !match[2])) return null;
  const start = match[1]
    ? Number(match[1])
    : Math.max(0, size - Number(match[2]));
  const end =
    match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (start >= size || end < start) {
    return new Response(null, {
      status: 416,
      headers: { "content-range": `bytes */${size}`, "accept-ranges": "bytes" },
    });
  }
  // Large chunks: a video is read through this process, and 64 KB pieces make an hour-long file tens of thousands of hops.
  const stream = Readable.toWeb(
    fs.createReadStream(target, {
      start,
      end,
      highWaterMark: MEDIA_CHUNK_BYTES,
    }),
  ) as unknown as ReadableStream;
  return new Response(stream, {
    status: 206,
    headers: {
      "content-type":
        MEDIA_CONTENT_TYPES[path.extname(target).toLowerCase()] ??
        "application/octet-stream",
      "content-length": String(end - start + 1),
      "content-range": `bytes ${start}-${end}/${size}`,
      "accept-ranges": "bytes",
    },
  });
}

/**
 * Copy off the main thread: a synchronous copy of an hour-long video freezes
 * every window until it ends. FICLONE makes it instant where the disk allows.
 */
async function copyToMediaFiles(filePath: string): Promise<string | null> {
  try {
    const dir = mediaFilesDir();
    await fs.promises.mkdir(dir, { recursive: true });
    const ext = path.extname(filePath).toLowerCase();
    const storedPath = path.join(
      dir,
      `${Date.now()}-${Math.random().toString(36).slice(2, 9)}${ext}`,
    );
    await fs.promises.copyFile(
      filePath,
      storedPath,
      fs.constants.COPYFILE_FICLONE,
    );
    return storedPath;
  } catch (error) {
    console.error("[media] copyToMediaFiles failed", error);
    return null;
  }
}

/** Delete managed video/audio files no longer referenced by any stored item. */
function pruneOrphanMediaFiles(next: Array<{ file?: string }>): void {
  try {
    const dir = path.resolve(mediaFilesDir());
    if (!fs.existsSync(dir)) return;
    const referenced = new Set(
      next.flatMap((item) => (item.file ? [item.file] : [])),
    );
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (!referenced.has(full) && !isRecent(full))
        fs.rmSync(full, { force: true });
    }
  } catch {
    // pruning is best-effort
  }
}

/** Copy an original .pptx into app data so the renderer can rasterize it. */
function copyPptxToSlideDecks(deckId: string, filePath: string): string | null {
  try {
    const dir = slideDecksDir();
    fs.mkdirSync(dir, { recursive: true });
    const storedPath = path.join(dir, `${deckId}.pptx`);
    fs.copyFileSync(filePath, storedPath);
    return storedPath;
  } catch (error) {
    console.error("[slides] copyPptxToSlideDecks failed", error);
    return null;
  }
}

/** Copy an original PDF into app data so the renderer can rasterize it. */
function copyPdfToSlideDecks(deckId: string, pdfPath: string): string | null {
  try {
    const dir = slideDecksDir();
    fs.mkdirSync(dir, { recursive: true });
    const storedPath = path.join(dir, `${deckId}.pdf`);
    fs.copyFileSync(pdfPath, storedPath);
    return storedPath;
  } catch (error) {
    console.error("[slides] copyPdfToSlideDecks failed", error);
    return null;
  }
}

function copyToSlideImages(filePath: string): string | null {
  try {
    const dir = slideImagesDir();
    fs.mkdirSync(dir, { recursive: true });
    const ext = path.extname(filePath).toLowerCase();
    const storedPath = path.join(
      dir,
      `${Date.now()}-${Math.random().toString(36).slice(2, 9)}${ext}`,
    );
    fs.copyFileSync(filePath, storedPath);
    return storedPath;
  } catch (error) {
    console.error("[slides] copyToSlideImages failed", error);
    return null;
  }
}

/** Files younger than this are never pruned: they may belong to an import/conversion whose deck is not persisted yet. */
const PRUNE_GRACE_MS = 5 * 60 * 1000;

function isRecent(fullPath: string): boolean {
  try {
    return Date.now() - fs.statSync(fullPath).mtimeMs < PRUNE_GRACE_MS;
  } catch {
    return false;
  }
}

/** Delete managed slide images no longer referenced by any stored deck. */
function pruneOrphanSlideImages(
  next: Array<{ images: Array<string | null> }>,
): void {
  try {
    const dir = path.resolve(slideImagesDir());
    if (!fs.existsSync(dir)) return;
    const referenced = new Set(
      next
        .flatMap((deck) => deck.images)
        .filter((entry): entry is string => typeof entry === "string"),
    );
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (!referenced.has(full) && !isRecent(full)) {
        try {
          fs.rmSync(full, { force: true });
        } catch {
          // ignore single-file failures
        }
      }
    }
  } catch {
    // pruning is best-effort
  }
}

/** Sources (original PPTX/PDF) are only needed while converting or retrying; drop stale leftovers. */
const SOURCE_MAX_AGE_MS = 60 * 60 * 1000;

function pruneStaleSlideSources(): void {
  try {
    const dir = path.resolve(slideDecksDir());
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      try {
        if (Date.now() - fs.statSync(full).mtimeMs > SOURCE_MAX_AGE_MS)
          fs.rmSync(full, { force: true });
      } catch {
        // ignore single-file failures
      }
    }
  } catch {
    // pruning is best-effort
  }
}
import type {
  AppSettings,
  ProjectorPayload,
  QueueEntry,
  HistoryEntry,
  StoredSong,
  StoredText,
  StoredSlideDeck,
  SlideImportResult,
} from "../shared/types";
import { DEFAULT_SETTINGS } from "../shared/types";
import {
  buildBibleDataCandidates,
  resolveBibleDataDir,
} from "./bible-data-path";
import { setupUpdater } from "./updater";
import { YouVersionClient, resolveAppKey } from "./youversion";
import {
  buildLibraryView,
  bundledIds,
  catalogCandidates,
  downloadModule,
  listSelectableVersions,
  nodeFetch,
  readCatalogFile,
  removeModule,
  resolveCatalog,
  resolveCatalogPath,
  resolveModulePath,
} from "./bible-library";
import { ImportSession } from "./bible-import";
import {
  installGoogleFont,
  installedFontId,
  loadGoogleFontCatalog,
  previewGoogleFont,
  removeInstalledFont,
  searchGoogleFonts,
  type GoogleFontEntry,
} from "./google-fonts";
import {
  isFontFamilyId,
  type FontFamilyId,
  type InstalledFont,
} from "../shared/fonts";
import type { ImportMetaInput } from "../shared/bible-import/build";
import {
  publishBrowserEvent,
  registerBrowserRpc,
  rotateBrowserPairingCode,
  startBrowserService,
  stopBrowserService,
} from "./browser-service";

function registerIpcHandle<TArgs extends unknown[], TResult>(
  channel: string,
  handler: (event: Electron.IpcMainInvokeEvent, ...args: TArgs) => TResult,
): void {
  ipcMain.handle(channel, handler as never);
  registerBrowserRpc(channel, (args) =>
    handler(
      {
        sender: {
          isDestroyed: () => false,
          send: (event: string, payload: unknown) =>
            publishBrowserEvent(event, payload),
        },
      } as unknown as Electron.IpcMainInvokeEvent,
      ...(args as TArgs),
    ),
  );
}

// Isolated profile for automated checks (never used in normal installs).
if (process.env.LUMEN_TEST_USERDATA) {
  app.setPath("userData", path.resolve(process.env.LUMEN_TEST_USERDATA));
}

const store = new Store<{
  settings: AppSettings;
  history: HistoryEntry[];
  queue: QueueEntry[];
  favorites: QueueEntry[];
  songs: StoredSong[];
  texts: StoredText[];
  slideDecks: StoredSlideDeck[];
  browserAccess: { enabled: boolean; pairingCode: string };
  installedFonts: InstalledFont[];
}>({
  defaults: {
    settings: DEFAULT_SETTINGS,
    history: [],
    queue: [],
    favorites: [],
    songs: [],
    texts: [],
    slideDecks: [],
    browserAccess: { enabled: false, pairingCode: "" },
    installedFonts: [],
  },
});

let operatorWindow: BrowserWindow | null = null;
let projectorWindow: BrowserWindow | null = null;
let projectorReady = false;
let pendingProjectorPayload: ProjectorPayload | null = null;
let lastProjectorPayload: ProjectorPayload | null = null;
let lastProjectorMode: ProjectorPayload["mode"] | null = null;
const isDev = !app.isPackaged && process.env.PROYECTOR_SCREENSHOT !== "1";

// Video and audio elements need the stream privilege when served through a
// custom protocol. Without it Chromium can load an image but leaves videos
// black because media range/stream requests are rejected.
protocol.registerSchemesAsPrivileged([
  {
    scheme: "lumen-media",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
]);

function devServerUrl(): string {
  const fromPlugin = process.env.VITE_DEV_SERVER_URL;
  if (fromPlugin)
    return fromPlugin.endsWith("/") ? fromPlugin : `${fromPlugin}/`;
  const port = process.env.PORT ?? "43123";
  return `http://localhost:${port}/`;
}

function getPreload(): string {
  return path.join(__dirname, "preload.js");
}

let bibleDataDir: string | null = null;

function biblesPath(): string {
  if (!bibleDataDir) {
    bibleDataDir = resolveBibleDataDir(
      buildBibleDataCandidates(
        process.resourcesPath,
        app.getAppPath(),
        __dirname,
        process.cwd(),
      ),
    );
  }
  return bibleDataDir;
}

function userBiblesDir(): string {
  return path.join(app.getPath("userData"), "bibles");
}

function userFontsDir(): string {
  return path.join(app.getPath("userData"), "fonts");
}

function googleFontsCatalogFile(): string {
  return path.join(app.getPath("userData"), "google-fonts-catalog.json");
}

/** Tells every window which fonts can be used now, so the projector and the operator load the same faces. */
function broadcastInstalledFonts(): void {
  const fonts = store.get("installedFonts");
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send("fonts:update", fonts);
  }
  publishBrowserEvent("fonts:update", fonts);
}

function catalogPath(): string {
  return resolveCatalogPath(
    catalogCandidates(
      process.resourcesPath,
      app.getAppPath(),
      __dirname,
      process.cwd(),
    ),
  );
}

function currentSettings(): AppSettings {
  return { ...DEFAULT_SETTINGS, ...store.get("settings") };
}

/**
 * Window/taskbar/dock icon. Windows needs the multi-size .ico (the taskbar
 * picks 24/32/48/256 from it); it ships both inside the asar and as a loose
 * file in resources. Elsewhere the PNG is used.
 */
function appIconPath(): string {
  if (process.platform === "win32") {
    const loose = path.join(process.resourcesPath, "icon.ico");
    if (app.isPackaged && fs.existsSync(loose)) return loose;
    return path.join(app.getAppPath(), "build/icon.ico");
  }
  return path.join(app.getAppPath(), "build/icon.png");
}

function createOperatorWindow(): void {
  operatorWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 680,
    icon: appIconPath(),
    title: "Lumen",
    // The app's top bar is the window title bar (same as Lectern): macOS keeps
    // the traffic lights inside it. Elsewhere the window is frameless and the top
    // bar draws its own window controls, so dialogs can cover them like any content.
    ...(process.platform === "darwin"
      ? {
          titleBarStyle: "hiddenInset" as const,
          trafficLightPosition: { x: 16, y: 16 },
        }
      : { frame: false }),
    autoHideMenuBar: true,
    webPreferences: {
      preload: getPreload(),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    void operatorWindow.loadURL(devServerUrl());
    operatorWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    void operatorWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  operatorWindow.on("closed", () => {
    operatorWindow = null;
    if (projectorWindow) {
      projectorWindow.close();
    }
  });

  const sendMaximized = () => {
    if (operatorWindow && !operatorWindow.isDestroyed()) {
      operatorWindow.webContents.send(
        "window:maximized",
        operatorWindow.isMaximized(),
      );
    }
  };
  operatorWindow.on("maximize", sendMaximized);
  operatorWindow.on("unmaximize", sendMaximized);
}

// Window controls for the frameless operator window (see the top bar). Only the
// operator window may drive them, so these stay off the LAN browser RPC.
ipcMain.handle(
  "window:control",
  (event, action: "minimize" | "toggle-maximize" | "close") => {
    const win = operatorWindow;
    if (!win || win.isDestroyed() || event.sender !== win.webContents) return;
    if (action === "minimize") win.minimize();
    else if (action === "toggle-maximize") {
      if (win.isMaximized()) win.unmaximize();
      else win.maximize();
    } else if (action === "close") win.close();
  },
);
ipcMain.handle("window:is-maximized", (event) => {
  const win = operatorWindow;
  return Boolean(
    win &&
    !win.isDestroyed() &&
    event.sender === win.webContents &&
    win.isMaximized(),
  );
});

function getTargetDisplay(): Electron.Display {
  const settings = store.get("settings");
  const displays = screen.getAllDisplays();
  if (settings.projectorDisplayId != null) {
    const found = displays.find((d) => d.id === settings.projectorDisplayId);
    if (found) return found;
  }
  const primary = screen.getPrimaryDisplay();
  const external = displays.find((d) => d.id !== primary.id);
  return external ?? primary;
}

function createProjectorWindow(): void {
  if (projectorWindow) {
    projectorWindow.focus();
    return;
  }

  const display = getTargetDisplay();
  const singleDisplay = displaysCount() <= 1;
  const width = singleDisplay
    ? Math.min(960, display.bounds.width - 48)
    : display.bounds.width;
  const height = singleDisplay
    ? Math.min(540, display.bounds.height - 96)
    : display.bounds.height;
  const x = singleDisplay
    ? display.bounds.x +
      Math.max(24, Math.round((display.bounds.width - width) / 2))
    : display.bounds.x;
  const y = singleDisplay
    ? display.bounds.y +
      Math.max(48, Math.round((display.bounds.height - height) / 2))
    : display.bounds.y;

  projectorReady = false;
  projectorWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    fullscreen: displaysCount() > 1,
    frame: displaysCount() <= 1,
    icon: appIconPath(),
    title: "Lumen — Proyección",
    backgroundColor: "#000000",
    autoHideMenuBar: true,
    webPreferences: {
      preload: getPreload(),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const hash = "#/projector";
  if (isDev) {
    void projectorWindow.loadURL(`${devServerUrl()}${hash}`);
  } else {
    void projectorWindow.loadFile(path.join(__dirname, "../dist/index.html"), {
      hash: "/projector",
    });
  }

  projectorWindow.webContents.on("did-finish-load", () => {
    projectorReady = true;
    const payload = pendingProjectorPayload ?? lastProjectorPayload;
    if (payload) {
      projectorWindow?.webContents.send("projector:update", payload);
      publishBrowserEvent("projector:update", payload);
      pendingProjectorPayload = null;
    }
  });

  projectorWindow.on("closed", () => {
    projectorWindow = null;
    lastProjectorMode = null;
    projectorReady = false;
  });

  projectorWindow.on("resize", emitProjectorBounds);
  // Content bounds are known once the window is shown; push them so the
  // operator live/preview screens can match the real window ratio.
  projectorWindow.once("show", emitProjectorBounds);
  projectorWindow.once("ready-to-show", emitProjectorBounds);
}

function displaysCount(): number {
  return screen.getAllDisplays().length;
}

function projectorContentBounds(): { width: number; height: number } | null {
  if (!projectorWindow || projectorWindow.isDestroyed()) return null;
  const { width, height } = projectorWindow.getContentBounds();
  if (width <= 0 || height <= 0) return null;
  return { width, height };
}

function emitProjectorBounds(): void {
  const bounds = projectorContentBounds();
  if (bounds && operatorWindow && !operatorWindow.isDestroyed()) {
    operatorWindow.webContents.send("projector:bounds", bounds);
  }
}

/** Hay una ventana de proyección abierta y mostrando algo (no en negro). */
function isProjectionActive(): boolean {
  return Boolean(
    projectorWindow &&
    !projectorWindow.isDestroyed() &&
    lastProjectorMode &&
    lastProjectorMode !== "blank",
  );
}

function sendToProjector(payload: ProjectorPayload): void {
  pendingProjectorPayload = payload;
  lastProjectorPayload = payload;
  lastProjectorMode = payload.mode;
  if (!projectorWindow) {
    createProjectorWindow();
  }
  if (projectorReady) {
    projectorWindow?.webContents.send("projector:update", payload);
    publishBrowserEvent("projector:update", payload);
    pendingProjectorPayload = null;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForOperatorReady(win: BrowserWindow): Promise<void> {
  for (let i = 0; i < 90; i++) {
    const ready = await win.webContents.executeJavaScript(`
      (() => {
        const text = document.body?.innerText ?? '';
        if (text.includes('Error') && text.includes('bibles:list')) return false;
        const preview = document.querySelector('[data-testid="preview-box"]');
        return preview && preview.textContent && preview.textContent.length > 20;
      })()
    `);
    if (ready) return;
    await delay(400);
  }
  const body = await win.webContents.executeJavaScript(
    "document.body.innerText",
  );
  throw new Error(
    `Operator UI did not load bibles. Body snippet: ${String(body).slice(0, 400)}`,
  );
}

async function captureScreenshots(): Promise<void> {
  const outDir = process.env.SCREENSHOT_OUT_DIR ?? "/opt/cursor/artifacts";
  fs.mkdirSync(outDir, { recursive: true });

  // Prove path resolution before UI loads
  const manifest = JSON.parse(
    fs.readFileSync(path.join(biblesPath(), "manifest.json"), "utf-8"),
  );
  if (!Array.isArray(manifest) || manifest.length < 1) {
    throw new Error("manifest.json vacío o inválido");
  }

  createOperatorWindow();
  if (!operatorWindow) throw new Error("No operator window");
  await operatorWindow.webContents
    .executeJavaScript(`
    localStorage.clear();
  `)
    .catch(() => undefined);
  await waitForOperatorReady(operatorWindow);

  await operatorWindow.webContents.executeJavaScript(`
    (() => {
      const input = document.querySelector('[data-testid="ref-input"]');
      if (input) {
        input.value = 'jn 3:16';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.blur();
      }
      const search = document.querySelector('[data-testid="keyword-input"]');
      if (search) {
        search.value = 'amor';
        search.dispatchEvent(new Event('input', { bubbles: true }));
      }
    })()
  `);
  await delay(500);
  createProjectorWindow();
  await delay(600);
  await operatorWindow.webContents.executeJavaScript(`
    document.querySelector('[data-testid="btn-project"]')?.click();
  `);
  await delay(900);

  const operatorImg = await operatorWindow.webContents.capturePage();
  fs.writeFileSync(
    path.join(outDir, "operator-window.png"),
    operatorImg.toPNG(),
  );

  await operatorWindow.webContents.executeJavaScript(`
    document.querySelector('[data-testid="tab-ajustes"]')?.click();
  `);
  await delay(600);
  const settingsImg = await operatorWindow.webContents.capturePage();
  fs.writeFileSync(
    path.join(outDir, "settings-window.png"),
    settingsImg.toPNG(),
  );

  operatorWindow.setSize(1280, 1700);
  await operatorWindow.webContents.executeJavaScript(`
    document.querySelector('[data-testid="tab-biblias"]')?.click();
  `);
  for (let i = 0; i < 40; i++) {
    const ready = await operatorWindow.webContents.executeJavaScript(`
      document.querySelectorAll('[data-testid="bible-list"] article').length >= 7
    `);
    if (ready) break;
    await delay(300);
  }
  const bibliasImg = await operatorWindow.webContents.capturePage();
  fs.writeFileSync(path.join(outDir, "biblias-window.png"), bibliasImg.toPNG());

  await operatorWindow.webContents.executeJavaScript(`
    document.querySelector('[data-slot="sheet-close"]')?.click();
  `);
  await delay(300);

  if (projectorWindow) {
    const img = await projectorWindow.webContents.capturePage();
    fs.writeFileSync(path.join(outDir, "projector-window.png"), img.toPNG());
  }

  app.quit();
}

app.whenReady().then(() => {
  app.setName("Lumen");
  // Warm the remote Bible catalog so the first Biblias overlay opens without waiting.
  void buildLibraryView(
    biblesPath(),
    userBiblesDir(),
    catalogPath(),
    nodeFetch,
  ).catch(() => undefined);
  app.setAppUserModelId("com.7lineas.lumen");
  Menu.setApplicationMenu(null);
  protocol.handle("lumen-media", async (request) => {
    const encodedPath = new URL(request.url).pathname.slice("/media/".length);
    const target = path.resolve(decodeURIComponent(encodedPath));
    const userData = path.resolve(app.getPath("userData"));
    // Only folders whose files are meant to be shown on screen. slide-decks
    // (original PPTX/PDF sources) is deliberately NOT served.
    const allowed = SERVED_MEDIA_DIRS.map(
      (dir) => `${path.join(userData, dir)}${path.sep}`,
    );
    if (!allowed.some((root) => target.startsWith(root)))
      return new Response("Forbidden", { status: 403 });
    const range = request.headers.get("range");
    let ranged: Response | null = null;
    if (range) {
      try {
        ranged = rangeResponse(target, range);
      } catch {
        return new Response("Not found", { status: 404 });
      }
    }
    const response =
      ranged ?? (await net.fetch(pathToFileURL(target).toString()));
    const origin = request.headers.get("origin");
    let localAppOrigin = origin === "null";
    if (origin && origin !== "null") {
      try {
        const parsed = new URL(origin);
        localAppOrigin =
          (parsed.protocol === "http:" || parsed.protocol === "https:") &&
          (parsed.hostname === "localhost" ||
            parsed.hostname === "127.0.0.1" ||
            parsed.hostname === "::1" ||
            parsed.hostname.endsWith(".localhost"));
      } catch {
        localAppOrigin = false;
      }
    }
    if (!localAppOrigin || !origin) return response;
    const headers = new Headers(response.headers);
    headers.set("access-control-allow-origin", origin);
    headers.set("vary", "Origin");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  });
  setupUpdater({ getOperatorWindow: () => operatorWindow, isProjectionActive });
  const browserAccess = store.get("browserAccess");
  const accessConfig =
    browserAccess.enabled && !/^\d{6}$/.test(browserAccess.pairingCode)
      ? {
          enabled: true,
          pairingCode: String(randomInt(0, 1_000_000)).padStart(6, "0"),
        }
      : browserAccess;
  if (accessConfig !== browserAccess) store.set("browserAccess", accessConfig);
  startBrowserService({
    root: path.join(app.getAppPath(), "dist"),
    userData: app.getPath("userData"),
    host: accessConfig.enabled ? "0.0.0.0" : "127.0.0.1",
    pairingCode: accessConfig.pairingCode || undefined,
  });
  if (process.platform === "darwin" && app.dock) {
    const dockIcon = nativeImage.createFromPath(appIconPath());
    if (!dockIcon.isEmpty()) app.dock.setIcon(dockIcon);
  }

  if (process.env.PROYECTOR_SCREENSHOT === "1") {
    void captureScreenshots();
    return;
  }

  createOperatorWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createOperatorWindow();
    }
  });
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  stopBrowserService();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

registerIpcHandle("bibles:list", () =>
  listSelectableVersions(biblesPath(), userBiblesDir()),
);

function browserAccessInfo() {
  const config = store.get("browserAccess");
  const isPrivateIpv4 = (address: string) => {
    const octets = address.split(".").map(Number);
    if (
      octets.length !== 4 ||
      octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
    )
      return false;
    const [first, second] = octets;
    return (
      first === 10 ||
      (first === 172 && second! >= 16 && second! <= 31) ||
      (first === 192 && second === 168) ||
      (first === 169 && second === 254)
    );
  };
  const addresses = Object.values(os.networkInterfaces()).flatMap((entries) =>
    (entries ?? [])
      .filter(
        (entry) =>
          (String(entry.family) === "IPv4" || String(entry.family) === "4") &&
          !entry.internal &&
          isPrivateIpv4(entry.address),
      )
      .map((entry) => entry.address),
  );
  const port = Number(process.env.LUMEN_BROWSER_PORT ?? 43124);
  return {
    enabled: config.enabled,
    pairingCode: config.pairingCode,
    port,
    addresses,
  };
}

registerIpcHandle("browser:status", () => browserAccessInfo());
registerIpcHandle("browser:configure", (_event, enabled: boolean) => {
  const stored = store.get("browserAccess");
  const previous =
    stored.enabled && !/^\d{6}$/.test(stored.pairingCode)
      ? {
          enabled: true,
          pairingCode: String(randomInt(0, 1_000_000)).padStart(6, "0"),
        }
      : stored;
  const next = {
    enabled: enabled === true,
    pairingCode: enabled
      ? previous.pairingCode || String(randomInt(0, 1_000_000)).padStart(6, "0")
      : "",
  };
  store.set("browserAccess", next);
  stopBrowserService();
  startBrowserService({
    root: path.join(app.getAppPath(), "dist"),
    userData: app.getPath("userData"),
    host: next.enabled ? "0.0.0.0" : "127.0.0.1",
    pairingCode: next.pairingCode,
  });
  return browserAccessInfo();
});
registerIpcHandle("browser:rotate-code", () => {
  const stored = store.get("browserAccess");
  if (!stored.enabled)
    throw new Error("El acceso desde otros dispositivos está apagado.");
  let pairingCode = stored.pairingCode;
  while (pairingCode === stored.pairingCode)
    pairingCode = String(randomInt(0, 1_000_000)).padStart(6, "0");
  store.set("browserAccess", { enabled: true, pairingCode });
  rotateBrowserPairingCode(pairingCode);
  return browserAccessInfo();
});

registerIpcHandle("bibles:load", (_e, id: string) => {
  const file = resolveModulePath(biblesPath(), userBiblesDir(), String(id));
  return JSON.parse(fs.readFileSync(file, "utf-8"));
});

let youVersion: YouVersionClient | null = null;
function yvp(): YouVersionClient {
  if (!youVersion) {
    youVersion = new YouVersionClient({
      appKey: resolveAppKey(),
      cacheDir: path.join(app.getPath("userData"), "yvp-cache"),
      fetchImpl: (url, init) => fetch(url, init),
    });
  }
  return youVersion;
}

// Online Bibles (YouVersion Platform). The App Key stays in this process.
registerIpcHandle("yvp:versions", (_e, force?: boolean) =>
  yvp().listVersions(force === true),
);
registerIpcHandle("yvp:search", (_e, query?: string) =>
  yvp().searchVersions(String(query ?? "")),
);
registerIpcHandle("yvp:add", (_e, id?: string) =>
  yvp().addVersion(String(id ?? "")),
);
registerIpcHandle("yvp:remove", (_e, id?: string) =>
  yvp().removeVersion(String(id ?? "")),
);
registerIpcHandle(
  "yvp:chapter",
  (_e, id: string, book: string, chapter: number) =>
    yvp().getChapter(String(id), String(book), Number(chapter)),
);

// Importing the user's own Bible files (JSON, Zefania, OSIS, USFM, CSV/TSV).
const bibleImports = new ImportSession();

registerIpcHandle("bibles:import-pick", async () => {
  const result = await dialog.showOpenDialog(operatorWindow!, {
    title: "Importar Biblia",
    properties: ["openFile", "multiSelections"],
    filters: [
      {
        name: "Biblias (JSON, XML, USFM, CSV, TSV)",
        extensions: ["json", "xml", "usfm", "sfm", "ptx", "csv", "tsv", "txt"],
      },
      { name: "Todos los archivos", extensions: ["*"] },
    ],
  });
  if (result.canceled || result.filePaths.length === 0)
    return { ok: false, canceled: true };
  return bibleImports.preview(result.filePaths);
});

registerIpcHandle(
  "bibles:import-commit",
  (_e, previewId: string, input: ImportMetaInput) => {
    const existing = listSelectableVersions(biblesPath(), userBiblesDir());
    const safe: ImportMetaInput = {
      name: String(input?.name ?? ""),
      abbr: String(input?.abbr ?? ""),
      language: String(input?.language ?? ""),
      copyright: String(input?.copyright ?? ""),
    };
    return bibleImports.commit(
      String(previewId),
      safe,
      userBiblesDir(),
      existing,
    );
  },
);

registerIpcHandle("bibles:import-cancel", () => bibleImports.discard());

registerIpcHandle("bibles:catalog", () =>
  buildLibraryView(biblesPath(), userBiblesDir(), catalogPath(), nodeFetch),
);

registerIpcHandle("bibles:download", async (event, id: string) => {
  const safeId = String(id);
  if (bundledIds(biblesPath()).has(safeId)) {
    throw new Error("Esta versión ya viene con el programa");
  }
  const bundled = readCatalogFile(catalogPath());
  const resolved = await resolveCatalog(bundled, nodeFetch);
  const sender = event.sender;
  await downloadModule({
    catalog: resolved.catalog,
    id: safeId,
    userDir: userBiblesDir(),
    fetchImpl: nodeFetch,
    onProgress: (progress) => {
      if (!sender.isDestroyed()) {
        sender.send("bibles:download-progress", { id: safeId, ...progress });
      }
    },
  });
  return { id: safeId };
});

registerIpcHandle("bibles:remove", (_e, id: string) => {
  const safeId = String(id);
  removeModule(userBiblesDir(), bundledIds(biblesPath()), safeId);
  const settings = currentSettings();
  if (settings.primaryVersionId === safeId)
    settings.primaryVersionId = "rv1909";
  if (settings.secondaryVersionId === safeId)
    settings.secondaryVersionId = null;
  store.set("settings", settings);
  return { settings };
});

registerIpcHandle("fonts:list", () => store.get("installedFonts"));

registerIpcHandle("fonts:search", async (_e, query?: string) => {
  const catalog = await loadGoogleFontCatalog({
    cacheFile: googleFontsCatalogFile(),
    fetchImpl: fetch,
  });
  return searchGoogleFonts(catalog, String(query ?? ""));
});

registerIpcHandle("fonts:preview", async (_e, family: string) => {
  const catalog = await loadGoogleFontCatalog({
    cacheFile: googleFontsCatalogFile(),
    fetchImpl: fetch,
  });
  return previewGoogleFont({
    family: String(family),
    catalog,
    fetchImpl: fetch,
  });
});

registerIpcHandle("fonts:install", async (_e, family: string) => {
  const safeFamily = String(family);
  const installed = store.get("installedFonts");
  const existing = installed.find(
    (font) => font.id === installedFontId(safeFamily),
  );
  if (existing) return existing;
  const catalog: GoogleFontEntry[] = await loadGoogleFontCatalog({
    cacheFile: googleFontsCatalogFile(),
    fetchImpl: fetch,
  });
  const font = await installGoogleFont({
    family: safeFamily,
    catalog,
    fontsDir: userFontsDir(),
    fetchImpl: fetch,
  });
  store.set("installedFonts", [
    ...installed.filter((item) => item.id !== font.id),
    font,
  ]);
  broadcastInstalledFonts();
  return font;
});

registerIpcHandle("fonts:remove", (_e, id: string) => {
  const font = store
    .get("installedFonts")
    .find((item) => item.id === String(id));
  if (!font) throw new Error("Esa fuente no está instalada");
  removeInstalledFont(userFontsDir(), font);
  store.set(
    "installedFonts",
    store.get("installedFonts").filter((item) => item.id !== font.id),
  );
  broadcastInstalledFonts();
  return true;
});

registerIpcHandle("settings:get", () => currentSettings());

registerIpcHandle("settings:set", (_e, settings: AppSettings) => {
  store.set("settings", settings);
  if (projectorWindow && !projectorWindow.isDestroyed()) {
    projectorWindow.webContents.send("settings:update", settings);
    publishBrowserEvent("settings:update", settings);
  }
  return true;
});

registerIpcHandle("history:get", () => store.get("history"));

registerIpcHandle("history:add", (_e, entry: HistoryEntry) => {
  const history = store.get("history");
  const next = [
    entry,
    ...history.filter((h) => h.reference !== entry.reference),
  ].slice(0, 30);
  store.set("history", next);
  return next;
});

registerIpcHandle("queue:get", () => store.get("queue"));

registerIpcHandle("queue:set", (_e, queue: QueueEntry[]) => {
  store.set("queue", queue);
  return queue;
});

registerIpcHandle("favorites:get", () => store.get("favorites"));

registerIpcHandle("favorites:set", (_e, favorites: QueueEntry[]) => {
  store.set("favorites", favorites);
  return favorites;
});

/** A song's or text's own typeface and weight: kept only when the typeface is valid and a weight came with it. */
function storedTypeface(item: { fontFamily?: unknown; fontWeight?: unknown }): {
  fontFamily?: FontFamilyId;
  fontWeight?: number;
} {
  if (
    !isFontFamilyId(item.fontFamily) ||
    typeof item.fontWeight !== "number" ||
    !Number.isFinite(item.fontWeight)
  )
    return {};
  return {
    fontFamily: item.fontFamily,
    fontWeight: Math.min(Math.max(Math.round(item.fontWeight), 100), 900),
  };
}

registerIpcHandle("songs:get", () => store.get("songs"));

registerIpcHandle("songs:set", (_e, songs: StoredSong[]) => {
  const next = Array.isArray(songs)
    ? songs
        .filter(
          (song) =>
            song &&
            typeof song.id === "string" &&
            typeof song.title === "string" &&
            typeof song.lyrics === "string",
        )
        .map((song) => ({
          id: song.id,
          title: song.title,
          ...(typeof song.author === "string" && song.author.trim()
            ? { author: song.author.trim() }
            : {}),
          lyrics: song.lyrics,
          ...(typeof song.fadeMs === "number" && Number.isFinite(song.fadeMs)
            ? { fadeMs: Math.min(Math.max(song.fadeMs, 0), 2000) }
            : {}),
          ...storedTypeface(song),
          updatedAt: Number.isFinite(song.updatedAt)
            ? song.updatedAt
            : Date.now(),
          pinned: Boolean(song.pinned),
        }))
    : [];
  store.set("songs", next);
  return next;
});

registerIpcHandle("texts:get", () => store.get("texts"));

registerIpcHandle("texts:set", (_e, texts: StoredText[]) => {
  const next = Array.isArray(texts)
    ? texts
        .filter(
          (text) =>
            text &&
            typeof text.id === "string" &&
            typeof text.title === "string" &&
            typeof text.body === "string",
        )
        .map((text) => ({
          id: text.id,
          title: text.title,
          body: text.body,
          ...storedTypeface(text),
          updatedAt: Number.isFinite(text.updatedAt)
            ? text.updatedAt
            : Date.now(),
          pinned: Boolean(text.pinned),
        }))
    : [];
  store.set("texts", next);
  return next;
});

registerIpcHandle("slides:get", () => {
  // Older versions stored slide text (and text-only decks): migrate to images-only.
  const saved = store.get("slideDecks");
  const migrated = sanitizeSlideDecks(saved);
  if (JSON.stringify(saved) !== JSON.stringify(migrated))
    store.set("slideDecks", migrated);
  return migrated;
});

registerIpcHandle("slides:set", (_e, decks: StoredSlideDeck[]) => {
  const next = sanitizeSlideDecks(decks);
  store.set("slideDecks", next);
  pruneOrphanSlideImages(next);
  pruneOrphanMediaFiles(next);
  pruneStaleSlideSources();
  return next;
});

function newDeckId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const importError = (error: string): SlideImportResult => ({
  kind: "error",
  error,
});

const VIDEO_EXTENSIONS = ["mp4", "m4v", "webm", "mov", "ogv"];
const AUDIO_EXTENSIONS = [
  "mp3",
  "wav",
  "m4a",
  "aac",
  "ogg",
  "oga",
  "opus",
  "flac",
];

/** Copy a video or audio file into app data and describe it as a media item. */
async function importAvFile(filePath: string): Promise<StoredSlideDeck | null> {
  const file = await copyToMediaFiles(filePath);
  if (!file) return null;
  return {
    id: newDeckId(),
    title: path.basename(filePath, path.extname(filePath)),
    kind: isVideoPath(filePath) ? "video" : "audio",
    images: [],
    file,
    updatedAt: Date.now(),
    pinned: false,
  };
}

registerIpcHandle(
  "slides:import",
  async (): Promise<SlideImportResult | null> => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile", "multiSelections"],
      filters: [
        {
          name: "Media",
          extensions: [
            "pptx",
            "ppsx",
            "pdf",
            "png",
            "jpg",
            "jpeg",
            "webp",
            ...VIDEO_EXTENSIONS,
            ...AUDIO_EXTENSIONS,
          ],
        },
        { name: "PowerPoint/PDF", extensions: ["pptx", "ppsx", "pdf"] },
        { name: "Imágenes", extensions: ["png", "jpg", "jpeg", "webp"] },
        { name: "Video", extensions: VIDEO_EXTENSIONS },
        { name: "Audio", extensions: AUDIO_EXTENSIONS },
        // Lets the user pick Keynote/.ppt/.odp to get a clear "export to PDF" hint instead of a greyed-out file.
        { name: "Todos los archivos", extensions: ["*"] },
      ],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    // Multi-image pick (e.g. PowerPoint "Exportar como imágenes"): one deck,
    // slides ordered naturally (Diapositiva2 antes que Diapositiva10).
    if (
      result.filePaths.length > 1 &&
      result.filePaths.every(isSlideImagePath)
    ) {
      const ordered = sortImagePathsNumerically(result.filePaths);
      const stored = ordered.map(copyToSlideImages);
      if (stored.some((entry) => entry === null)) {
        for (const entry of stored) {
          if (entry) {
            try {
              fs.rmSync(entry, { force: true });
            } catch {
              // ignore cleanup failures
            }
          }
        }
        return importError("read-failed");
      }
      const firstDir = path.basename(path.dirname(ordered[0]!));
      const title =
        firstDir && firstDir !== "."
          ? firstDir
          : path.basename(ordered[0]!, path.extname(ordered[0]!));
      return {
        kind: "ready",
        deck: {
          id: newDeckId(),
          title,
          images: stored as string[],
          updatedAt: Date.now(),
          pinned: false,
        },
      };
    }
    // Video and audio: one item per file, so several can be imported at once.
    const avFiles = result.filePaths.filter(
      (file) => isVideoPath(file) || isAudioPath(file),
    );
    if (avFiles.length > 0) {
      const items: StoredSlideDeck[] = [];
      for (const file of avFiles) {
        const item = await importAvFile(file);
        if (item) items.push(item);
      }
      if (items.length === 0) return importError("read-failed");
      return { kind: "ready", deck: items[0]!, more: items.slice(1) };
    }
    const filePath = result.filePaths[0]!;
    const title = path.basename(filePath, path.extname(filePath));
    if (isSlideImagePath(filePath)) {
      const storedPath = copyToSlideImages(filePath);
      if (!storedPath) return importError("read-failed");
      return {
        kind: "ready",
        deck: {
          id: newDeckId(),
          title,
          images: [storedPath],
          updatedAt: Date.now(),
          pinned: false,
        },
      };
    }
    if (isPptxPath(filePath)) {
      // The PNGs are generated by "slides:convertPptx" (pptx-glimpse in a
      // utilityProcess). Only the slide count is read here (progress); no text
      // is extracted or stored.
      let total: number;
      try {
        total = await countPptxSlides(fs.readFileSync(filePath));
      } catch (error) {
        console.error("[slides] could not read pptx", error);
        return importError("invalid-pptx");
      }
      if (total === 0) return importError("empty-presentation");
      const deckId = newDeckId();
      const sourceFile = copyPptxToSlideDecks(deckId, filePath);
      if (!sourceFile) return importError("read-failed");
      return {
        kind: "pending",
        pending: {
          id: deckId,
          title,
          source: { kind: "pptx", file: sourceFile },
          total,
        },
      };
    }
    if (isPdfPath(filePath)) {
      const deckId = newDeckId();
      const sourceFile = copyPdfToSlideDecks(deckId, filePath);
      if (!sourceFile) return importError("read-failed");
      return {
        kind: "pending",
        pending: {
          id: deckId,
          title,
          source: { kind: "pdf", file: sourceFile },
          total: 0,
        },
      };
    }
    // Keynote/.ppt/.odp have no JS renderer, and anything else is not a presentation: don't fake it.
    return importError("unsupported-format");
  },
);

/** Remove a managed source file once its slides were converted (or the import was abandoned). */
registerIpcHandle("slides:discardSource", (_e, file: string): boolean => {
  try {
    if (!isManagedSlideSource(file)) return false;
    fs.rmSync(path.resolve(file), { force: true });
    return true;
  } catch {
    return false;
  }
});

const MAX_SLIDE_PNGS = 300;
const MAX_SLIDE_PNG_BYTES = 20 * 1024 * 1024;

function isManagedSlideSource(file: unknown): file is string {
  if (typeof file !== "string") return false;
  const root = path.resolve(slideDecksDir());
  return path.resolve(file).startsWith(`${root}${path.sep}`);
}

/**
 * Render a managed .pptx to PNGs (one per slide) in a utilityProcess with the
 * system fonts. Returns the stored image paths; progress goes out on "slides:progress".
 */
registerIpcHandle(
  "slides:convertPptx",
  async (event, request: { deckId: string; file: string; total: number }) => {
    if (
      !isManagedSlideSource(request?.file) ||
      !/\.(pptx|ppsx)$/i.test(request.file)
    ) {
      return { ok: false as const, error: "Archivo de origen no válido." };
    }
    try {
      const { files, warnings } = await renderPptxInWorker({
        file: request.file,
        outDir: slideImagesDir(),
        prefix: `pptx-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        total: Number.isFinite(request.total) ? request.total : 1,
        onProgress: (done, total) => {
          if (!event.sender.isDestroyed())
            event.sender.send("slides:progress", {
              deckId: request.deckId,
              done,
              total,
            });
        },
      });
      if (warnings.length)
        console.warn("[slides] pptx render warnings:", warnings.join(" | "));
      return { ok: true as const, images: files };
    } catch (error) {
      console.error("[slides] pptx conversion failed", error);
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
);

/** Read back a managed PDF so the operator window can rasterize it with pdf.js. */
registerIpcHandle("slides:readFile", (_e, file: string): string | null => {
  try {
    if (!isManagedSlideSource(file)) return null;
    const data = fs.readFileSync(path.resolve(file));
    if (data.length === 0 || data.length > 200 * 1024 * 1024) return null;
    return data.toString("base64");
  } catch (error) {
    console.error("[slides] could not read slide source", error);
    return null;
  }
});

/** Copy a media item out of app data: one file for video or audio, numbered PNGs in a folder for slides. */
registerIpcHandle(
  "media:download",
  async (_e, item: StoredSlideDeck): Promise<boolean> => {
    const base =
      (typeof item?.title === "string" ? item.title : "")
        .replace(/[\\/:*?"<>|]+/g, "_")
        .trim() || "media";
    try {
      if (item?.kind === "video" || item?.kind === "audio") {
        if (!isInDir(item.file, mediaFilesDir())) return false;
        const result = await dialog.showSaveDialog(operatorWindow!, {
          defaultPath: `${base}${path.extname(item.file)}`,
        });
        if (result.canceled || !result.filePath) return false;
        await fs.promises.copyFile(item.file, result.filePath);
        return true;
      }
      const images = Array.isArray(item?.images) ? item.images : [];
      if (
        images.length === 0 ||
        !images.every((image) => isInDir(image, slideImagesDir()))
      )
        return false;
      const result = await dialog.showOpenDialog(operatorWindow!, {
        properties: ["openDirectory", "createDirectory"],
      });
      if (result.canceled || result.filePaths.length === 0) return false;
      const dir = path.join(result.filePaths[0], base);
      fs.mkdirSync(dir, { recursive: true });
      images.forEach((image, index) =>
        fs.copyFileSync(
          image,
          path.join(dir, `${String(index + 1).padStart(2, "0")}.png`),
        ),
      );
      return true;
    } catch (error) {
      console.error("[media] could not download item", error);
      return false;
    }
  },
);

function isInDir(file: unknown, dir: string): file is string {
  return (
    typeof file === "string" &&
    path.resolve(file).startsWith(`${path.resolve(dir)}${path.sep}`)
  );
}

/** Persist rasterized slide PNGs (base64) as managed images. Returns stored paths. */
registerIpcHandle(
  "slides:savePngs",
  (_e, images: string[]): string[] | null => {
    const stored: string[] = [];
    try {
      if (
        !Array.isArray(images) ||
        images.length === 0 ||
        images.length > MAX_SLIDE_PNGS
      )
        return null;
      const dir = slideImagesDir();
      fs.mkdirSync(dir, { recursive: true });
      const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      for (let i = 0; i < images.length; i++) {
        const entry = images[i];
        if (typeof entry !== "string" || entry.length === 0)
          throw new Error("bad image");
        const data = Buffer.from(entry, "base64");
        if (data.length === 0 || data.length > MAX_SLIDE_PNG_BYTES)
          throw new Error("bad image size");
        // Validate PNG signature before writing.
        if (
          data[0] !== 0x89 ||
          data[1] !== 0x50 ||
          data[2] !== 0x4e ||
          data[3] !== 0x47
        )
          throw new Error("not png");
        const filePath = path.join(dir, `${stamp}-${i}.png`);
        fs.writeFileSync(filePath, data);
        stored.push(filePath);
      }
      return stored;
    } catch (error) {
      console.error("[slides] could not save slide images", error);
      for (const file of stored) fs.rmSync(file, { force: true });
      return null;
    }
  },
);

registerIpcHandle("displays:list", () => {
  return screen.getAllDisplays().map((d) => ({
    id: d.id,
    label: `${d.label || "Pantalla"} (${d.bounds.width}×${d.bounds.height})`,
    primary: d.id === screen.getPrimaryDisplay().id,
    bounds: d.bounds,
  }));
});

registerIpcHandle("projector:open", () => {
  createProjectorWindow();
  return true;
});

registerIpcHandle("projector:bounds", () => projectorContentBounds());

registerIpcHandle("projector:show", (_e, payload: ProjectorPayload) => {
  sendToProjector(payload);
  return true;
});

registerIpcHandle("dialog:openImage", async () => {
  const result = await dialog.showOpenDialog(operatorWindow!, {
    filters: [
      {
        name: "Imágenes y videos",
        extensions: ["jpg", "jpeg", "png", "webp", "mp4", "webm", "ogg", "mov"],
      },
    ],
    properties: ["openFile"],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const filePath = result.filePaths[0];
  try {
    const imagesDir = path.join(app.getPath("userData"), "background-images");
    fs.mkdirSync(imagesDir, { recursive: true });
    const ext = path.extname(filePath).toLowerCase();
    const storedPath = path.join(
      imagesDir,
      `${Date.now()}-${Math.random().toString(36).slice(2, 9)}${ext}`,
    );
    fs.copyFileSync(filePath, storedPath);
    // Persist the managed copy path, never the user's original location.
    // The renderer converts this path to a file URL when it needs to display it.
    return storedPath;
  } catch {
    return null;
  }
});

// The logo image is a single managed copy: picking a new one adds a file and
// the settings point at it. Old copies are left in place (they are small).
registerIpcHandle("logo:pick", async (): Promise<string | null> => {
  const result = await dialog.showOpenDialog(operatorWindow!, {
    title: "Elegir logo",
    filters: [{ name: "Imágenes", extensions: ["png", "jpg", "jpeg", "webp"] }],
    properties: ["openFile"],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const filePath = result.filePaths[0];
  try {
    const logosDir = path.join(app.getPath("userData"), "logo-images");
    fs.mkdirSync(logosDir, { recursive: true });
    const ext = path.extname(filePath).toLowerCase();
    const storedPath = path.join(
      logosDir,
      `${Date.now()}-${Math.random().toString(36).slice(2, 9)}${ext}`,
    );
    fs.copyFileSync(filePath, storedPath);
    return storedPath;
  } catch {
    return null;
  }
});

registerIpcHandle("background:delete", (_e, filePath: string) => {
  const root = path.resolve(app.getPath("userData"), "background-images");
  const target = path.resolve(String(filePath));
  if (!target.startsWith(`${root}${path.sep}`)) return false;
  try {
    fs.rmSync(target, { force: true });
    fs.rmSync(`${target}.thumbnail.jpg`, { force: true });
    return true;
  } catch {
    return false;
  }
});

registerIpcHandle(
  "background:saveThumbnail",
  (_e, filePath: string, jpegBase64: string) => {
    const root = path.resolve(app.getPath("userData"), "background-images");
    const target = path.resolve(String(filePath));
    if (
      !target.startsWith(`${root}${path.sep}`) ||
      !/\.(mp4|webm|ogg|mov)$/i.test(target)
    )
      return false;
    if (typeof jpegBase64 !== "string" || jpegBase64.length > 2_800_000)
      return false;
    try {
      if (!fs.statSync(target).isFile()) return false;
      const jpeg = Buffer.from(jpegBase64, "base64");
      if (
        jpeg.length < 4 ||
        jpeg.length > 2_000_000 ||
        jpeg[0] !== 0xff ||
        jpeg[1] !== 0xd8 ||
        jpeg[2] !== 0xff
      )
        return false;
      fs.writeFileSync(`${target}.thumbnail.jpg`, jpeg);
      return true;
    } catch {
      return false;
    }
  },
);

ipcMain.on("operator:navigate", (_e, dir: "prev" | "next") => {
  operatorWindow?.webContents.send("operator:shortcut", { action: dir });
});
