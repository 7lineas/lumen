import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react";
import { Pin, Play, Plus, Upload } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { backgroundImageUrl } from "@shared/background-image";
import { slideLabel } from "@shared/slide-deck";
import {
  mediaKind,
  type MediaFit,
  type PendingSlideImport,
  type StoredSlideDeck,
} from "@shared/types";
import { FitToggle } from "./FitToggle";
import { AudioIcon, MediaIcon, SearchIcon, SlidesIcon } from "./icons";
import { ItemMenu } from "./ItemMenu";
import { rasterizePdfToPngs } from "./pdfConvert";

const IMPORT_ERRORS: Record<string, string> = {
  "unsupported-format":
    "Ese formato no se puede abrir. Usa PowerPoint (.pptx), PDF, imágenes, video (mp4, mov, webm) o audio (mp3, wav, m4a).",
  "invalid-pptx":
    "No se pudo abrir el archivo PowerPoint. Puede estar dañado o protegido con contraseña.",
  "empty-presentation": "La presentación no tiene diapositivas.",
  "read-failed": "No se pudo leer ese archivo.",
};

export type MediaItem = StoredSlideDeck;

export interface SlideStage {
  deckId: string;
  title: string;
  images: string[];
  index: number;
}

interface Props {
  /** Slides of the selected deck and the one in preview. Null for video and audio. */
  staged: SlideStage | null;
  selected: MediaItem | null;
  /** Image on the projector right now, when it is a slide. */
  liveImage?: string | null;
  /** Video on the projector right now. */
  liveVideo?: string | null;
  /** Audio item loaded in the player, and whether it is sounding. */
  audioId?: string | null;
  audioPlaying?: boolean;
  slideFit: MediaFit;
  onSlideFit: (fit: MediaFit) => void;
  projectOnClick: boolean;
  onToggleProjectOnClick: (value: boolean) => void;
  onSelect: (item: MediaItem | null) => void;
  onSelectSlide: (index: number) => void;
  /** Double-click: stage the slide and project it. */
  onTakeSlide: (index: number) => void;
  /** Project the selected video, or play the selected audio. */
  onTake: () => void;
  onRemoved: (item: MediaItem) => void;
  /** Called with the item after its title changes, so the open selection follows the new name. */
  onRenamed: (item: MediaItem) => void;
  /** Called with a deck after its images changed (merged into, or slides taken out), so the open selection follows. */
  onImagesChanged: (item: MediaItem) => void;
}

/** A presentation being converted to images (kept in memory only; never persisted as a deck). */
interface Job {
  pending: PendingSlideImport;
  status: "running" | "failed";
  done: number;
  total: number;
  error?: string;
}

const KIND_ICON = {
  slides: SlidesIcon,
  video: MediaIcon,
  audio: AudioIcon,
} as const;

function describe(item: MediaItem): string {
  const kind = mediaKind(item);
  if (kind === "video") return "Video";
  if (kind === "audio") return "Audio";
  return `${item.images.length} ${item.images.length === 1 ? "item" : "items"}`;
}

const normalize = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");

const newDeckId = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

/** Every item id starts with the time it was created, in milliseconds. */
const createdAt = (item: MediaItem) => Number(item.id.split("-")[0]) || 0;

