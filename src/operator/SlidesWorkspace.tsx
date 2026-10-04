import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Pin, Trash2, Upload } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { backgroundImageUrl } from "@shared/background-image";
import { slideLabel } from "@shared/slide-deck";
import type { PendingSlideImport, StoredSlideDeck } from "@shared/types";
import { rasterizePdfToPngs } from "./pdfConvert";

const IMPORT_ERRORS: Record<string, string> = {
  "unsupported-format":
    "Ese formato no se puede mostrar como imágenes. Exporta la presentación como PDF o PowerPoint (.pptx) e impórtala de nuevo.",
  "invalid-pptx": "No se pudo abrir el archivo PowerPoint. Puede estar dañado o protegido con contraseña.",
  "empty-presentation": "La presentación no tiene diapositivas.",
  "read-failed": "No se pudo leer ese archivo.",
};

export interface SlideStage {
  deckId: string;
  title: string;
  images: string[];
  index: number;
}
interface Props {
  staged: SlideStage | null;
  selectedId: string | null;
  projectOnClick: boolean;
  onToggleProjectOnClick: (value: boolean) => void;
  onSelectDeck: (id: string, title: string, images: string[]) => void;
  onSelectSlide: (index: number) => void;
  onClearSelection?: () => void;
}

/** A presentation being converted to images (kept in memory only; never persisted as a deck). */
interface Job {
  pending: PendingSlideImport;
  status: "running" | "failed";
  done: number;
  total: number;
  error?: string;
}

