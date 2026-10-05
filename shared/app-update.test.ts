import { describe, expect, it } from "vitest";
import {
  UPDATE_CHECK_INTERVAL_MS,
  UPDATE_FEED_URL,
  UPDATE_RETRY_INTERVAL_MS,
  UPDATE_STARTUP_DELAY_MS,
  compareVersions,
  createInitialUpdateState,
  friendlyUpdateError,
  getUpdateConfirmation,
  isNewerVersion,
  isOfflineError,
  reduceOnCheckFailure,
  reduceOnCheckResult,
  reduceOnCheckStart,
  reduceOnDownloadComplete,
  reduceOnDownloadFailure,
  reduceOnDownloadProgress,
  reduceOnDownloadStart,
  reduceOnInstallFailure,
  resolveUpdateButtonAction,
  shouldShowUpdateButton,
  updateButtonLabel,
  updateButtonTitle,
} from "./app-update";

describe("app-update", () => {
  it("points at the downloads bucket", () => {
    expect(UPDATE_FEED_URL).toBe("https://downloads.7lineas.com");
  });

  it("compares versions", () => {
    expect(compareVersions("1.0.2", "1.0.2")).toBe(0);
    expect(compareVersions("1.0.3", "1.0.2")).toBe(1);
    expect(compareVersions("1.0.2", "1.0.3")).toBe(-1);
    expect(compareVersions("1.10.0", "1.9.9")).toBe(1);
    expect(compareVersions("2.0.0", "1.99.99")).toBe(1);
  });

  it("detects newer releases", () => {
    expect(isNewerVersion("1.0.2", "1.0.3")).toBe(true);
    expect(isNewerVersion("1.0.2", "1.0.2")).toBe(false);
    expect(isNewerVersion("1.0.3", "1.0.2")).toBe(false);
    expect(isNewerVersion("", "1.0.3")).toBe(false);
  });
});

describe("update state", () => {
  const base = createInitialUpdateState("1.0.6", "auto");
  const at = "2026-10-04T20:00:00.000Z";

  it("hides the button until a newer version exists", () => {
    expect(shouldShowUpdateButton(base)).toBe(false);
    expect(shouldShowUpdateButton(reduceOnCheckStart(base, at))).toBe(false);
    expect(shouldShowUpdateButton(reduceOnCheckResult(base, "1.0.6", at))).toBe(false);
    expect(shouldShowUpdateButton(reduceOnCheckResult(base, "1.0.5", at))).toBe(false);
    expect(shouldShowUpdateButton(reduceOnCheckFailure(base, "Sin conexión a internet.", at))).toBe(false);
    expect(shouldShowUpdateButton(createInitialUpdateState("1.0.6", "disabled"))).toBe(false);
    expect(shouldShowUpdateButton(null)).toBe(false);
  });

  it("shows the button when a newer version is available", () => {
    const available = reduceOnCheckResult(base, "1.0.7", at);
    expect(available.status).toBe("available");
    expect(shouldShowUpdateButton(available)).toBe(true);
    expect(resolveUpdateButtonAction(available)).toBe("download");
    expect(updateButtonLabel(available)).toBe("Actualizar v1.0.7");
  });

  it("offers a plain download link in manual mode", () => {
    const available = reduceOnCheckResult(createInitialUpdateState("1.0.6", "manual"), "1.0.7", at);
    expect(resolveUpdateButtonAction(available)).toBe("open");
    expect(updateButtonLabel(available)).toBe("Descargar nueva versión v1.0.7");
  });

  it("tracks download progress, completion and install", () => {
    let state = reduceOnCheckResult(base, "1.0.7", at);
    state = reduceOnDownloadStart(state);
    expect(shouldShowUpdateButton(state)).toBe(true);
    expect(updateButtonLabel(state)).toBe("Descargando 0%");
    state = reduceOnDownloadProgress(state, 42.6);
    expect(state.downloadPercent).toBe(43);
    expect(reduceOnDownloadProgress(state, 250).downloadPercent).toBe(100);
    state = reduceOnDownloadComplete(state, "1.0.7");
    expect(resolveUpdateButtonAction(state)).toBe("install");
    expect(updateButtonLabel(state)).toBe("Reiniciar para actualizar v1.0.7");
  });

  it("keeps a visible update when a later check fails or finds nothing new", () => {
    const available = reduceOnCheckResult(base, "1.0.7", at);
    expect(reduceOnCheckFailure(available, "Sin conexión a internet.", at).status).toBe("available");
    expect(reduceOnCheckStart(available, at).status).toBe("available");
    const downloaded = reduceOnDownloadComplete(available, "1.0.7");
    expect(reduceOnCheckResult(downloaded, null, at).status).toBe("downloaded");
    expect(reduceOnCheckResult(downloaded, "1.0.7", at).status).toBe("downloaded");
  });

  it("returns to the retry state after a failed download or install", () => {
    const available = reduceOnCheckResult(base, "1.0.7", at);
    const failed = reduceOnDownloadFailure(reduceOnDownloadStart(available), "No se pudo descargar la actualización.");
    expect(failed.status).toBe("available");
    expect(failed.errorContext).toBe("download");
    expect(updateButtonLabel(failed)).toBe("Reintentar actualización v1.0.7");
    expect(updateButtonTitle(failed)).toBe("No se pudo descargar la actualización.");
    const installFailed = reduceOnInstallFailure(reduceOnDownloadComplete(available, "1.0.7"), "No se pudo instalar.");
    expect(installFailed.status).toBe("downloaded");
    expect(updateButtonLabel(installFailed)).toBe("Reintentar instalación v1.0.7");
  });

  it("warns about interruption and, when projecting, about the live projection", () => {
    const available = reduceOnCheckResult(base, "1.0.7", at);
    const quiet = getUpdateConfirmation(available);
    expect(quiet.title).toContain("1.0.7");
    expect(quiet.description).toMatch(/cerrará y se reiniciará/);
    expect(quiet.description).toMatch(/interrumpirá/);
    expect(quiet.projectionWarning).toBeNull();
    const live = getUpdateConfirmation({ ...available, projectionActive: true });
    expect(live.projectionWarning).toMatch(/proyección en vivo/);
    const ready = getUpdateConfirmation(reduceOnDownloadComplete(available, "1.0.7"));
    expect(ready.confirmLabel).toBe("Reiniciar y actualizar");
  });

  it("recognises offline errors and words them for the operator", () => {
    expect(isOfflineError("net::ERR_INTERNET_DISCONNECTED")).toBe(true);
    expect(isOfflineError("getaddrinfo ENOTFOUND downloads.7lineas.com")).toBe(true);
    expect(isOfflineError("Cannot parse latest.yml")).toBe(false);
    expect(friendlyUpdateError(new Error("net::ERR_INTERNET_DISCONNECTED"), "download")).toMatch(/sin conexión/);
    expect(friendlyUpdateError(new Error("boom"), "download")).toMatch(/No se pudo descargar/);
    expect(friendlyUpdateError(new Error("boom"), "install")).toMatch(/No se pudo instalar/);
  });

  it("keeps the polling gentle", () => {
    expect(UPDATE_STARTUP_DELAY_MS).toBeGreaterThanOrEqual(15_000);
    expect(UPDATE_CHECK_INTERVAL_MS).toBeGreaterThanOrEqual(60 * 60 * 1000);
    expect(UPDATE_RETRY_INTERVAL_MS).toBeGreaterThanOrEqual(10 * 60 * 1000);
  });
});
