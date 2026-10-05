import type { ProyectorApi } from "./vite-env";

const methods: Record<string, string> = {
  listBibleVersions: "bibles:list", loadBible: "bibles:load", listOnlineBibles: "yvp:versions", searchOnlineBibles: "yvp:search",
  addOnlineBible: "yvp:add", removeOnlineBible: "yvp:remove",
  getOnlineChapter: "yvp:chapter", getBibleCatalog: "bibles:catalog", downloadBible: "bibles:download",
  removeBible: "bibles:remove", getSettings: "settings:get", setSettings: "settings:set",
  getHistory: "history:get", addHistory: "history:add", getQueue: "queue:get", setQueue: "queue:set",
  getFavorites: "favorites:get", setFavorites: "favorites:set", getSongs: "songs:get", setSongs: "songs:set",
  getSlideDecks: "slides:get", setSlideDecks: "slides:set", readSlideSource: "slides:readFile",
  saveSlidePngs: "slides:savePngs", convertPptx: "slides:convertPptx", showOnProjector: "projector:show",
  deleteBackgroundMedia: "background:delete",
};

const eventNames: Record<string, string> = {
  onProjectorUpdate: "projector:update", onSettingsUpdate: "settings:update",
  onBibleDownloadProgress: "bibles:download-progress", onSlideProgress: "slides:progress",
};

let eventsController: AbortController | null = null;
let reconnectTimer = 0;
const callbacks = new Map<string, Set<(payload: unknown) => void>>();

function token(): string {
  return sessionStorage.getItem("lumen-access-token") ?? "";
}

async function rpc(channel: string, args: unknown[]): Promise<unknown> {
  const headers: HeadersInit = { "content-type": "application/json" };
  const accessToken = token();
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const response = await fetch("/api/v1/rpc", { method: "POST", headers, body: JSON.stringify({ channel, args }) });
  const data = await response.json() as { result?: unknown; error?: string };
  if (!response.ok) throw new Error(data.error === "unauthorized" ? "Acceso denegado. Abre Lumen con el token de acceso proporcionado por el equipo anfitrión." : data.error ?? "Error de conexión con Lumen");
  return data.result;
}

function connectEvents(): void {
  if (eventsController || ![...callbacks.values()].some((set) => set.size)) return;
  const controller = new AbortController();
  eventsController = controller;
  const accessToken = token();
  const headers: HeadersInit = accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
  void (async () => {
    try {
      const response = await fetch("/api/v1/events", { headers, signal: controller.signal });
      if (!response.ok || !response.body) throw new Error("event_stream_unavailable");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (!controller.signal.aborted) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const data = frame.split("\n").find((line) => line.startsWith("data: "))?.slice(6);
          if (!data) continue;
          try {
            const { event: name, payload } = JSON.parse(data) as { event: string; payload: unknown };
            callbacks.get(name)?.forEach((callback) => callback(payload));
          } catch { /* Ignore malformed event frames. */ }
        }
      }
    } catch { /* Reconnect after a transient network loss. */ }
    if (eventsController === controller) eventsController = null;
    if (!controller.signal.aborted && [...callbacks.values()].some((set) => set.size)) {
      reconnectTimer = window.setTimeout(connectEvents, 1500);
    }
  })();
}

function subscribe(event: string, callback: (payload: unknown) => void): () => void {
  callbacks.set(event, callbacks.get(event) ?? new Set());
  callbacks.get(event)!.add(callback);
  connectEvents();
  return () => {
    callbacks.get(event)?.delete(callback);
    if (![...callbacks.values()].some((set) => set.size)) {
      window.clearTimeout(reconnectTimer);
      eventsController?.abort();
      eventsController = null;
    }
  };
}

const browserApi = new Proxy({} as ProyectorApi, {
  get(_target, property: string) {
    if (methods[property]) return (...args: unknown[]) => rpc(methods[property]!, args);
    if (eventNames[property]) return (callback: (payload: unknown) => void) => subscribe(eventNames[property]!, callback);
    // A LAN client is the operator/controller only. The projector remains a
    // window owned by the host Electron app and is opened there when needed.
    if (property === "openProjector") return async () => false;
    if (property === "listDisplays") return async () => [];
    if (property === "getProjectorBounds") return async () => null;
    if (property === "onProjectorBounds" || property === "onOperatorShortcut" || property === "onAppUpdateState") return () => () => undefined;
    if (property === "pickBibleImport" || property === "pickBackgroundImage" || property === "importSlideDeck" || property === "startAppUpdate" || property === "installAppUpdate") {
      return async () => { throw new Error("Esta operación requiere la aplicación de escritorio Lumen."); };
    }
    if (property === "cancelBibleImport" || property === "discardSlideSource") return async () => undefined;
    if (property === "getAppUpdateState") return async () => ({
      mode: "disabled", status: "disabled", currentVersion: "Browser", availableVersion: null,
      downloadedVersion: null, downloadPercent: null, checkedAt: null, message: null,
      errorContext: null, projectionActive: false,
    });
    return undefined;
  },
});

export function installBrowserApi(): void {
  window.__LUMEN_BROWSER__ = true;
  window.proyector = browserApi;
}

export async function refreshBrowserSession(): Promise<void> {
  const accessToken = token();
  if (!accessToken) return;
  const response = await fetch("/api/v1/session", {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) sessionStorage.removeItem("lumen-access-token");
}
