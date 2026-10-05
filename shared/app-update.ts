export const UPDATE_FEED_URL = "https://downloads.7lineas.com";
export const UPDATE_MANIFEST_URL = `${UPDATE_FEED_URL}/latest.yml`;
export const UPDATE_DOWNLOADS_PAGE_HINT = UPDATE_FEED_URL;

export type VersionPart = number | string;

export function parseVersionParts(version: string): VersionPart[] {
  return String(version ?? "")
    .trim()
    .replace(/^[vV]/, "")
    .split(".")
    .map((part) => {
      const numeric = /^\d+$/.test(part) ? Number(part) : part;
      return numeric;
    });
}

/** Compare SemVer-like strings. Returns 1 when a > b, -1 when a < b, 0 when equal. */
export function compareVersions(a: string, b: string): 1 | -1 | 0 {
  const left = parseVersionParts(a);
  const right = parseVersionParts(b);
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    const l = left[i] ?? 0;
    const r = right[i] ?? 0;
    if (typeof l === "number" && typeof r === "number") {
      if (l > r) return 1;
      if (l < r) return -1;
    } else {
      const ls = String(l);
      const rs = String(r);
      if (ls > rs) return 1;
      if (ls < rs) return -1;
    }
  }
  return 0;
}

export function isNewerVersion(current: string, latest: string): boolean {
  if (!current || !latest) return false;
  return compareVersions(latest, current) === 1;
}

// ---------------------------------------------------------------------------
// Estado de actualización compartido entre el proceso principal y el operador.
// Las funciones de este bloque son puras: el reductor vive en el main y la UI
// solo lee el estado ya calculado.
// ---------------------------------------------------------------------------

export type AppUpdatePhase =
  | "disabled"
  | "idle"
  | "checking"
  | "up-to-date"
  | "available"
  | "downloading"
  | "downloaded"
  | "error";

/**
 * - `auto`: instalador NSIS en Windows; electron-updater descarga e instala.
 * - `manual`: portable u otras plataformas; solo avisa y abre la descarga.
 * - `disabled`: ejecución sin empaquetar (desarrollo).
 */
export type AppUpdateMode = "auto" | "manual" | "disabled";

export type AppUpdateErrorContext = "check" | "download" | "install";

export interface AppUpdateState {
  mode: AppUpdateMode;
  status: AppUpdatePhase;
  currentVersion: string;
  availableVersion: string | null;
  downloadedVersion: string | null;
  /** 0-100 mientras se descarga. */
  downloadPercent: number | null;
  checkedAt: string | null;
  message: string | null;
  errorContext: AppUpdateErrorContext | null;
  /** Hay una ventana de proyección abierta mostrando algo (no en negro). */
  projectionActive: boolean;
}

export type AppUpdateButtonAction = "download" | "install" | "open" | "none";

export function createInitialUpdateState(currentVersion: string, mode: AppUpdateMode): AppUpdateState {
  return {
    mode,
    status: mode === "disabled" ? "disabled" : "idle",
    currentVersion,
    availableVersion: null,
    downloadedVersion: null,
    downloadPercent: null,
    checkedAt: null,
    message: null,
    errorContext: null,
    projectionActive: false,
  };
}

export function reduceOnCheckStart(state: AppUpdateState, checkedAt: string): AppUpdateState {
  // Una comprobación en segundo plano no debe esconder un botón ya visible.
  if (state.status === "available" || state.status === "downloaded" || state.status === "downloading") {
    return { ...state, checkedAt };
  }
  return { ...state, status: "checking", checkedAt, message: null, errorContext: null };
}

export function reduceOnCheckResult(
  state: AppUpdateState,
  latestVersion: string | null,
  checkedAt: string,
): AppUpdateState {
  if (state.downloadedVersion && (!latestVersion || latestVersion === state.downloadedVersion)) {
    return { ...state, status: "downloaded", checkedAt, message: null, errorContext: null };
  }
  if (state.status === "downloading") return { ...state, checkedAt };
  if (!latestVersion || !isNewerVersion(state.currentVersion, latestVersion)) {
    return {
      ...state,
      status: "up-to-date",
      availableVersion: null,
      downloadedVersion: null,
      downloadPercent: null,
      checkedAt,
      message: null,
      errorContext: null,
    };
  }
  return {
    ...state,
    status: "available",
    availableVersion: latestVersion,
    downloadedVersion: state.downloadedVersion === latestVersion ? latestVersion : null,
    downloadPercent: null,
    checkedAt,
    message: null,
    errorContext: null,
  };
}

/** Un fallo al comprobar nunca molesta: se conserva lo que ya se sabía. */
export function reduceOnCheckFailure(state: AppUpdateState, message: string, checkedAt: string): AppUpdateState {
  if (state.status === "available" || state.status === "downloaded" || state.status === "downloading") {
    return { ...state, checkedAt };
  }
  return { ...state, status: "error", checkedAt, message, errorContext: "check", downloadPercent: null };
}

export function reduceOnDownloadStart(state: AppUpdateState): AppUpdateState {
  return { ...state, status: "downloading", downloadPercent: 0, message: null, errorContext: null };
}

export function reduceOnDownloadProgress(state: AppUpdateState, percent: number): AppUpdateState {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  return { ...state, status: "downloading", downloadPercent: clamped, message: null, errorContext: null };
}

export function reduceOnDownloadComplete(state: AppUpdateState, version: string): AppUpdateState {
  return {
    ...state,
    status: "downloaded",
    availableVersion: version,
    downloadedVersion: version,
    downloadPercent: 100,
    message: null,
    errorContext: null,
  };
}

