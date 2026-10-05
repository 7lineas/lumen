import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { AppSettings, BibleVersionMeta } from "@shared/types";
import { isDefaultOnlineVersionId, type OnlineSearchHit, type OnlineVersionsResult } from "@shared/youversion";
import { ImportBibleCard } from "./ImportBibleCard";
import type { BibleDownloadProgress, BibleLibraryEntry, BibleLibraryView } from "../vite-env.d";

const SEARCH_DEBOUNCE_MS = 300;

interface Props {
  onChanged: (settings?: AppSettings) => void;
  online?: OnlineVersionsResult;
  onRefreshOnline?: () => void;
  onSearchOnline?: (query: string) => Promise<{ hits: OnlineSearchHit[]; error?: string; stale?: boolean }>;
  onAddOnline?: (id: string) => Promise<void>;
  onRemoveOnline?: (id: string) => Promise<void>;
  /** Bibles the user imported from files. */
  customVersions?: BibleVersionMeta[];
}

function formatByteSize(bytes: number | null): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return "—";
  const mb = bytes / (1024 * 1024);
  return `${mb.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MB`;
}

export function BiblesPanel({
  onChanged,
  online,
  onRefreshOnline,
  onSearchOnline,
  onAddOnline,
  onRemoveOnline,
  customVersions = [],
}: Props) {
  const [library, setLibrary] = useState<BibleLibraryView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [progress, setProgress] = useState<BibleDownloadProgress | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<OnlineSearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [busyOnlineId, setBusyOnlineId] = useState<string | null>(null);
  const searchSeq = useRef(0);

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

  useEffect(() => {
    if (!onSearchOnline) return;
    const trimmed = query.trim();
    if (!trimmed) {
      setHits([]);
      setSearchError(null);
      setSearching(false);
      return;
    }
    const seq = ++searchSeq.current;
    setSearching(true);
    const timer = window.setTimeout(() => {
      void onSearchOnline(trimmed)
        .then((result) => {
          if (seq !== searchSeq.current) return;
          setHits(result.hits);
          setSearchError(result.error ?? null);
        })
        .catch((reason: unknown) => {
          if (seq !== searchSeq.current) return;
          setHits([]);
          setSearchError(reason instanceof Error ? reason.message : "No se pudo buscar");
        })
        .finally(() => {
          if (seq === searchSeq.current) setSearching(false);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query, onSearchOnline]);

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

  async function addOnline(id: string) {
    if (!onAddOnline) return;
    setBusyOnlineId(id);
    setRowError(null);
    try {
      await onAddOnline(id);
      setHits((prev) => prev.map((hit) => (hit.id === id ? { ...hit, added: true } : hit)));
    } catch (reason) {
      setRowError({
        id,
        message: reason instanceof Error ? reason.message : "No se pudo añadir",
      });
    } finally {
      setBusyOnlineId(null);
    }
  }

  async function removeOnline(id: string) {
    if (!onRemoveOnline) return;
    setBusyOnlineId(id);
    setRowError(null);
    try {
      await onRemoveOnline(id);
      setHits((prev) => prev.map((hit) => (hit.id === id ? { ...hit, added: false } : hit)));
    } catch (reason) {
      setRowError({
        id,
        message: reason instanceof Error ? reason.message : "No se pudo quitar",
      });
    } finally {
      setBusyOnlineId(null);
    }
  }

  return (
    <main className="panel single bibles" data-testid="bible-list">
      <section className="bible-section">
        <h2>Biblias</h2>
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
      </section>
      <ImportBibleCard
        customVersions={customVersions}
        onChanged={() => onChanged()}
        onRemove={async (id) => {
          const result = await window.proyector?.removeBible(id);
          await reload();
          onChanged(result?.settings);
        }}
      />
      <section className="bible-section" data-testid="online-bibles-section">
        <h2>En línea (YouVersion)</h2>
        {!online?.configured && (
          <p className="muted">Esta compilación no incluye la clave de YouVersion Platform, así que las Biblias en línea no están disponibles.</p>
        )}
        {online?.configured && (
          <>
            <p className="bible-intro">
              Por defecto aparecen NVI, NBLA, LBLA, RVES y PDT. Puede buscar otras versiones del catálogo y
              añadirlas a esta instalación. Se consultan al elegirlas y cada capítulo se guarda en este
              equipo por 30 días. El texto lleva siempre el copyright de la editorial. Si una versión pide
              licencia, acéptela en el portal de YouVersion Platform de esta app.
            </p>
            <div className="online-toolbar">
              <Button type="button" onClick={onRefreshOnline} data-testid="online-refresh">
                Actualizar catálogo
              </Button>
            </div>
            {online.stale && (
              <p className="bible-banner">
                Sin conexión: se muestra la lista guardada.{online.error ? ` (${online.error})` : ""}
              </p>
            )}
            {!online.stale && online.error && online.versions.length === 0 && (
              <p className="error">
                {online.error}{" "}
                <Button type="button" onClick={onRefreshOnline}>
                  Reintentar
                </Button>
              </p>
            )}

            <label className="online-search">
              <span className="col-label">Buscar versiones</span>
              <Input
                data-testid="online-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Nombre, abreviatura o idioma (p. ej. PDT, NVI, español)"
                aria-label="Buscar versiones de YouVersion"
              />
            </label>
            {query.trim() && (
              <div className="bible-list online-search-results" data-testid="online-search-results">
                {searching && hits.length === 0 && <p className="muted">Buscando…</p>}
                {searchError && <p className="error">{searchError}</p>}
                {!searching && !searchError && hits.length === 0 && (
                  <p className="muted">Ninguna versión coincide con “{query.trim()}”.</p>
                )}
                {hits.map((hit) => (
                  <article className="bible-row" key={hit.id} data-testid={`online-hit-${hit.id}`}>
                    <h3>{hit.name}</h3>
                    <p className="bible-meta">
                      {hit.abbr} · {hit.language}
                      {hit.license ? ` · ${hit.license}` : ""}
                      {hit.locked ? " · licencia pendiente" : ""}
                    </p>
                    <div className="bible-actions">
                      {hit.locked && <span className="error">{hit.lockedReason}</span>}
                      {hit.added ? (
                        <span className="bible-status">
                          <Check size={16} strokeWidth={2.5} aria-hidden />
                          En tu lista
                        </span>
                      ) : (
                        <Button
                          type="button"
                          className="primary"
                          data-testid={`online-add-${hit.id}`}
                          disabled={busyOnlineId !== null}
                          onClick={() => void addOnline(hit.id)}
                        >
                          {busyOnlineId === hit.id ? "Añadiendo…" : "Añadir"}
                        </Button>
                      )}
                    </div>
                    {rowError?.id === hit.id && <p className="error">{rowError.message}</p>}
                  </article>
                ))}
              </div>
            )}

            <h3 className="online-list-title">Tu lista</h3>
            <div className="bible-list">
              {online.versions.map((version) => {
                const canRemove = !isDefaultOnlineVersionId(version.id);
                return (
                  <article className="bible-row" key={version.id} data-testid={`online-row-${version.id}`}>
                    <h3>{version.name}</h3>
                    <p className="bible-meta">
                      {version.abbr} · {version.language}
                      {version.license ? ` · ${version.license}` : " · YouVersion Platform"}
                    </p>
                    <div className="bible-actions">
                      {version.locked ? (
                        <span className="error">{version.lockedReason}</span>
                      ) : (
                        <span className="bible-status">
                          <Check size={16} strokeWidth={2.5} aria-hidden />
                          Disponible en el selector de versión
                        </span>
                      )}
                      {canRemove && (
                        <Button
                          type="button"
                          data-testid={`online-remove-${version.id}`}
                          disabled={busyOnlineId !== null}
                          onClick={() => void removeOnline(version.id)}
                        >
                          {busyOnlineId === version.id ? "Quitando…" : "Quitar"}
                        </Button>
                      )}
                    </div>
                    {rowError?.id === version.id && <p className="error">{rowError.message}</p>}
                  </article>
                );
              })}
              {online.versions.length === 0 && !online.error && (
                <p className="muted">No hay versiones en la lista todavía.</p>
              )}
            </div>
          </>
        )}
      </section>
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
      <h3>{entry.name}</h3>
      <p className="bible-meta">
        {entry.language} · {formatByteSize(entry.bytes)} · {entry.license}
      </p>
      <div className="bible-actions">
        {entry.availability === "included" && (
          <span className="bible-status">
            <Check size={16} strokeWidth={2.5} aria-hidden />
            Incluida
          </span>
        )}
        {entry.availability === "installed" && !downloading && (
          <>
            <span className="bible-status">
              <Check size={16} strokeWidth={2.5} aria-hidden />
              Descargada
            </span>
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