export function MediaWorkspace({
  staged,
  selected,
  liveImage,
  liveVideo,
  audioId,
  audioPlaying,
  slideFit,
  onSlideFit,
  projectOnClick,
  onToggleProjectOnClick,
  onSelect,
  onSelectSlide,
  onTakeSlide,
  onTake,
  onRemoved,
  onRenamed,
  onImagesChanged,
}: Props) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [renameHeight, setRenameHeight] = useState<number | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  // Mirrors renamingId so a blur after Enter or Escape cannot save twice.
  const renameRef = useRef<string | null>(null);
  const mounted = useRef(true);
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    const api = window.proyector;
    if (!api) {
      setLoaded(true);
      return () => {
        cancelled = true;
      };
    }
    void api
      .getSlideDecks()
      .then((saved) => {
        if (cancelled) return;
        setItems(Array.isArray(saved) ? saved : []);
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (loaded) void window.proyector?.setSlideDecks(items);
  }, [items, loaded]);
  useEffect(() => {
    const unsubscribe = window.proyector?.onSlideProgress?.((progress) => {
      if (!mounted.current) return;
      setJobs((current) =>
        current.map((job) =>
          job.pending.id === progress.deckId && job.status === "running"
            ? { ...job, done: progress.done, total: progress.total }
            : job,
        ),
      );
    });
    return () => unsubscribe?.();
  }, []);

  // Screenshot conversion: .pptx is rendered in the main process (pptx-glimpse
  // with the system fonts, off the UI thread); .pdf is rasterized here with
  // pdf.js. Files never leave the machine. Only the resulting PNGs are kept:
  // a failed conversion stores nothing (error + retry, no text-only deck).
  // The work is never cancelled by React effects; `mounted` only guards state.
  const runConversion = useCallback(async (pending: PendingSlideImport) => {
    const api = window.proyector;
    if (!api) return;
    const id = pending.id;
    const setJob = (patch: Partial<Job>) => {
      if (mounted.current)
        setJobs((current) =>
          current.map((job) =>
            job.pending.id === id ? { ...job, ...patch } : job,
          ),
        );
    };
    setJob({ status: "running", done: 0, error: undefined });
    try {
      let images: string[];
      if (pending.source.kind === "pdf") {
        const base64 = await api.readSlideSource(pending.source.file);
        if (!base64) throw new Error("No se pudo leer el PDF guardado.");
        const { pngBase64 } = await rasterizePdfToPngs(base64, {
          targetWidth: 1920,
          onProgress: (done, total) => setJob({ done, total }),
        });
        const saved = await api.saveSlidePngs(pngBase64);
        if (!saved || saved.length !== pngBase64.length)
          throw new Error("No se pudieron guardar las imágenes.");
        images = saved;
      } else {
        const result = await api.convertPptx({
          deckId: id,
          file: pending.source.file,
          total: pending.total,
        });
        if (!result.ok) throw new Error(result.error);
        images = result.images;
      }
      const deck: StoredSlideDeck = {
        id,
        title: pending.title,
        images,
        updatedAt: Date.now(),
        pinned: false,
      };
      void api.discardSlideSource(pending.source.file);
      if (mounted.current) {
        setItems((current) => [deck, ...current]);
        setJobs((current) => current.filter((job) => job.pending.id !== id));
        onSelectRef.current(deck);
      } else {
        // The user left the tab meanwhile: still persist the finished deck.
        const saved = await api.getSlideDecks();
        await api.setSlideDecks([deck, ...(Array.isArray(saved) ? saved : [])]);
      }
    } catch (error) {
      console.error(`[media] conversion of "${pending.title}" failed`, error);
      setJob({
        status: "failed",
        error:
          error instanceof Error && error.message
            ? error.message
            : "Error desconocido.",
      });
    }
  }, []);

  const [importing, setImporting] = useState(false);
  const importMedia = async () => {
    setImportError(null);
    setImporting(true);
    try {
      const result = await window.proyector?.importSlideDeck();
      if (!result) return;
      if (result.kind === "error") {
        setImportError(
          IMPORT_ERRORS[result.error] ?? IMPORT_ERRORS["read-failed"]!,
        );
        return;
      }
      if (result.kind === "ready") {
        setItems((current) => [
          result.deck,
          ...(result.more ?? []),
          ...current,
        ]);
        onSelect(result.deck);
        return;
      }
      const pending = result.pending;
      setJobs((current) => [
        ...current,
        { pending, status: "running", done: 0, total: pending.total },
      ]);
      void runConversion(pending);
    } catch (error) {
      console.error("[media] import failed", error);
      setImportError(IMPORT_ERRORS["read-failed"]!);
    } finally {
      setImporting(false);
    }
  };
  const dismissJob = (job: Job) => {
    void window.proyector?.discardSlideSource(job.pending.source.file);
    setJobs((current) =>
      current.filter((item) => item.pending.id !== job.pending.id),
    );
  };
  const visible = useMemo(() => {
    const q = normalize(query.trim());
    return items
      .filter((item) => !q || normalize(item.title).includes(q))
      .sort(
        (a, b) =>
          Number(b.pinned) - Number(a.pinned) || createdAt(b) - createdAt(a),
      );
  }, [items, query]);
  const removeItem = (item: MediaItem) => {
    setItems((current) => current.filter((entry) => entry.id !== item.id));
    if (item.id === selected?.id) onSelect(null);
    onRemoved(item);
  };
  const startRename = (item: MediaItem, row: HTMLElement) => {
    renameRef.current = item.id;
    setRenamingId(item.id);
    setRenameDraft(item.title);
    // Keep the row exactly as tall as it was, so editing does not shift the list.
    setRenameHeight(row.getBoundingClientRect().height);
  };
  const finishRename = (id: string, save: boolean) => {
    if (renameRef.current !== id) return;
    renameRef.current = null;
    setRenamingId(null);
    setRenameHeight(null);
    const title = renameDraft.trim();
    const item = items.find((entry) => entry.id === id);
    if (!save || !item || !title || title === item.title) return;
    const renamed = { ...item, title };
    setItems((current) =>
      current.map((entry) => (entry.id === id ? renamed : entry)),
    );
    onRenamed(renamed);
  };

  // Drag a slide item onto another slide item: the dragged item's images move to the
  // end of the target, and the dragged item is removed from the list.
  const dragIdRef = useRef<string | null>(null);
  const [dropId, setDropId] = useState<string | null>(null);
  const endItemDrag = () => {
    dragIdRef.current = null;
    setDropId(null);
  };
  const acceptItem = (event: DragEvent<HTMLElement>, item: MediaItem) => {
    const dragId = dragIdRef.current;
    if (!dragId || dragId === item.id || mediaKind(item) !== "slides") return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropId(item.id);
  };
  const leaveItem = (event: DragEvent<HTMLElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null))
      return;
    setDropId(null);
  };
  const mergeItem = (event: DragEvent<HTMLElement>, target: MediaItem) => {
    const dragId = dragIdRef.current;
    endItemDrag();
    if (!dragId || dragId === target.id) return;
    event.preventDefault();
    const source = items.find((entry) => entry.id === dragId);
    if (!source || mediaKind(source) !== "slides") return;
    const merged: MediaItem = {
      ...target,
      images: [...target.images, ...source.images],
      updatedAt: Date.now(),
    };
    setItems((current) =>
      current
        .filter((entry) => entry.id !== dragId)
        .map((entry) => (entry.id === target.id ? merged : entry)),
    );
    if (selected?.id === dragId) onSelect(merged);
    else onImagesChanged(merged);
  };

  // A slide dragged out of the open deck and dropped on the sidebar becomes a new item.
  // A deck keeps at least one slide, so its only slide cannot leave.
  const slideDragRef = useRef<{ deckId: string; index: number } | null>(null);
  const [slideDragging, setSlideDragging] = useState(false);
  const endSlideDrag = () => {
    slideDragRef.current = null;
    setSlideDragging(false);
  };
  const acceptSlideOut = (event: DragEvent<HTMLElement>) => {
    if (!slideDragRef.current) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  };
  const dropSlideOut = (event: DragEvent<HTMLElement>) => {
    const drag = slideDragRef.current;
    endSlideDrag();
    if (!drag) return;
    event.preventDefault();
    const source = items.find((entry) => entry.id === drag.deckId);
    const image = source?.images[drag.index];
    if (!source || image === undefined || source.images.length < 2) return;
    const now = Date.now();
    const remaining: MediaItem = {
      ...source,
      images: source.images.filter((_, i) => i !== drag.index),
      updatedAt: now,
    };
    const deck: MediaItem = {
      id: newDeckId(),
      title: `${source.title} · Item ${drag.index + 1}`,
      images: [image],
      updatedAt: now,
      pinned: false,
    };
    setItems((current) => [
      deck,
      ...current.map((entry) =>
        entry.id === remaining.id ? remaining : entry,
      ),
    ]);
    onImagesChanged(remaining);
    onSelect(deck);
  };

  const kind = selected ? mediaKind(selected) : null;
  const gridRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    gridRef.current
      ?.querySelector("[data-current]")
      ?.scrollIntoView({ block: "nearest" });
  }, [staged?.index, staged?.deckId]);

  const videoLive =
    kind === "video" && selected?.file != null && selected.file === liveVideo;
  const audioLoaded = kind === "audio" && selected?.id === audioId;

  return (
    <>
      <aside
        className="lx-lib"
        onDragOver={acceptSlideOut}
        onDrop={dropSlideOut}
      >
        <div className="lx-lib-head">
          <span className="lx-h">Media</span>
          <button
            type="button"
            className="lx-icon-btn"
            aria-label="Importar media"
            title="Importar presentación, imágenes, video o audio"
            data-testid="btn-import-media"
            disabled={importing}
            onClick={() => void importMedia()}
          >
            {importing ? <Spinner /> : <Plus />}
          </button>
        </div>
        <label className="lx-search">
          <SearchIcon />
          <input
            data-search
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && visible[0]) onSelect(visible[0]);
              else if (event.key === "Escape") {
                setQuery("");
                event.currentTarget.blur();
              }
            }}
            placeholder="Buscar media…"
            aria-label="Buscar media"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        {jobs.map((job) =>
          job.status === "running" ? (
            <p
              key={job.pending.id}
              className="lx-note"
              role="status"
              data-testid="slides-converting"
            >
              Generando imágenes de “{job.pending.title}”… {job.done}
              {job.total > 0 ? `/${job.total}` : ""}
            </p>
          ) : (
            <div
              key={job.pending.id}
              className="lx-note lx-note-error"
              role="alert"
              data-testid="slides-error"
            >
              No se pudo convertir “{job.pending.title}” a imágenes ({job.error}
              ).
              <span className="lx-note-actions">
                <button
                  type="button"
                  className="lx-link"
                  data-testid="slides-retry"
                  onClick={() => void runConversion(job.pending)}
                >
                  Reintentar
                </button>
                <button
                  type="button"
                  className="lx-link"
                  onClick={() => dismissJob(job)}
                >
                  Descartar
                </button>
              </span>
            </div>
          ),
        )}
        {importError && (
          <p
            className="lx-note lx-note-error"
            role="alert"
            data-testid="slides-import-error"
          >
            {importError}
          </p>
        )}
        <div className="lx-lib-scroll">
          {slideDragging && (
            <div className="lx-slide-out">Suelta para desagrupar</div>
          )}
          {visible.map((item) => {
            const Icon = KIND_ICON[mediaKind(item)];
            const isSlides = mediaKind(item) === "slides";
            return (
              <div
                key={item.id}
                className={`lx-item${item.id === selected?.id ? " on" : ""}${item.id === renamingId ? " renaming" : ""}${dropId === item.id ? " drop" : ""}`}
                style={
                  item.id === renamingId && renameHeight
                    ? { height: renameHeight, boxSizing: "border-box" }
                    : undefined
                }
                draggable={isSlides && item.id !== renamingId}
                onDragStart={
                  isSlides
                    ? (event) => {
                        dragIdRef.current = item.id;
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", item.id);
                      }
                    : undefined
                }
                onDragEnd={endItemDrag}
                onDragOver={(event) => acceptItem(event, item)}
                onDragLeave={leaveItem}
                onDrop={(event) => mergeItem(event, item)}
              >
                {renamingId === item.id ? (
                  <div className="lx-item-main">
                    <span className="lx-ico">
                      <Icon />
                    </span>
                    <span className="lx-item-text">
                      <input
                        className="lx-item-rename"
                        aria-label="Nuevo nombre"
                        value={renameDraft}
                        autoFocus
                        onFocus={(event) => event.currentTarget.select()}
                        onChange={(event) => setRenameDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            finishRename(item.id, true);
                          } else if (event.key === "Escape") {
                            event.preventDefault();
                            finishRename(item.id, false);
                          }
                        }}
                        onBlur={() => finishRename(item.id, true)}
                      />
                    </span>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="lx-item-main"
                    aria-label={`Seleccionar ${item.title}`}
                    onClick={() => onSelect(item)}
                  >
                    <span className="lx-ico">
                      <Icon />
                    </span>
                    <span className="lx-item-text">
                      <span className="t">{item.title}</span>
                      <span className="s">{describe(item)}</span>
                    </span>
                  </button>
                )}
                <span
                  className={`lx-item-actions${item.pinned ? " keep" : ""}`}
                >
                  <ItemMenu
                    label={item.title}
                    testId={`btn-menu-media-${item.id}`}
                    editLabel="Renombrar"
                    onEdit={(row) => startRename(item, row)}
                    onDownload={() =>
                      void window.proyector?.downloadMediaItem(item)
                    }
                    onDelete={() => setDeletingId(item.id)}
                  />
                  <AlertDialog
                    open={deletingId === item.id}
                    onOpenChange={(open) =>
                      setDeletingId(open ? item.id : null)
                    }
                  >
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Eliminar de Media</AlertDialogTitle>
                        <AlertDialogDescription>
                          ¿Eliminar “{item.title}”? Se borra también su copia
                          guardada en la aplicación. Esta acción no se puede
                          deshacer.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          variant="destructive"
                          onClick={() => {
                            setDeletingId(null);
                            removeItem(item);
                          }}
                        >
                          Eliminar
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  <button
                    type="button"
                    className={item.pinned ? "lx-ghost on" : "lx-ghost"}
                    aria-label={
                      item.pinned
                        ? `Desfijar ${item.title}`
                        : `Fijar ${item.title}`
                    }
                    aria-pressed={item.pinned}
                    title={item.pinned ? "Desfijar" : "Fijar"}
                    onClick={() =>
                      setItems((current) =>
                        current.map((entry) =>
                          entry.id === item.id
                            ? { ...entry, pinned: !entry.pinned }
                            : entry,
                        ),
                      )
                    }
                  >
                    <Pin />
                  </button>
                </span>
              </div>
            );
          })}
          {loaded && visible.length === 0 && jobs.length === 0 && (
            <p className="lx-empty">
              {items.length === 0
                ? "Aún no hay media."
                : `Nada coincide con “${query.trim()}”.`}
            </p>
          )}
        </div>
      </aside>

      <main className="lx-work">
        {selected ? (
          <>
            <div className="lx-ws-head">
              <div className="lx-ws-heading">
                <div className="lx-ws-title" title={selected.title}>
                  {selected.title}
                </div>
                <div className="lx-ws-sub">{describe(selected)}</div>
              </div>
              <div className="lx-ws-tools">
                {kind === "slides" && (
                  <>
                    <label className="lx-toggle">
                      <Switch
                        checked={projectOnClick}
                        onCheckedChange={onToggleProjectOnClick}
                        aria-label="Proyectar al hacer clic"
                      />
                      <span>Proyectar al clic</span>
                    </label>
                    <FitToggle
                      label="Diapositivas"
                      testId="slide-fit"
                      value={slideFit}
                      onChange={onSlideFit}
                    />
                  </>
                )}
                {kind === "video" && (
                  <FitToggle
                    label="Video"
                    testId="slide-fit"
                    value={slideFit}
                    onChange={onSlideFit}
                  />
                )}
              </div>
            </div>

            {kind === "slides" && staged && (
              <div className="lx-slides" ref={gridRef}>
                {staged.images.map((image, index) => {
                  const isLive = liveImage != null && image === liveImage;
                  return (
                    <button
                      key={index}
                      type="button"
                      className={`lx-card${index === staged.index ? " sel" : ""}${isLive ? " live" : ""}`}
                      data-current={index === staged.index ? "" : undefined}
                      aria-label={slideLabel(index)}
                      data-testid={`slide-part-${index}`}
                      draggable={staged.images.length > 1}
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData(
                          "text/plain",
                          `${staged.deckId}:${index}`,
                        );
                        slideDragRef.current = { deckId: staged.deckId, index };
                        setSlideDragging(true);
                      }}
                      onDragEnd={endSlideDrag}
                      onClick={() => onSelectSlide(index)}
                      onDoubleClick={() => onTakeSlide(index)}
                    >
                      <span className="lx-tile lx-tile-image">
                        <img
                          src={backgroundImageUrl(image)}
                          alt=""
                          loading="lazy"
                          decoding="async"
                        />
                      </span>
                      <span className="lx-tag-live">En vivo</span>
                      <span className="lx-card-foot">
                        <span className="num">{index + 1}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {kind === "video" && selected.file && (
              <div className="lx-player">
                {/* A private look at the file: silent here, the sound plays on the projector. */}
                <video
                  key={selected.file}
                  className="lx-player-video"
                  src={backgroundImageUrl(selected.file)}
                  controls
                  muted
                  playsInline
                  preload="metadata"
                  data-testid="media-video"
                />
                <div className="lx-player-bar">
                  <button
                    type="button"
                    className="lx-btn pri"
                    data-testid="btn-play-media"
                    onClick={onTake}
                  >
                    <Play />{" "}
                    {videoLive ? "Reiniciar en pantalla" : "Proyectar video"}
                  </button>
                  <span className="lx-note">
                    {videoLive
                      ? "Este video está en pantalla. Contrólalo debajo del monitor En vivo."
                      : "Aquí lo revisas sin sonido. Al proyectarlo se reproduce en pantalla con su audio."}
                  </span>
                </div>
              </div>
            )}

            {kind === "audio" && selected.file && (
              <div className="lx-player lx-player-audio">
                <span
                  className={`lx-audio-art${audioLoaded && audioPlaying ? " playing" : ""}`}
                >
                  <AudioIcon />
                </span>
                <div className="lx-player-bar">
                  <button
                    type="button"
                    className="lx-btn pri"
                    data-testid="btn-play-media"
                    onClick={onTake}
                  >
                    <Play />{" "}
                    {audioLoaded ? "Reproducir desde el inicio" : "Reproducir"}
                  </button>
                  <span className="lx-note">
                    {audioLoaded
                      ? "Sonando en el reproductor de la derecha. Sigue al cambiar de espacio."
                      : "Suena en esta computadora y sigue mientras proyectas versículos o canciones."}
                  </span>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="lx-empty-ws">
            <p>
              {items.length === 0
                ? "Importa presentaciones, imágenes, videos o audio. Se copian a la aplicación para usarlos sin el archivo original."
                : "Elige un elemento de la biblioteca."}
            </p>
            <button
              type="button"
              className="lx-btn pri"
              disabled={importing}
              onClick={() => void importMedia()}
            >
              {importing ? <Spinner /> : <Upload />} Importar media
            </button>
            <p className="lx-fine">
              PowerPoint (.pptx), PDF, imágenes, video (mp4, mov, webm) y audio
              (mp3, wav, m4a). Keynote, .ppt y .odp: exporta antes a PDF o PPTX.
            </p>
          </div>
        )}
      </main>
    </>
  );
}