export function SlidesWorkspace({ staged, selectedId, projectOnClick, onToggleProjectOnClick, onSelectDeck, onSelectSlide, onClearSelection }: Props) {
  const [decks, setDecks] = useState<StoredSlideDeck[]>([]);
  const [decksLoaded, setDecksLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const mounted = useRef(true);
  const onSelectDeckRef = useRef(onSelectDeck);
  useEffect(() => { onSelectDeckRef.current = onSelectDeck; }, [onSelectDeck]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    let cancelled = false;
    const api = window.proyector;
    if (!api) {
      setDecksLoaded(true);
      return () => { cancelled = true; };
    }
    void api.getSlideDecks().then((saved) => {
      if (cancelled) return;
      setDecks(Array.isArray(saved) ? saved : []);
      setDecksLoaded(true);
    }).catch(() => {
      if (!cancelled) setDecksLoaded(true);
    });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (decksLoaded) void window.proyector?.setSlideDecks(decks);
  }, [decks, decksLoaded]);
  useEffect(() => {
    const unsubscribe = window.proyector?.onSlideProgress?.((progress) => {
      if (!mounted.current) return;
      setJobs((current) => current.map((job) => (job.pending.id === progress.deckId && job.status === "running" ? { ...job, done: progress.done, total: progress.total } : job)));
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
      if (mounted.current) setJobs((current) => current.map((job) => (job.pending.id === id ? { ...job, ...patch } : job)));
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
        if (!saved || saved.length !== pngBase64.length) throw new Error("No se pudieron guardar las imágenes.");
        images = saved;
      } else {
        const result = await api.convertPptx({ deckId: id, file: pending.source.file, total: pending.total });
        if (!result.ok) throw new Error(result.error);
        images = result.images;
      }
      const deck: StoredSlideDeck = { id, title: pending.title, images, updatedAt: Date.now(), pinned: false };
      void api.discardSlideSource(pending.source.file);
      if (mounted.current) {
        setDecks((current) => [deck, ...current]);
        setJobs((current) => current.filter((job) => job.pending.id !== id));
        onSelectDeckRef.current(deck.id, deck.title, deck.images);
      } else {
        // The user left the tab meanwhile: still persist the finished deck.
        const saved = await api.getSlideDecks();
        await api.setSlideDecks([deck, ...(Array.isArray(saved) ? saved : [])]);
      }
    } catch (error) {
      console.error(`[slides] conversion of "${pending.title}" failed`, error);
      setJob({ status: "failed", error: error instanceof Error && error.message ? error.message : "Error desconocido." });
    }
  }, []);

  const [importing, setImporting] = useState(false);
  const importDeck = async () => {
    setImportError(null);
    setImporting(true);
    try {
      const result = await window.proyector?.importSlideDeck();
      if (!result) return;
      if (result.kind === "error") {
        setImportError(IMPORT_ERRORS[result.error] ?? IMPORT_ERRORS["read-failed"]!);
        return;
      }
      if (result.kind === "ready") {
        setDecks((current) => [result.deck, ...current]);
        onSelectDeck(result.deck.id, result.deck.title, result.deck.images);
        return;
      }
      const pending = result.pending;
      setJobs((current) => [...current, { pending, status: "running", done: 0, total: pending.total }]);
      void runConversion(pending);
    } catch (error) {
      console.error("[slides] import failed", error);
      setImportError(IMPORT_ERRORS["read-failed"]!);
    } finally {
      setImporting(false);
    }
  };
  const dismissJob = (job: Job) => {
    void window.proyector?.discardSlideSource(job.pending.source.file);
    setJobs((current) => current.filter((item) => item.pending.id !== job.pending.id));
  };
  const visible = useMemo(() => decks.filter((deck) => deck.title.toLowerCase().includes(query.toLowerCase())).sort((a, b) => Number(b.pinned) - Number(a.pinned)), [decks, query]);
  const removeDeck = (id: string) => {
    setDecks((current) => current.filter((deck) => deck.id !== id));
    if (id === selectedId) onClearSelection?.();
  };
  return <div className="songs-side-panels slides-mode-panels">
    <aside className="songs-left songs-parts">
      <p className="eyebrow">Diapositivas</p><h2>{staged?.title || "Presentación seleccionada"}</h2>
      <label className="song-project-toggle"><Switch checked={projectOnClick} onCheckedChange={onToggleProjectOnClick} aria-label="Proyectar al hacer clic" /><span>Proyectar al hacer clic</span></label>
      {staged?.images.length ? <ol className="song-parts-list">{staged.images.map((image, index) => (
        <li key={index}><Button type="button" variant="ghost" className={index === staged.index ? "song-part selected" : "song-part"} data-testid={`slide-part-${index}`} onClick={() => onSelectSlide(index)}><img src={backgroundImageUrl(image)} alt="" className="song-part-thumb" loading="lazy" decoding="async" /><span className="song-part-number">{index + 1}</span><span className="song-part-text">{slideLabel(index)}</span></Button></li>
      ))}</ol> : <p className="muted">Importa una presentación en el panel derecho.</p>}
    </aside>
    <aside className="song-presenter songs-library-panel"><div className="slides-library-head"><div><p className="eyebrow">Biblioteca</p><h2>Diapositivas</h2></div><Button type="button" className="primary" onClick={() => void importDeck()}><Upload /> Importar</Button></div>
      <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar presentación" aria-label="Buscar presentación" />
      <p className="muted" style={{ fontSize: "0.75rem", marginTop: "0.5rem" }}>PowerPoint (.pptx), PDF o imágenes. Keynote, .ppt y .odp: exporta antes a PDF o PPTX.</p>
      {importing && <p className="muted" role="status" style={{ marginTop: "0.5rem" }}>Leyendo archivo…</p>}
      {jobs.map((job) => job.status === "running"
        ? <p key={job.pending.id} className="muted" role="status" data-testid="slides-converting" style={{ marginTop: "0.5rem" }}>Generando imágenes de “{job.pending.title}”… {job.done}{job.total > 0 ? `/${job.total}` : ""}</p>
        : <div key={job.pending.id} role="alert" data-testid="slides-error" style={{ marginTop: "0.5rem" }}>
          <p className="muted">No se pudo convertir “{job.pending.title}” a imágenes ({job.error}).</p>
          <div className="stage-background-row" style={{ marginTop: "0.4rem" }}>
            <Button type="button" size="sm" data-testid="slides-retry" onClick={() => void runConversion(job.pending)}>Reintentar</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => dismissJob(job)}>Descartar</Button>
          </div>
        </div>)}
      {importError && <p className="muted" role="alert" data-testid="slides-import-error" style={{ marginTop: "0.5rem" }}>{importError}</p>}
      {visible.length === 0 ? (
        decks.length === 0 ? (
          jobs.length === 0 ? <div className="song-empty"><p className="muted">Lista vacía</p><Button type="button" className="primary" onClick={() => void importDeck()}>Importar presentación</Button></div> : null
        ) : (
          <p className="muted">Sin resultados para “{query}”.</p>
        )
      ) : <ul className="song-list">{visible.map((deck) => <li key={deck.id} className={deck.id === selectedId ? "song-row selected" : "song-row"}><Button type="button" variant="ghost" className="song-row-main" aria-label={`Seleccionar ${deck.title}`} onClick={() => onSelectDeck(deck.id, deck.title, deck.images)}><span>{deck.title}</span><small>{deck.images.length} diapositivas</small></Button><div className="song-row-actions"><Button type="button" size="icon-sm" variant="ghost" aria-label={deck.pinned ? "Desfijar presentación" : "Fijar presentación"} aria-pressed={deck.pinned} className={deck.pinned ? "song-icon-btn pinned" : "song-icon-btn"} onClick={() => setDecks((current) => current.map((item) => item.id === deck.id ? { ...item, pinned: !item.pinned } : item))}><Pin /></Button><AlertDialog><AlertDialogTrigger render={<Button type="button" size="icon-sm" variant="ghost" aria-label={`Eliminar ${deck.title}`} className="song-icon-btn"><Trash2 /></Button>} /><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Eliminar presentación</AlertDialogTitle><AlertDialogDescription>¿Eliminar “{deck.title}”? Esta acción no se puede deshacer.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => removeDeck(deck.id)}>Eliminar</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div></li>)}</ul>}
    </aside>
  </div>;
}
