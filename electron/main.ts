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
import Store from "electron-store";
import { isPdfPath } from "../shared/slide-deck";
import { renderPptxInWorker } from "./pptx-render";
import {
  countPptxSlides,
  isPptxPath,
  isSlideImagePath,
  sanitizeSlideDecks,
  sortImagePathsNumerically,
} from "./slides-import";

function slideImagesDir(): string {
  return path.join(app.getPath("userData"), "slide-images");
}

function slideDecksDir(): string {
  return path.join(app.getPath("userData"), "slide-decks");
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
    const storedPath = path.join(dir, `${Date.now()}-${Math.random().toString(36).slice(2, 9)}${ext}`);
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
function pruneOrphanSlideImages(next: Array<{ images: Array<string | null> }>): void {
  try {
    const dir = path.resolve(slideImagesDir());
    if (!fs.existsSync(dir)) return;
    const referenced = new Set(
      next.flatMap((deck) => deck.images).filter((entry): entry is string => typeof entry === "string"),
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
        if (Date.now() - fs.statSync(full).mtimeMs > SOURCE_MAX_AGE_MS) fs.rmSync(full, { force: true });
      } catch {
        // ignore single-file failures
      }
    }
  } catch {
    // pruning is best-effort
  }
}
import type { AppSettings, ProjectorPayload, QueueEntry, HistoryEntry, StoredSong, StoredSlideDeck, SlideImportResult } from "../shared/types";
import { DEFAULT_SETTINGS } from "../shared/types";
import { buildBibleDataCandidates, resolveBibleDataDir } from "./bible-data-path";
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
import type { ImportMetaInput } from "../shared/bible-import/build";

const store = new Store<{
  settings: AppSettings;
  history: HistoryEntry[];
  queue: QueueEntry[];
  favorites: QueueEntry[];
  songs: StoredSong[];
  slideDecks: StoredSlideDeck[];
}>({
  defaults: {
    settings: DEFAULT_SETTINGS,
    history: [],
    queue: [],
    favorites: [],
    songs: [],
    slideDecks: [],
  },
});

let operatorWindow: BrowserWindow | null = null;
let projectorWindow: BrowserWindow | null = null;
let projectorReady = false;
let pendingProjectorPayload: ProjectorPayload | null = null;
let lastProjectorMode: ProjectorPayload["mode"] | null = null;
const isDev = !app.isPackaged && process.env.PROYECTOR_SCREENSHOT !== "1";

// Video and audio elements need the stream privilege when served through a
// custom protocol. Without it Chromium can load an image but leaves videos
// black because media range/stream requests are rejected.
protocol.registerSchemesAsPrivileged([
  {
    scheme: "lumen-media",
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
]);

function devServerUrl(): string {
  const fromPlugin = process.env.VITE_DEV_SERVER_URL;
  if (fromPlugin) return fromPlugin.endsWith("/") ? fromPlugin : `${fromPlugin}/`;
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
      buildBibleDataCandidates(process.resourcesPath, app.getAppPath(), __dirname, process.cwd()),
    );
  }
  return bibleDataDir;
}

function userBiblesDir(): string {
  return path.join(app.getPath("userData"), "bibles");
}

