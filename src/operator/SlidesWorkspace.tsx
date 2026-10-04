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
import { isPdfPath, reconcileSlides } from "@shared/slide-deck";
import type { StoredSlideDeck } from "@shared/types";
import { rasterizePdfToPngs } from "./pdfConvert";

const IMPORT_ERRORS: Record<string, string> = {
  "unsupported-format":
    "Ese formato no se puede mostrar como imágenes. Exporta la presentación como PDF o PowerPoint (.pptx) e impórtala de nuevo.",
  "invalid-pptx": "No se pudo abrir el archivo PowerPoint. Puede estar dañado o protegido con contraseña.",
  "empty-presentation": "La presentación no tiene diapositivas.",
  "read-failed": "No se pudo leer ese archivo.",
};

function normalizeDeck(deck: StoredSlideDeck): StoredSlideDeck {
  const images = Array.isArray(deck.images) ? deck.images : [];
  return {
    ...deck,
    images: deck.slides.map((_, i) => (typeof images[i] === "string" && (images[i] as string).length > 0 ? (images[i] as string) : null)),
  };
}

export interface SlideStage {
  deckId: string;
  title: string;
  slides: string[];
  images: Array<string | null>;
  index: number;
}
interface Props {
  staged: SlideStage | null;
  selectedId: string | null;
  projectOnClick: boolean;
  onToggleProjectOnClick: (value: boolean) => void;
  onSelectDeck: (id: string, title: string, slides: string[], images?: Array<string | null>) => void;
  onSelectSlide: (index: number) => void;
  onClearSelection?: () => void;
  onImagesReady?: (id: string, slides: string[], images: string[]) => void;
}

