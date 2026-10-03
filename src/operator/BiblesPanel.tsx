import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import type { AppSettings } from "@shared/types";
import type { BibleDownloadProgress, BibleLibraryEntry, BibleLibraryView } from "../vite-env.d";

interface Props {
  onChanged: (settings?: AppSettings) => void;
}

function formatByteSize(bytes: number | null): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return "—";
  const mb = bytes / (1024 * 1024);
  return `${mb.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MB`;
}

export function BiblesPanel({ onChanged }: Props) {
  const [library, setLibrary] = useState<BibleLibraryView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [progress, setProgress] = useState<BibleDownloadProgress | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);

  async function reload() {
    const view = await window.proyector?.getBibleCatalog();
    if (view) setLibrary(view);
  }

  useEffect(() => {
    let cancelled = false;
    void window.proyector
      ?.getBibleCatalog()
      .then((view) => {
        if (!cancelled) setLibrary(view);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "No se pudo leer el catálogo");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return window.proyector?.onBibleDownloadProgress((next) => {
      setProgress(next);
    });
  }, []);

  async function download(id: string) {
    setActiveId(id);
    setRowError(null);
    setProgress({ id, loaded: 0, total: null, attempt: 1 });
    try {
      await window.proyector?.downloadBible(id);
      await reload();
      onChanged();
    } catch (reason) {
      setRowError({
        id,
        message: reason instanceof Error ? reason.message : "No se pudo descargar",
      });
    } finally {
      setActiveId(null);
      setProgress(null);
    }
  }

  async function remove(id: string) {
    setRowError(null);
    try {
      const result = await window.proyector?.removeBible(id);
      await reload();
      onChanged(result?.settings);
    } catch (reason) {
      setRowError({
        id,
        message: reason instanceof Error ? reason.message : "No se pudo quitar",
      });
    }
  }

  return (
    <main className="panel single bibles" data-testid="bible-list">
      <h2>Biblias</h2>
      <p>
        Elija una versión para guardarla en este equipo. Después funciona sin internet. RV1909, KJV y WEB
        ya vienen con el programa.
      </p>
      {library?.offline && (
        <p className="bible-banner">
          No hay conexión al catálogo. Se muestran las versiones conocidas. Las que ya descargó siguen
          disponibles.
        </p>
      )}
      {error && <p className="error">{error}</p>}
      {!library && !error && <p className="muted">Cargando catálogo…</p>}
      <div className="bible-list">
        {library?.entries.map((entry) => (
          <BibleRow
            key={entry.id}
            entry={entry}
            busy={activeId !== null}
            downloading={activeId === entry.id}
            progress={progress?.id === entry.id ? progress : null}
            error={rowError?.id === entry.id ? rowError.message : null}
            onDownload={() => void download(entry.id)}
            onRemove={() => void remove(entry.id)}
          />
        ))}
      </div>
    </main>
  );
}

function BibleRow({
  entry,
  busy,
  downloading,
  progress,
  error,
  onDownload,
  onRemove,
}: {
  entry: BibleLibraryEntry;
  busy: boolean;
  downloading: boolean;
  progress: BibleDownloadProgress | null;
  error: string | null;
  onDownload: () => void;
  onRemove: () => void;
}) {
  const percent =
    progress?.total && progress.total > 0 ? Math.min(100, Math.round((progress.loaded / progress.total) * 100)) : null;

  return (
    <article className="bible-row" data-testid={`bible-row-${entry.id}`}>
      <h3>
        {entry.name}
        {entry.draft && <span className="badge">Borrador</span>}
      </h3>
      <p className="bible-meta">
        {entry.language} · {formatByteSize(entry.bytes)} · {entry.license}
      </p>
      <div className="bible-actions">
        {entry.availability === "included" && <span className="muted">Incluida</span>}
        {entry.availability === "installed" && !downloading && (
          <>
            <span className="muted">Descargada</span>
            <Button type="button" onClick={onRemove} disabled={busy}>
              Quitar
            </Button>
          </>
        )}
        {entry.availability === "available" && !downloading && (
          <Button type="button" className="primary" onClick={onDownload} disabled={busy}>
            {error ? "Reintentar" : "Descargar"}
          </Button>
        )}
        {downloading && (
          <>
            <progress value={percent ?? undefined} max={100} />
            <span>{percent == null ? "Descargando…" : `${percent}%`}</span>
          </>
        )}
      </div>
      {error && <p className="error">{error}</p>}
    </article>
  );
}
