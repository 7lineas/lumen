import { describe, expect, it, vi } from "vitest";
import type { AppUpdateMode, AppUpdateState } from "../shared/app-update";
import { UPDATE_CHECK_INTERVAL_MS, UPDATE_RETRY_INTERVAL_MS, UPDATE_STARTUP_DELAY_MS } from "../shared/app-update";
import { INSTALL_WATCHDOG_MS, createUpdateController, type UpdateBackend } from "./update-controller";

function setup(options: {
  mode?: AppUpdateMode;
  latest?: string | null;
  online?: boolean;
  projecting?: boolean;
  checkError?: Error;
  downloadError?: Error;
  installError?: Error;
} = {}) {
  const states: AppUpdateState[] = [];
  const timers: Array<{ fn: () => void; ms: number; cleared: boolean }> = [];
  const flags = { online: options.online ?? true, projecting: options.projecting ?? false };
  const backend = {
    check: vi.fn(async () => {
      if (options.checkError) throw options.checkError;
      return options.latest === null ? null : { version: options.latest ?? "1.0.7" };
    }),
    download: vi.fn(async (onProgress: (percent: number) => void) => {
      onProgress(10);
      onProgress(10.4);
      onProgress(55);
      if (options.downloadError) throw options.downloadError;
      onProgress(100);
    }),
    install: vi.fn(() => {
      if (options.installError) throw options.installError;
    }),
  } satisfies UpdateBackend;
  const controller = createUpdateController({
    backend,
    currentVersion: "1.0.6",
    mode: options.mode ?? "auto",
    isOnline: () => flags.online,
    isProjectionActive: () => flags.projecting,
    onState: (state) => states.push(state),
    now: () => new Date("2026-10-04T20:00:00.000Z"),
    setTimer: (fn, ms) => {
      const timer = { fn, ms, cleared: false };
      timers.push(timer);
      return timer;
    },
    clearTimer: (handle) => {
      (handle as { cleared: boolean }).cleared = true;
    },
  });
  const pending = () => timers.filter((timer) => !timer.cleared);
  const fire = () => {
    const timer = pending()[0];
    timer.cleared = true;
    timer.fn();
  };
  return { controller, backend, states, timers, pending, fire, flags };
}

