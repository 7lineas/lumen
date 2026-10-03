import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { UPDATE_FEED_URL } from "@shared/app-update";
import type { AppUpdateEvent, AppUpdateStatus } from "../vite-env.d";

type Phase =
  | "idle"
  | "checking"
  | "up-to-date"
  | "available"
  | "downloading"
  | "ready"
  | "error";

export function UpdateButton() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState<AppUpdateStatus | null>(null);
  const [latest, setLatest] = useState<string | null>(null);
  const [percent, setPercent] = useState(0);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void window.proyector?.getAppUpdateStatus().then(setStatus).catch(() => undefined);
    return window.proyector?.onAppUpdateEvent((event: AppUpdateEvent) => {
      if (event.type === "checking-for-update") {
        setPhase("checking");
        setMessage(null);
      } else if (event.type === "update-available") {
        setLatest(event.version ?? null);
        setPhase("available");
      } else if (event.type === "update-not-available") {
        setPhase("up-to-date");
      } else if (event.type === "download-progress") {
        setPercent(event.percent ?? 0);
        setPhase("downloading");
      } else if (event.type === "update-downloaded") {
        setLatest(event.version ?? null);
        setPhase("ready");
      } else if (event.type === "error") {
        setMessage(event.message ?? "No se pudo buscar la actualización");
        setPhase("error");
      }
    });
  }, []);

  useEffect(() => {
    if (phase !== "up-to-date") return;
    const timer = setTimeout(() => setPhase("idle"), 4000);
    return () => clearTimeout(timer);
  }, [phase]);

  async function check() {
    setMessage(null);
    setPhase("checking");
    try {
      const result = await window.proyector?.checkForAppUpdate();
      if (result?.updateAvailable && result.version) {
        setLatest(result.version);
        setPhase("available");
      } else if (result && !result.updateAvailable) {
        setPhase("up-to-date");
      }
    } catch (error) {
      // Portable, dev o sin red: ofrecer la descarga manual.
      if (status && !status.supported) {
        setPhase("error");
        setMessage(
          status.portable
            ? "La versión portable no se actualiza sola. Descargue el instalador nuevo."
            : "Descargue la versión nueva desde la página.",
        );
        return;
      }
      setPhase("error");
      setMessage(error instanceof Error ? error.message : "No se pudo buscar la actualización");
    }
  }

  async function download() {
    setMessage(null);
    setPercent(0);
    setPhase("downloading");
    try {
      await window.proyector?.downloadAppUpdate();
    } catch (error) {
      setPhase("error");
      setMessage(error instanceof Error ? error.message : "No se pudo descargar la actualización");
    }
  }

  async function restart() {
    await window.proyector?.installAppUpdate().catch(() => undefined);
  }

  async function openManualDownload() {
    const base = (status?.feedUrl || UPDATE_FEED_URL).replace(/\/+$/, "");
    const file = latest ? `Lumen-${latest}-win-x64.exe` : null;
    const url = file ? `${base}/${file}` : `${base}/releases.json`;
    try {
      await window.proyector?.openAppDownload(url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo abrir la descarga");
    }
  }

  const title = status
    ? `Versión actual ${status.version}. Fuente: ${status.feedUrl}`
    : "Buscar actualizaciones";

  if (phase === "checking") {
    return (
      <Button type="button" data-testid="btn-update" disabled title={title}>
        Buscando…
      </Button>
    );
  }
  if (phase === "up-to-date") {
    return (
      <Button type="button" data-testid="btn-update" title={title} onClick={() => void check()}>
        Al día{status ? ` (${status.version})` : ""}
      </Button>
    );
  }
  if (phase === "available") {
    return (
      <Button
        type="button"
        data-testid="btn-update"
        className="primary"
        title={title}
        onClick={() => void download()}
      >
        Descargar{latest ? ` v${latest}` : ""}
      </Button>
    );
  }
  if (phase === "downloading") {
    return (
      <Button type="button" data-testid="btn-update" disabled title={title}>
        Descargando {percent}%
      </Button>
    );
  }
  if (phase === "ready") {
    return (
      <Button
        type="button"
        data-testid="btn-update"
        className="primary"
        title={title}
        onClick={() => void restart()}
      >
        Reiniciar para actualizar{latest ? ` v${latest}` : ""}
      </Button>
    );
  }
  if (phase === "error") {
    const manual = status && !status.supported;
    return (
      <span className="update-error-wrap" title={message ?? title}>
        <Button type="button" data-testid="btn-update" title={message ?? title} onClick={() => void check()}>
          Reintentar
        </Button>
        {manual && (
          <Button type="button" title={title} onClick={() => void openManualDownload()}>
            Descargar
          </Button>
        )}
      </span>
    );
  }
  return (
    <Button type="button" data-testid="btn-update" title={title} onClick={() => void check()}>
      Actualizar
    </Button>
  );
}
