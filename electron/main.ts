import {
  app,
  BrowserWindow,
  ipcMain,
  screen,
  globalShortcut,
  dialog,
  Menu,
} from "electron";
import path from "path";
import fs from "fs";
import Store from "electron-store";
import type { AppSettings, ProjectorPayload, QueueEntry, HistoryEntry } from "../shared/types";
import { DEFAULT_SETTINGS } from "../shared/types";
import { buildBibleDataCandidates, resolveBibleDataDir } from "./bible-data-path";
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

const store = new Store<{
  settings: AppSettings;
  history: HistoryEntry[];
  queue: QueueEntry[];
  favorites: QueueEntry[];
}>({
  defaults: {
    settings: DEFAULT_SETTINGS,
    history: [],
    queue: [],
    favorites: [],
  },
});

let operatorWindow: BrowserWindow | null = null;
let projectorWindow: BrowserWindow | null = null;
const isDev = !app.isPackaged && process.env.PROYECTOR_SCREENSHOT !== "1";

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

function createOperatorWindow(): void {
  operatorWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 680,
    icon: path.join(app.getAppPath(), "build/icon.png"),
    title: "Lumen",
    autoHideMenuBar: true,
    webPreferences: {
      preload: getPreload(),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    void operatorWindow.loadURL("http://localhost:43123/");
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
  const { x, y, width, height } = display.bounds;

  projectorWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    fullscreen: displaysCount() > 1,
    frame: displaysCount() <= 1,
    icon: path.join(app.getAppPath(), "build/icon.png"),
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
    void projectorWindow.loadURL(`http://localhost:43123/${hash}`);
  } else {
    void projectorWindow.loadFile(path.join(__dirname, "../dist/index.html"), { hash: "/projector" });
  }

  projectorWindow.on("closed", () => {
    projectorWindow = null;
  });
}

function displaysCount(): number {
  return screen.getAllDisplays().length;
}

function sendToProjector(payload: ProjectorPayload): void {
  if (!projectorWindow) {
    createProjectorWindow();
  }
  projectorWindow?.webContents.send("projector:update", payload);
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
  if (process.platform === "darwin" && app.dock) {
    const iconPath = path.join(app.getAppPath(), "build/icon.png");
    if (fs.existsSync(iconPath)) app.dock.setIcon(iconPath);
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

ipcMain.handle("projector:show", (_e, payload: ProjectorPayload) => {
  sendToProjector(payload);
  return true;
});

ipcMain.handle("dialog:openImage", async () => {
  const result = await dialog.showOpenDialog(operatorWindow!, {
    filters: [{ name: "Imágenes", extensions: ["jpg", "jpeg", "png", "webp"] }],
    properties: ["openFile"],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return result.filePaths[0];
});

ipcMain.on("operator:navigate", (_e, dir: "prev" | "next") => {
  operatorWindow?.webContents.send("operator:shortcut", { action: dir });
});