describe("update controller", () => {
  it("checks once after a startup delay and then every few hours", async () => {
    const { controller, backend, pending, fire } = setup({ latest: "1.0.6" });
    controller.start();
    expect(backend.check).not.toHaveBeenCalled();
    expect(pending().map((timer) => timer.ms)).toEqual([UPDATE_STARTUP_DELAY_MS]);
    fire();
    await vi.waitFor(() => expect(controller.getState().status).toBe("up-to-date"));
    expect(backend.check).toHaveBeenCalledTimes(1);
    expect(pending().map((timer) => timer.ms)).toEqual([UPDATE_CHECK_INTERVAL_MS]);
  });

  it("reports an available version and never auto-downloads it", async () => {
    const { controller, backend } = setup();
    await controller.check();
    expect(controller.getState()).toMatchObject({ status: "available", availableVersion: "1.0.7" });
    expect(backend.download).not.toHaveBeenCalled();
  });

  it("stays silent and retries later without a network", async () => {
    const { controller, backend, pending, fire, states } = setup({ online: false });
    controller.start();
    fire();
    await vi.waitFor(() => expect(pending().some((timer) => timer.ms === UPDATE_RETRY_INTERVAL_MS)).toBe(true));
    expect(backend.check).not.toHaveBeenCalled();
    expect(states.every((state) => state.status === "idle")).toBe(true);
  });

  it("keeps check failures out of the way and retries sooner", async () => {
    const { controller, pending, fire } = setup({ checkError: new Error("net::ERR_INTERNET_DISCONNECTED") });
    controller.start();
    fire();
    await vi.waitFor(() => expect(controller.getState().status).toBe("error"));
    expect(controller.getState()).toMatchObject({ errorContext: "check", message: "Sin conexión a internet." });
    expect(pending().map((timer) => timer.ms)).toEqual([UPDATE_RETRY_INTERVAL_MS]);
  });

  it("does not overlap checks", async () => {
    const { controller, backend } = setup();
    await Promise.all([controller.check(), controller.check()]);
    expect(backend.check).toHaveBeenCalledTimes(1);
  });

  it("downloads with whole-percent progress and installs when nothing is projected", async () => {
    const { controller, backend, states } = setup();
    await controller.check();
    await controller.startUpdate();
    const percents = states.filter((state) => state.status === "downloading").map((state) => state.downloadPercent);
    expect(percents).toEqual([0, 10, 55, 100]);
    expect(backend.install).toHaveBeenCalledTimes(1);
    expect(controller.getState()).toMatchObject({ status: "downloaded", downloadedVersion: "1.0.7" });
  });

  it("waits for a second confirmation when a projection started during the download", async () => {
    const { controller, backend, flags } = setup();
    await controller.check();
    flags.projecting = true;
    await controller.startUpdate();
    expect(backend.install).not.toHaveBeenCalled();
    expect(controller.getState()).toMatchObject({ status: "downloaded", projectionActive: true });
    controller.install();
    expect(backend.install).toHaveBeenCalledTimes(1);
  });

  it("reports download failures and allows a retry", async () => {
    const failing = setup({ downloadError: new Error("net::ERR_INTERNET_DISCONNECTED") });
    await failing.controller.check();
    await failing.controller.startUpdate();
    expect(failing.controller.getState()).toMatchObject({ status: "available", errorContext: "download" });
    expect(failing.controller.getState().message).toMatch(/sin conexión/);
    expect(failing.backend.install).not.toHaveBeenCalled();
    await failing.controller.startUpdate();
    expect(failing.backend.download).toHaveBeenCalledTimes(2);
  });

  it("reports install failures without losing the downloaded update", async () => {
    const { controller } = setup({ installError: new Error("spawn failed") });
    await controller.check();
    await controller.startUpdate();
    expect(controller.getState()).toMatchObject({ status: "downloaded", errorContext: "install" });
    expect(controller.getState().message).toMatch(/No se pudo instalar/);
  });

  it("recovers when the app is still alive after asking to install", async () => {
    const { controller, backend, pending } = setup();
    await controller.check();
    await controller.startUpdate();
    expect(backend.install).toHaveBeenCalledTimes(1);
    const watchdog = pending().find((timer) => timer.ms === INSTALL_WATCHDOG_MS);
    expect(watchdog).toBeDefined();
    watchdog!.fn();
    expect(controller.getState()).toMatchObject({ status: "downloaded", errorContext: "install" });
    controller.install();
    expect(backend.install).toHaveBeenCalledTimes(2);
  });

  it("skips scheduled checks while downloading", async () => {
    const { controller, backend } = setup();
    await controller.check();
    const download = controller.startUpdate();
    await controller.check();
    await download;
    expect(backend.check).toHaveBeenCalledTimes(1);
  });

  it("only opens the download page in manual mode", async () => {
    const { controller, backend } = setup({ mode: "manual" });
    await controller.check();
    await controller.startUpdate();
    expect(backend.download).toHaveBeenCalledTimes(1);
    expect(backend.install).not.toHaveBeenCalled();
    expect(controller.getState().status).toBe("available");
    controller.install();
    expect(backend.install).not.toHaveBeenCalled();
  });

  it("does nothing when disabled", async () => {
    const { controller, backend, pending } = setup({ mode: "disabled" });
    controller.start();
    await controller.check();
    await controller.startUpdate();
    expect(pending()).toHaveLength(0);
    expect(backend.check).not.toHaveBeenCalled();
    expect(controller.getState().status).toBe("disabled");
  });

  it("stops polling", () => {
    const { controller, pending } = setup();
    controller.start();
    controller.stop();
    expect(pending()).toHaveLength(0);
  });
});