function catalogPath(): string {
  return resolveCatalogPath(
    catalogCandidates(process.resourcesPath, app.getAppPath(), __dirname, process.cwd()),
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
}

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
  const width = singleDisplay ? Math.min(960, display.bounds.width - 48) : display.bounds.width;
  const height = singleDisplay ? Math.min(540, display.bounds.height - 96) : display.bounds.height;
  const x = singleDisplay ? display.bounds.x + Math.max(24, Math.round((display.bounds.width - width) / 2)) : display.bounds.x;
  const y = singleDisplay ? display.bounds.y + Math.max(48, Math.round((display.bounds.height - height) / 2)) : display.bounds.y;

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
    void projectorWindow.loadFile(path.join(__dirname, "../dist/index.html"), { hash: "/projector" });
  }

  projectorWindow.webContents.on("did-finish-load", () => {
    projectorReady = true;
    if (pendingProjectorPayload) {
      projectorWindow?.webContents.send("projector:update", pendingProjectorPayload);
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
  return Boolean(projectorWindow && !projectorWindow.isDestroyed() && lastProjectorMode && lastProjectorMode !== "blank");
}

function sendToProjector(payload: ProjectorPayload): void {
  pendingProjectorPayload = payload;
  lastProjectorMode = payload.mode;
  if (!projectorWindow) {
    createProjectorWindow();
  }
  if (projectorReady) {
    projectorWindow?.webContents.send("projector:update", payload);
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
  const body = await win.webContents.executeJavaScript("document.body.innerText");
  throw new Error(`Operator UI did not load bibles. Body snippet: ${String(body).slice(0, 400)}`);
}

async function captureScreenshots(): Promise<void> {
  const outDir = process.env.SCREENSHOT_OUT_DIR ?? "/opt/cursor/artifacts";
  fs.mkdirSync(outDir, { recursive: true });

  // Prove path resolution before UI loads
  const manifest = JSON.parse(fs.readFileSync(path.join(biblesPath(), "manifest.json"), "utf-8"));
  if (!Array.isArray(manifest) || manifest.length < 1) {
    throw new Error("manifest.json vacío o inválido");
  }

  createOperatorWindow();
  if (!operatorWindow) throw new Error("No operator window");
  await operatorWindow.webContents.executeJavaScript(`
    localStorage.clear();
  `).catch(() => undefined);
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
  fs.writeFileSync(path.join(outDir, "operator-window.png"), operatorImg.toPNG());

  await operatorWindow.webContents.executeJavaScript(`
    document.querySelector('[data-testid="tab-ajustes"]')?.click();
  `);
  await delay(600);
  const settingsImg = await operatorWindow.webContents.capturePage();
  fs.writeFileSync(path.join(outDir, "settings-window.png"), settingsImg.toPNG());

  operatorWindow.setSize(1280, 1700);
  await operatorWindow.webContents.executeJavaScript(`
    document.querySelector('[data-testid="tab-biblias"]')?.click();
  `);
  for (let i = 0; i < 40; i++) {
    const ready = await operatorWindow.webContents.executeJavaScript(`
      document.querySelectorAll('[data-testid="bible-list"] article').length >= 9
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
  app.setAppUserModelId("com.7lineas.lumen");
  Menu.setApplicationMenu(null);
  protocol.handle("lumen-media", (request) => {
    const encodedPath = new URL(request.url).pathname.slice("/media/".length);
    const target = path.resolve(decodeURIComponent(encodedPath));
    const userData = path.resolve(app.getPath("userData"));
    // Only folders whose files are meant to be shown on screen. slide-decks
    // (original PPTX/PDF sources) is deliberately NOT served.
    const allowed = ["background-images", "slide-images"].map((dir) => `${path.join(userData, dir)}${path.sep}`);
    if (!allowed.some((root) => target.startsWith(root))) return new Response("Forbidden", { status: 403 });
    return net.fetch(pathToFileURL(target).toString());
  });
  setupUpdater({ getOperatorWindow: () => operatorWindow, isProjectionActive });
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
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

ipcMain.handle("bibles:list", () => listSelectableVersions(biblesPath(), userBiblesDir()));

ipcMain.handle("bibles:load", (_e, id: string) => {
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
ipcMain.handle("yvp:versions", (_e, force?: boolean) => yvp().listVersions(force === true));
ipcMain.handle("yvp:chapter", (_e, id: string, book: string, chapter: number) =>
  yvp().getChapter(String(id), String(book), Number(chapter)),
);

// Importing the user's own Bible files (JSON, Zefania, OSIS, USFM, CSV/TSV).
const bibleImports = new ImportSession();

ipcMain.handle("bibles:import-pick", async () => {
  const result = await dialog.showOpenDialog(operatorWindow!, {
    title: "Importar Biblia",
    properties: ["openFile", "multiSelections"],
    filters: [
      { name: "Biblias (JSON, XML, USFM, CSV, TSV)", extensions: ["json", "xml", "usfm", "sfm", "ptx", "csv", "tsv", "txt"] },
      { name: "Todos los archivos", extensions: ["*"] },
    ],
  });
  if (result.canceled || result.filePaths.length === 0) return { ok: false, canceled: true };
  return bibleImports.preview(result.filePaths);
});

ipcMain.handle("bibles:import-commit", (_e, previewId: string, input: ImportMetaInput) => {
  const existing = listSelectableVersions(biblesPath(), userBiblesDir());
  const safe: ImportMetaInput = {
    name: String(input?.name ?? ""),
    abbr: String(input?.abbr ?? ""),
    language: String(input?.language ?? ""),
    copyright: String(input?.copyright ?? ""),
  };
  return bibleImports.commit(String(previewId), safe, userBiblesDir(), existing);
});

ipcMain.handle("bibles:import-cancel", () => bibleImports.discard());

ipcMain.handle("bibles:catalog", () =>
  buildLibraryView(biblesPath(), userBiblesDir(), catalogPath(), nodeFetch),
);

ipcMain.handle("bibles:download", async (event, id: string) => {
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

ipcMain.handle("bibles:remove", (_e, id: string) => {
  const safeId = String(id);
  removeModule(userBiblesDir(), bundledIds(biblesPath()), safeId);
  const settings = currentSettings();
  if (settings.primaryVersionId === safeId) settings.primaryVersionId = "rv1909";
  if (settings.secondaryVersionId === safeId) settings.secondaryVersionId = null;
  store.set("settings", settings);
  return { settings };
});

ipcMain.handle("settings:get", () => currentSettings());

ipcMain.handle("settings:set", (_e, settings: AppSettings) => {
  store.set("settings", settings);
  if (projectorWindow && !projectorWindow.isDestroyed()) {
    projectorWindow.webContents.send("settings:update", settings);
  }
  return true;
});

ipcMain.handle("history:get", () => store.get("history"));

ipcMain.handle("history:add", (_e, entry: HistoryEntry) => {
  const history = store.get("history");
  const next = [entry, ...history.filter((h) => h.reference !== entry.reference)].slice(0, 30);
  store.set("history", next);
  return next;
});

ipcMain.handle("queue:get", () => store.get("queue"));

ipcMain.handle("queue:set", (_e, queue: QueueEntry[]) => {
  store.set("queue", queue);
  return queue;
});

ipcMain.handle("favorites:get", () => store.get("favorites"));

ipcMain.handle("favorites:set", (_e, favorites: QueueEntry[]) => {
  store.set("favorites", favorites);
  return favorites;
});

ipcMain.handle("songs:get", () => store.get("songs"));

ipcMain.handle("songs:set", (_e, songs: StoredSong[]) => {
  const next = Array.isArray(songs)
    ? songs.filter((song) => song && typeof song.id === "string" && typeof song.title === "string" && typeof song.lyrics === "string").map((song) => ({
        id: song.id,
        title: song.title,
        lyrics: song.lyrics,
        updatedAt: Number.isFinite(song.updatedAt) ? song.updatedAt : Date.now(),
        pinned: Boolean(song.pinned),
      }))
    : [];
  store.set("songs", next);
  return next;
});

ipcMain.handle("slides:get", () => {
  // Older versions stored slide text (and text-only decks): migrate to images-only.
  const saved = store.get("slideDecks");
  const migrated = sanitizeSlideDecks(saved);
  if (JSON.stringify(saved) !== JSON.stringify(migrated)) store.set("slideDecks", migrated);
  return migrated;
});

ipcMain.handle("slides:set", (_e, decks: StoredSlideDeck[]) => {
  const next = sanitizeSlideDecks(decks);
  store.set("slideDecks", next);
  pruneOrphanSlideImages(next);
  pruneStaleSlideSources();
  return next;
});

function newDeckId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const importError = (error: string): SlideImportResult => ({ kind: "error", error });

ipcMain.handle("slides:import", async (): Promise<SlideImportResult | null> => {
  const result = await dialog.showOpenDialog({
    properties: ["openFile", "multiSelections"],
    filters: [
      { name: "Presentaciones", extensions: ["pptx", "ppsx", "pdf", "png", "jpg", "jpeg", "webp"] },
      { name: "PowerPoint/PDF", extensions: ["pptx", "ppsx", "pdf"] },
      { name: "Imágenes", extensions: ["png", "jpg", "jpeg", "webp"] },
      // Lets the user pick Keynote/.ppt/.odp to get a clear "export to PDF" hint instead of a greyed-out file.
      { name: "Todos los archivos", extensions: ["*"] },
    ],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  // Multi-image pick (e.g. PowerPoint "Exportar como imágenes"): one deck,
  // slides ordered naturally (Diapositiva2 antes que Diapositiva10).
  if (result.filePaths.length > 1 && result.filePaths.every(isSlideImagePath)) {
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
    const title = firstDir && firstDir !== "." ? firstDir : path.basename(ordered[0]!, path.extname(ordered[0]!));
    return {
      kind: "ready",
      deck: { id: newDeckId(), title, images: stored as string[], updatedAt: Date.now(), pinned: false },
    };
  }
  const filePath = result.filePaths[0]!;
  const title = path.basename(filePath, path.extname(filePath));
  if (isSlideImagePath(filePath)) {
    const storedPath = copyToSlideImages(filePath);
    if (!storedPath) return importError("read-failed");
    return { kind: "ready", deck: { id: newDeckId(), title, images: [storedPath], updatedAt: Date.now(), pinned: false } };
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
    return { kind: "pending", pending: { id: deckId, title, source: { kind: "pptx", file: sourceFile }, total } };
  }
  if (isPdfPath(filePath)) {
    const deckId = newDeckId();
    const sourceFile = copyPdfToSlideDecks(deckId, filePath);
    if (!sourceFile) return importError("read-failed");
    return { kind: "pending", pending: { id: deckId, title, source: { kind: "pdf", file: sourceFile }, total: 0 } };
  }
  // Keynote/.ppt/.odp have no JS renderer, and anything else is not a presentation: don't fake it.
  return importError("unsupported-format");
});

/** Remove a managed source file once its slides were converted (or the import was abandoned). */
ipcMain.handle("slides:discardSource", (_e, file: string): boolean => {
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
ipcMain.handle("slides:convertPptx", async (event, request: { deckId: string; file: string; total: number }) => {
  if (!isManagedSlideSource(request?.file) || !/\.(pptx|ppsx)$/i.test(request.file)) {
    return { ok: false as const, error: "Archivo de origen no válido." };
  }
  try {
    const { files, warnings } = await renderPptxInWorker({
      file: request.file,
      outDir: slideImagesDir(),
      prefix: `pptx-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      total: Number.isFinite(request.total) ? request.total : 1,
      onProgress: (done, total) => {
        if (!event.sender.isDestroyed()) event.sender.send("slides:progress", { deckId: request.deckId, done, total });
      },
    });
    if (warnings.length) console.warn("[slides] pptx render warnings:", warnings.join(" | "));
    return { ok: true as const, images: files };
  } catch (error) {
    console.error("[slides] pptx conversion failed", error);
    return { ok: false as const, error: error instanceof Error ? error.message : String(error) };
  }
});

/** Read back a managed PDF so the operator window can rasterize it with pdf.js. */
ipcMain.handle("slides:readFile", (_e, file: string): string | null => {
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

/** Persist rasterized slide PNGs (base64) as managed images. Returns stored paths. */
ipcMain.handle("slides:savePngs", (_e, images: string[]): string[] | null => {
  const stored: string[] = [];
  try {
    if (!Array.isArray(images) || images.length === 0 || images.length > MAX_SLIDE_PNGS) return null;
    const dir = slideImagesDir();
    fs.mkdirSync(dir, { recursive: true });
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    for (let i = 0; i < images.length; i++) {
      const entry = images[i];
      if (typeof entry !== "string" || entry.length === 0) throw new Error("bad image");
      const data = Buffer.from(entry, "base64");
      if (data.length === 0 || data.length > MAX_SLIDE_PNG_BYTES) throw new Error("bad image size");
      // Validate PNG signature before writing.
      if (data[0] !== 0x89 || data[1] !== 0x50 || data[2] !== 0x4e || data[3] !== 0x47) throw new Error("not png");
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
});

ipcMain.handle("displays:list", () => {
  return screen.getAllDisplays().map((d) => ({
    id: d.id,
    label: `${d.label || "Pantalla"} (${d.bounds.width}×${d.bounds.height})`,
    primary: d.id === screen.getPrimaryDisplay().id,
    bounds: d.bounds,
  }));
});

ipcMain.handle("projector:open", () => {
  createProjectorWindow();
  return true;
});

ipcMain.handle("projector:bounds", () => projectorContentBounds());

ipcMain.handle("projector:show", (_e, payload: ProjectorPayload) => {
  sendToProjector(payload);
  return true;
});

ipcMain.handle("dialog:openImage", async () => {
  const result = await dialog.showOpenDialog(operatorWindow!, {
    filters: [{ name: "Imágenes y videos", extensions: ["jpg", "jpeg", "png", "webp", "mp4", "webm", "ogg", "mov"] }],
    properties: ["openFile"],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const filePath = result.filePaths[0];
  try {
    const imagesDir = path.join(app.getPath("userData"), "background-images");
    fs.mkdirSync(imagesDir, { recursive: true });
    const ext = path.extname(filePath).toLowerCase();
    const storedPath = path.join(imagesDir, `${Date.now()}-${Math.random().toString(36).slice(2, 9)}${ext}`);
    fs.copyFileSync(filePath, storedPath);
    // Persist the managed copy path, never the user's original location.
    // The renderer converts this path to a file URL when it needs to display it.
    return storedPath;
  } catch {
    return null;
  }
});

ipcMain.handle("background:delete", (_e, filePath: string) => {
  const root = path.resolve(app.getPath("userData"), "background-images");
  const target = path.resolve(String(filePath));
  if (!target.startsWith(`${root}${path.sep}`)) return false;
  try {
    fs.rmSync(target, { force: true });
    return true;
  } catch {
    return false;
  }
});

ipcMain.on("operator:navigate", (_e, dir: "prev" | "next") => {
  operatorWindow?.webContents.send("operator:shortcut", { action: dir });
});