export function SlidesWorkspace({ staged, selectedId, projectOnClick, onToggleProjectOnClick, onSelectDeck, onSelectSlide, onClearSelection, onImagesReady }: Props) {
  const [decks, setDecks] = useState<StoredSlideDeck[]>([]);
  const [decksLoaded, setDecksLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [converting, setConverting] = useState<{ id: string; done: number; total: number } | null>(null);
  const convertingRef = useRef<Set<string>>(new Set());
  const attemptedRef = useRef<Set<string>>(new Set());
  const [failedDeckIds, setFailedDeckIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    let cancelled = false;
    const api = window.proyector;
    if (!api) {
      setDecks([]);
      setDecksLoaded(true);
      return () => { cancelled = true; };
    }
    void api.getSlideDecks().then((saved) => {
      if (cancelled) return;
      setDecks(Array.isArray(saved) ? saved.map(normalizeDeck) : []);
      setDecksLoaded(true);
    }).catch(() => {
      if (!cancelled) setDecksLoaded(true);
    });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (decksLoaded) void window.proyector?.setSlideDecks(decks);
  }, [decks, decksLoaded]);
  // Silent screenshot conversion: presentation decks arrive with a managed
  // source file. .pptx is rendered in the main process (pptx-glimpse with the
  // system fonts, off the UI thread); .pdf is rasterized here with pdf.js.
  // Files never leave the machine; the PNGs become the slide images.
  // NOTE: no cleanup-based cancellation on purpose. This effect re-runs on
  // every deck/selection change and cancelling in-flight work there silently
  // dropped the result (and the deck was never retried). The work always
  // finishes; `mounted` only guards React state updates.
  const onImagesReadyRef = useRef(onImagesReady);
  useEffect(() => { onImagesReadyRef.current = onImagesReady; }, [onImagesReady]);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    const unsubscribe = window.proyector?.onSlideProgress?.((progress) => {
      if (mounted.current) setConverting((current) => (current?.id === progress.deckId ? { ...current, done: progress.done, total: progress.total } : current));
    });
    return () => unsubscribe?.();
  }, []);
  const [retryTick, setRetryTick] = useState(0);
  const convertDeck = useCallback(async (target: StoredSlideDeck) => {
    const source = target.source;
    if (!source) return;
    const deckId = target.id;
    const isPdf = source.kind === "pdf" || isPdfPath(source.file);
    const api = window.proyector;
    if (!api) return;
    if (mounted.current) setConverting({ id: deckId, done: 0, total: Math.max(target.slides.length, 1) });
    try {
      let images: string[];
      if (isPdf) {
        const base64 = await api.readSlideSource(source.file);
        if (!base64) throw new Error("No se pudo leer el PDF guardado.");
        const { pngBase64 } = await rasterizePdfToPngs(base64, {
          targetWidth: 1920,
          onProgress: (done, total) => {
            if (mounted.current) setConverting({ id: deckId, done, total });
          },
        });
        const saved = await api.saveSlidePngs(pngBase64);
        if (!saved || saved.length !== pngBase64.length) throw new Error("No se pudieron guardar las imágenes.");
        images = saved;
      } else {
        const result = await api.convertPptx({ deckId, file: source.file, total: target.slides.length });
        if (!result.ok) throw new Error(result.error);
        images = result.images;
      }
      // Page count wins: keep each slide's text when present, label the rest.
      const slides = reconcileSlides(target.slides, images.length);
      if (mounted.current) {
        setDecks((current) => current.map((deck) => (deck.id === deckId ? { ...deck, slides, images } : deck)));
      }
      onImagesReadyRef.current?.(deckId, slides, images);
      if (mounted.current) setImportError(null);
    } catch (error) {
      console.error(`[slides] conversion of "${target.title}" failed`, error);
      const detail = error instanceof Error && error.message ? ` (${error.message})` : "";
      if (mounted.current) {
        setFailedDeckIds((current) => new Set(current).add(deckId));
        setImportError(`No se pudo convertir “${target.title}” a imágenes${detail}. Se muestra solo el texto.`);
      }
    } finally {
      if (mounted.current) setConverting((current) => (current?.id === deckId ? null : current));
    }
  }, []);
  useEffect(() => {
    if (!decksLoaded) return;
    // One conversion at a time, oldest pending first.
    if (convertingRef.current.size > 0) return;
    const target = decks.find(
      (deck) => deck.source != null && deck.images.every((image) => image === null) && !attemptedRef.current.has(deck.id),
    );
    if (!target) return;
    attemptedRef.current.add(target.id);
    convertingRef.current.add(target.id);
    void convertDeck(target).finally(() => {
      convertingRef.current.delete(target.id);
      // Wake the effect so the next pending deck starts.
      if (mounted.current) setRetryTick((tick) => tick + 1);
    });
  }, [decks, decksLoaded, convertDeck, retryTick]);
  const retryConversion = (deckId: string) => {
    attemptedRef.current.delete(deckId);
    setFailedDeckIds((current) => {
      const next = new Set(current);
      next.delete(deckId);
      return next;
    });
    setImportError(null);
    setRetryTick((tick) => tick + 1);
  };
  const visible = useMemo(() => decks.filter((deck) => deck.title.toLowerCase().includes(query.toLowerCase())).sort((a, b) => Number(b.pinned) - Number(a.pinned)), [decks, query]);
  const [importing, setImporting] = useState(false);
  const importDeck = async () => {
    setImportError(null);
    setImporting(true);
    try {
      const result = await window.proyector?.importSlideDeck();
      if (!result) return;
      if ("error" in result) {
        setImportError(IMPORT_ERRORS[result.error] ?? IMPORT_ERRORS["read-failed"]!);
        return;
      }
      const deck = normalizeDeck(result);
      setDecks((current) => [deck, ...current]);
      onSelectDeck(deck.id, deck.title, deck.slides, deck.images);
    } catch (error) {
      console.error("[slides] import failed", error);
      setImportError(IMPORT_ERRORS["read-failed"]!);
    } finally {
      setImporting(false);
    }
  };
  const removeDeck = (id: string) => {
    setDecks((current) => current.filter((deck) => deck.id !== id));
    if (id === selectedId) onClearSelection?.();
  };
  return <div className="songs-side-panels slides-mode-panels">
    <aside className="songs-left songs-parts">
      <p className="eyebrow">Diapositivas</p><h2>{staged?.title || "Presentación seleccionada"}</h2>
      <label className="song-project-toggle"><Switch checked={projectOnClick} onCheckedChange={onToggleProjectOnClick} aria-label="Proyectar al hacer clic" /><span>Proyectar al hacer clic</span></label>
      {staged?.slides.length ? <ol className="song-parts-list">{staged.slides.map((text, index) => {
        const image = staged.images[index] ?? null;
        return <li key={index}><Button type="button" variant="ghost" className={index === staged.index ? "song-part selected" : "song-part"} data-testid={`slide-part-${index}`} onClick={() => onSelectSlide(index)}>{image && <img src={backgroundImageUrl(image)} alt="" className="song-part-thumb" loading="lazy" decoding="async" />}<span className="song-part-number">{index + 1}</span><span className="song-part-text">{text}</span></Button></li>;
      })}</ol> : <p className="muted">Importa una presentación en el panel derecho.</p>}
    </aside>
    <aside className="song-presenter songs-library-panel"><div className="slides-library-head"><div><p className="eyebrow">Biblioteca</p><h2>Diapositivas</h2></div><Button type="button" className="primary" onClick={() => void importDeck()}><Upload /> Importar</Button></div>
      <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar presentación" aria-label="Buscar presentación" />
      <p className="muted" style={{ fontSize: "0.75rem", marginTop: "0.5rem" }}>PowerPoint (.pptx), PDF, imágenes, TXT, MD o JSON. Keynote, .ppt y .odp: exporta antes a PDF o PPTX.</p>
      {importing && <p className="muted" role="status" style={{ marginTop: "0.5rem" }}>Leyendo archivo…</p>}
      {converting && <p className="muted" role="status" style={{ marginTop: "0.5rem" }}>Generando imágenes… {converting.done}/{converting.total}</p>}
      {importError && <p className="muted" role="alert" data-testid="slides-error" style={{ marginTop: "0.5rem" }}>{importError}</p>}
      {failedDeckIds.size > 0 && <Button type="button" size="sm" data-testid="slides-retry" onClick={() => failedDeckIds.forEach(retryConversion)}>Reintentar conversión</Button>}
      {visible.length === 0 ? (
        decks.length === 0 ? (
          <div className="song-empty"><p className="muted">Lista vacía</p><Button type="button" className="primary" onClick={() => void importDeck()}>Importar presentación</Button></div>
        ) : (
          <p className="muted">Sin resultados para “{query}”.</p>
        )
      ) : <ul className="song-list">{visible.map((deck) => <li key={deck.id} className={deck.id === selectedId ? "song-row selected" : "song-row"}><Button type="button" variant="ghost" className="song-row-main" aria-label={`Seleccionar ${deck.title}`} onClick={() => onSelectDeck(deck.id, deck.title, deck.slides, deck.images)}><span>{deck.title}</span><small>{deck.slides.length} diapositivas</small></Button><div className="song-row-actions"><Button type="button" size="icon-sm" variant="ghost" aria-label={deck.pinned ? "Desfijar presentación" : "Fijar presentación"} aria-pressed={deck.pinned} className={deck.pinned ? "song-icon-btn pinned" : "song-icon-btn"} onClick={() => setDecks((current) => current.map((item) => item.id === deck.id ? { ...item, pinned: !item.pinned } : item))}><Pin /></Button><AlertDialog><AlertDialogTrigger render={<Button type="button" size="icon-sm" variant="ghost" aria-label={`Eliminar ${deck.title}`} className="song-icon-btn"><Trash2 /></Button>} /><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Eliminar presentación</AlertDialogTitle><AlertDialogDescription>¿Eliminar “{deck.title}”? Esta acción no se puede deshacer.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => removeDeck(deck.id)}>Eliminar</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div></li>)}</ul>}
    </aside>
  </div>;
}
