import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useEffect, useState } from "react";
import type { AppSettings, BibleVersionMeta } from "@shared/types";
import { ImportBibleCard } from "./ImportBibleCard";
import type { OnlineVersionsResult } from "@shared/youversion";
import type { BibleDownloadProgress, BibleLibraryEntry, BibleLibraryView } from "../vite-env.d";

interface Props {
  onChanged: (settings?: AppSettings) => void;
  online?: OnlineVersionsResult;
  onRefreshOnline?: () => void;
  /** Bibles the user imported from files. */
  customVersions?: BibleVersionMeta[];
}

function formatByteSize(bytes: number | null): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return "—";
  const mb = bytes / (1024 * 1024);
  return `${mb.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MB`;
}

export function BiblesPanel({ onChanged, online, onRefreshOnline, customVersions = [] }: Props) {
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
        Elija una versión para guardarla en este equipo. Después funciona sin internet. RV1909 ya viene con el programa.
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
      <ImportBibleCard
        customVersions={customVersions}
        onChanged={() => onChanged()}
        onRemove={async (id) => {
          const result = await window.proyector?.removeBible(id);
          await reload();
          onChanged(result?.settings);
        }}
      />
      <h2>En línea (YouVersion)</h2>
      {!online?.configured && (
        <p className="muted">Esta compilación no incluye la clave de YouVersion Platform, así que las Biblias en línea no están disponibles.</p>
      )}
      {online?.configured && (
        <>
          <p>
            Se consultan al elegirlas y cada capítulo se guarda en este equipo por 30 días: lo ya consultado funciona sin
            internet. El texto lleva siempre el copyright de la editorial.
          </p>
          <Button type="button" onClick={onRefreshOnline} data-testid="online-refresh">Actualizar lista</Button>
          {online.stale && <p className="bible-banner">Sin conexión: se muestra la lista guardada.{online.error ? ` (${online.error})` : ""}</p>}
          {!online.stale && online.error && online.versions.length === 0 && (
            <p className="error">{online.error}{" "}<Button type="button" onClick={onRefreshOnline}>Reintentar</Button></p>
          )}
          <div className="bible-list">
            {online.versions.map((version) => (
              <article className="bible-row" key={version.id} data-testid={`online-row-${version.id}`}>
                <h3>{version.name}</h3>
                <p className="bible-meta">{version.abbr} · {version.license ?? "YouVersion Platform"}</p>
                <div className="bible-actions">
                  {version.locked
                    ? <span className="error">{version.lockedReason}</span>
                    : <span className="muted">Disponible en el selector de versión</span>}
                </div>
              </article>
            ))}
          </div>
        </>
      )}
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
        {entry.draft && <Badge className="badge">Borrador</Badge>}
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
            <Progress value={percent ?? 0} />
            <span>{percent == null ? "Descargando…" : `${percent}%`}</span>
          </>
        )}
      </div>
      {error && <p className="error">{error}</p>}
    </article>
  );
}