export function reduceOnDownloadFailure(state: AppUpdateState, message: string): AppUpdateState {
  return {
    ...state,
    status: state.availableVersion ? "available" : "error",
    downloadPercent: null,
    message,
    errorContext: "download",
  };
}

export function reduceOnInstallFailure(state: AppUpdateState, message: string): AppUpdateState {
  return { ...state, status: "downloaded", message, errorContext: "install" };
}

/** Qué hace el botón ahora mismo (o `none` si no debe verse). */
export function resolveUpdateButtonAction(state: AppUpdateState | null): AppUpdateButtonAction {
  if (!state || state.mode === "disabled") return "none";
  if (state.status === "downloaded" && state.downloadedVersion) return "install";
  if (state.status === "available" && state.availableVersion) {
    return state.mode === "manual" ? "open" : "download";
  }
  return "none";
}

/** El botón solo existe cuando hay versión nueva (o una descarga en curso). */
export function shouldShowUpdateButton(state: AppUpdateState | null): boolean {
  if (!state || state.mode === "disabled") return false;
  if (state.status === "downloading") return true;
  return resolveUpdateButtonAction(state) !== "none";
}

export function updateButtonLabel(state: AppUpdateState): string {
  const version = state.downloadedVersion ?? state.availableVersion;
  const suffix = version ? ` v${version}` : "";
  if (state.status === "downloading") {
    const percent = typeof state.downloadPercent === "number" ? ` ${Math.floor(state.downloadPercent)}%` : "";
    return `Descargando${percent}`;
  }
  const action = resolveUpdateButtonAction(state);
  if (state.errorContext === "download" && action === "download") return `Reintentar actualización${suffix}`;
  if (state.errorContext === "install" && action === "install") return `Reintentar instalación${suffix}`;
  if (action === "install") return `Reiniciar para actualizar${suffix}`;
  if (action === "open") return `Descargar nueva versión${suffix}`;
  return `Actualizar${suffix}`;
}

export function updateButtonTitle(state: AppUpdateState): string {
  if (state.message && state.errorContext && state.errorContext !== "check") return state.message;
  const version = state.downloadedVersion ?? state.availableVersion;
  const versionText = version ? ` ${version}` : "";
  if (state.status === "downloading") return "Descargando la actualización…";
  const action = resolveUpdateButtonAction(state);
  if (action === "install") return `La versión${versionText} está lista. Lumen se reiniciará para instalarla.`;
  if (action === "open") return `Hay una versión nueva${versionText}. Se abrirá la página de descarga.`;
  return `Hay una versión nueva de Lumen${versionText}. Tu versión: ${state.currentVersion}.`;
}

export interface UpdateConfirmation {
  title: string;
  description: string;
  /** Aviso extra, solo si hay una proyección en curso. */
  projectionWarning: string | null;
  confirmLabel: string;
}

/** Texto del diálogo de confirmación antes de descargar/instalar. */
export function getUpdateConfirmation(state: AppUpdateState): UpdateConfirmation {
  const version = state.downloadedVersion ?? state.availableVersion;
  const versionLabel = version ? ` a la versión ${version}` : "";
  const installing = resolveUpdateButtonAction(state) === "install";
  return {
    title: `¿Actualizar Lumen${versionLabel}?`,
    description: installing
      ? "La actualización ya está descargada. Al continuar, Lumen se cerrará y se reiniciará para instalarla. Se interrumpirá cualquier trabajo abierto en la aplicación."
      : "Se descargará la actualización y, al terminar, Lumen se cerrará y se reiniciará para instalarla. Se interrumpirá cualquier trabajo abierto en la aplicación.",
    projectionWarning: state.projectionActive
      ? "Hay una proyección en vivo: la pantalla de proyección se cerrará y la congregación dejará de ver el contenido hasta que Lumen vuelva a abrir. Se recomienda actualizar fuera del culto."
      : null,
    confirmLabel: installing ? "Reiniciar y actualizar" : "Descargar y actualizar",
  };
}

const OFFLINE_PATTERN =
  /ERR_INTERNET_DISCONNECTED|ERR_NETWORK_CHANGED|ERR_NAME_NOT_RESOLVED|ERR_CONNECTION_(?:REFUSED|RESET|CLOSED|TIMED_OUT)|ERR_TIMED_OUT|ERR_PROXY|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENETUNREACH|EHOSTUNREACH|getaddrinfo|network|socket hang up|fetch failed/i;

export function isOfflineError(message: string | null | undefined): boolean {
  return OFFLINE_PATTERN.test(String(message ?? ""));
}

/** Mensaje corto y en español para mostrar al operador. */
export function friendlyUpdateError(error: unknown, context: AppUpdateErrorContext): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  if (isOfflineError(raw)) {
    return context === "download"
      ? "No se pudo descargar la actualización: sin conexión a internet. Inténtalo de nuevo cuando haya red."
      : "Sin conexión a internet.";
  }
  if (context === "download") return "No se pudo descargar la actualización. Inténtalo de nuevo en unos minutos.";
  if (context === "install") return "No se pudo instalar la actualización. Inténtalo de nuevo o descarga el instalador desde la página.";
  return "No se pudo buscar la actualización.";
}

/** Sondeo discreto: al iniciar (con retraso) y luego cada pocas horas. */
export const UPDATE_STARTUP_DELAY_MS = 30_000;
export const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const UPDATE_RETRY_INTERVAL_MS = 30 * 60 * 1000;
