import {
  type AppUpdateState,
  type AppUpdateMode,
  UPDATE_CHECK_INTERVAL_MS,
  UPDATE_RETRY_INTERVAL_MS,
  UPDATE_STARTUP_DELAY_MS,
  createInitialUpdateState,
  friendlyUpdateError,
  isOfflineError,
  reduceOnCheckFailure,
  reduceOnCheckResult,
  reduceOnCheckStart,
  reduceOnDownloadComplete,
  reduceOnDownloadFailure,
  reduceOnDownloadProgress,
  reduceOnDownloadStart,
  reduceOnInstallFailure,
} from "../shared/app-update";

/** Lo mínimo que el controlador necesita de electron-updater (o de un sustituto en pruebas). */
export interface UpdateBackend {
  /** Versión más reciente publicada, o null si no hay datos. */
  check(): Promise<{ version: string } | null>;
  /** Descarga la actualización (modo `auto`) o abre la página de descarga (modo `manual`). */
  download(onProgress: (percent: number) => void): Promise<void>;
  /** Cierra la app e instala (solo modo `auto`). */
  install(): void;
}

/** Si tras pedir la instalación la app sigue viva, se da por fallida. */
export const INSTALL_WATCHDOG_MS = 20_000;

export interface UpdateControllerDeps {
  backend: UpdateBackend;
  currentVersion: string;
  mode: AppUpdateMode;
  isOnline: () => boolean;
  isProjectionActive: () => boolean;
  onState: (state: AppUpdateState) => void;
  log?: (message: string) => void;
  now?: () => Date;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export interface UpdateController {
  getState(): AppUpdateState;
  start(): void;
  stop(): void;
  check(): Promise<void>;
  /** El operador confirmó: descargar y, si no hay proyección, instalar al terminar. */
  startUpdate(): Promise<AppUpdateState>;
  /** El operador confirmó reiniciar con la actualización ya descargada. */
  install(): AppUpdateState;
}

export function createUpdateController(deps: UpdateControllerDeps): UpdateController {
  const now = deps.now ?? (() => new Date());
  const setTimer = deps.setTimer ?? ((fn, ms) => {
    const handle = setTimeout(fn, ms);
    (handle as { unref?: () => void }).unref?.();
    return handle;
  });
  const clearTimer = deps.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  const log = deps.log ?? (() => undefined);

  let state = createInitialUpdateState(deps.currentVersion, deps.mode);
  let timer: unknown = null;
  let running = false;
  let checking: Promise<void> | null = null;
  let downloading: Promise<AppUpdateState> | null = null;
  let installing = false;

  function snapshot(): AppUpdateState {
    return { ...state, projectionActive: deps.isProjectionActive() };
  }

  function set(next: AppUpdateState): void {
    state = next;
    deps.onState(snapshot());
  }

  function schedule(delay: number): void {
    if (!running) return;
    if (timer) clearTimer(timer);
    timer = setTimer(() => {
      timer = null;
      void check();
    }, delay);
  }

  async function check(): Promise<void> {
    if (state.mode === "disabled") return;
    if (checking) return checking;
    // Sin descargas ni instalación en curso, y sin red no se intenta nada.
    if (state.status === "downloading" || installing) return;
    if (!deps.isOnline()) {
      log("[updater] sin red: se omite la comprobación");
      schedule(UPDATE_RETRY_INTERVAL_MS);
      return;
    }
    checking = (async () => {
      let failed = false;
      set(reduceOnCheckStart(state, now().toISOString()));
      try {
        const latest = await deps.backend.check();
        set(reduceOnCheckResult(state, latest?.version ?? null, now().toISOString()));
      } catch (error) {
        failed = true;
        const raw = error instanceof Error ? error.message : String(error);
        log(`[updater] comprobación fallida${isOfflineError(raw) ? " (sin red)" : ""}: ${raw}`);
        set(reduceOnCheckFailure(state, friendlyUpdateError(error, "check"), now().toISOString()));
      } finally {
        checking = null;
        schedule(failed ? UPDATE_RETRY_INTERVAL_MS : UPDATE_CHECK_INTERVAL_MS);
      }
    })();
    return checking;
  }

  async function startUpdate(): Promise<AppUpdateState> {
    if (state.mode === "disabled" || !state.availableVersion) return snapshot();
    if (state.status === "downloaded") return install();
    if (downloading) return downloading;
    const version = state.availableVersion;
    if (state.mode === "manual") {
      // Portable u otras plataformas: solo se abre la página de descarga.
      try {
        await deps.backend.download(() => undefined);
      } catch (error) {
        log(`[updater] no se pudo abrir la descarga: ${error instanceof Error ? error.message : String(error)}`);
        set({ ...state, message: "No se pudo abrir la página de descarga.", errorContext: "download" });
      }
      return snapshot();
    }
    downloading = (async () => {
      set(reduceOnDownloadStart(state));
      try {
        await deps.backend.download((percent) => {
          if (state.status !== "downloading") return;
          const next = reduceOnDownloadProgress(state, percent);
          // Un evento por porcentaje entero: sin inundar el IPC.
          if (next.downloadPercent !== state.downloadPercent) set(next);
        });
        set(reduceOnDownloadComplete(state, version));
        // El operador ya confirmó el reinicio, pero si desde entonces se puso
        // a proyectar, se espera a una segunda confirmación explícita.
        if (!deps.isProjectionActive()) return install();
      } catch (error) {
        const raw = error instanceof Error ? error.message : String(error);
        log(`[updater] descarga fallida: ${raw}`);
        set(reduceOnDownloadFailure(state, friendlyUpdateError(error, "download")));
      } finally {
        downloading = null;
      }
      return snapshot();
    })();
    return downloading;
  }

  function install(): AppUpdateState {
    if (state.mode !== "auto" || state.status !== "downloaded" || installing) return snapshot();
    installing = true;
    const fail = (error: unknown) => {
      installing = false;
      log(`[updater] instalación fallida: ${error instanceof Error ? error.message : String(error)}`);
      set(reduceOnInstallFailure(state, friendlyUpdateError(error, "install")));
    };
    try {
      deps.backend.install();
      // quitAndInstall cierra la app enseguida; si sigue viva, algo falló en silencio.
      setTimer(() => {
        if (installing) fail(new Error("La app no se cerró tras pedir la instalación"));
      }, INSTALL_WATCHDOG_MS);
    } catch (error) {
      fail(error);
    }
    return snapshot();
  }

  return {
    getState: snapshot,
    start() {
      if (running || state.mode === "disabled") return;
      running = true;
      schedule(UPDATE_STARTUP_DELAY_MS);
    },
    stop() {
      running = false;
      if (timer) clearTimer(timer);
      timer = null;
    },
    check,
    startUpdate,
    install,
  };
}
