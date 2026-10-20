import { useEffect, useMemo, useRef, useState } from "react";
import { Pencil, Pin, Plus } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import type { StoredText } from "@shared/types";
import { textSlides } from "@shared/text-slides";
import { SearchIcon, TextIcon } from "./icons";
import { ItemMenu } from "./ItemMenu";
import { SlideTile } from "./SlideTile";
import { TextDialog, type TextDraft } from "./TextDialog";
import type { SongSelection, SongStage } from "./SongsWorkspace";

export type Text = StoredText;

interface Props {
  /** Staged text, in the same shape as a staged song (its slides have no labels). */
  staged: SongStage | null;
  selectedId: string | null;
  /** Text on the projector right now, when it is a text block. */
  liveText?: string | null;
  /** Position of that block in the staged text, when it was projected from it. */
  liveIndex?: number | null;
  projectOnClick: boolean;
  onToggleProjectOnClick: (value: boolean) => void;
  onSelectText: (textId: string | null, selection: SongSelection | null) => void;
  onSelectPart: (index: number) => void;
  /** Double-click: stage the block and project it. */
  onTakePart: (index: number) => void;
}

function id() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** The staged selection for a text: its slides, clamped to a valid index. */
function stageOf(text: Text, index = 0): SongSelection {
  const slides = textSlides(text.body);
  return {
    title: text.title,
    slides,
    labels: slides.map(() => ""),
    index: Math.min(Math.max(index, 0), Math.max(slides.length - 1, 0)),
  };
}

const normalize = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");

export function TextsWorkspace({ staged, selectedId, liveText, liveIndex, projectOnClick, onToggleProjectOnClick, onSelectText, onSelectPart, onTakePart }: Props) {
  const [texts, setTexts] = useState<Text[]>([]);
  const [textsLoaded, setTextsLoaded] = useState(false);
  const [query, setQuery] = useState("");
  // null = closed, "new" = creating, otherwise the id of the text being edited.
  const [editing, setEditing] = useState<string | null>(null);
  // The text whose delete confirmation is open from its row.
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const api = window.proyector;
    if (!api) {
      setTextsLoaded(true);
      return () => { cancelled = true; };
    }
    void api.getTexts().then((saved) => {
      if (cancelled) return;
      setTexts(Array.isArray(saved) ? saved : []);
      setTextsLoaded(true);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (textsLoaded) void window.proyector?.setTexts(texts);
  }, [texts, textsLoaded]);

  const visibleTexts = useMemo(() => {
    const q = normalize(query.trim());
    return texts
      .filter((text) => !q || normalize(text.title).includes(q))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned));
  }, [texts, query]);

  const selectedText = useMemo(() => texts.find((text) => text.id === selectedId) ?? null, [texts, selectedId]);
  const editingText = editing && editing !== "new" ? texts.find((text) => text.id === editing) ?? null : null;
  // Until the library has loaded, the staged text is what the operator sees.
  const shown: string[] = selectedText ? textSlides(selectedText.body) : (staged?.slides ?? []);
  const slide = staged?.index ?? 0;
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    gridRef.current?.querySelector("[data-current]")?.scrollIntoView({ block: "nearest" });
  }, [slide, staged?.title]);

  const togglePin = (textId: string) => {
    setTexts((current) => current.map((text) => (text.id === textId ? { ...text, pinned: !text.pinned } : text)));
  };

  const save = (draft: TextDraft) => {
    const stored = editingText;
    const base: Text = stored ?? { id: id(), title: "", body: "", updatedAt: 0, pinned: false };
    const next: Text = { ...base, title: draft.title, body: draft.body, updatedAt: Date.now() };
    setTexts((current) => (stored ? current.map((text) => (text.id === next.id ? next : text)) : [next, ...current]));
    setEditing(null);
    setQuery("");
    // A new text opens straight away; an edited one keeps the block that was staged.
    if (!stored) onSelectText(next.id, stageOf(next));
    else if (next.id === selectedId) onSelectText(next.id, stageOf(next, staged?.index ?? 0));
  };

  const removeText = (text: Text) => {
    setTexts((current) => current.filter((entry) => entry.id !== text.id));
    setEditing(null);
    if (text.id === selectedId) onSelectText(null, null);
  };

  const title = selectedText?.title ?? staged?.title ?? "";

  return (
    <>
      <aside className="lx-lib">
        <div className="lx-lib-head">
          <span className="lx-h">Textos</span>
          <button type="button" className="lx-icon-btn" aria-label="Nuevo texto" title="Nuevo texto" data-testid="btn-new-text" onClick={() => setEditing("new")}>
            <Plus />
          </button>
        </div>
        <label className="lx-search">
          <SearchIcon />
          <input
            data-search
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && visibleTexts[0]) onSelectText(visibleTexts[0].id, stageOf(visibleTexts[0]));
              else if (event.key === "Escape") {
                setQuery("");
                event.currentTarget.blur();
              }
            }}
            placeholder="Buscar texto…"
            aria-label="Buscar texto"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <div className="lx-lib-scroll">
          {visibleTexts.map((text) => (
            <div key={text.id} className={`lx-item${text.id === selectedId ? " on" : ""}`}>
              <button type="button" className="lx-item-main" aria-label={`Seleccionar ${text.title}`} onClick={() => onSelectText(text.id, stageOf(text))} onDoubleClick={() => setEditing(text.id)}>
                <span className="lx-ico"><TextIcon /></span>
                <span className="lx-item-text">
                  <span className="t">{text.title}</span>
                  <span className="s">{`${textSlides(text.body).length} diapositivas`}</span>
                </span>
              </button>
              <span className={`lx-item-actions${text.pinned ? " keep" : ""}`}>
                <ItemMenu
                  label={text.title}
                  testId={`btn-menu-text-${text.id}`}
                  editLabel="Editar"
                  onEdit={() => setEditing(text.id)}
                  onDelete={() => setDeletingId(text.id)}
                />
                <AlertDialog open={deletingId === text.id} onOpenChange={(open) => setDeletingId(open ? text.id : null)}>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Eliminar texto</AlertDialogTitle>
                      <AlertDialogDescription>¿Eliminar “{text.title}”? Esta acción no se puede deshacer.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction variant="destructive" data-testid={`confirm-delete-text-${text.id}`} onClick={() => { setDeletingId(null); removeText(text); }}>Eliminar</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <button type="button" className={text.pinned ? "lx-ghost on" : "lx-ghost"} aria-label={text.pinned ? "Desfijar texto" : "Fijar texto"} aria-pressed={text.pinned} title={text.pinned ? "Desfijar" : "Fijar"} data-testid={`btn-pin-text-${text.id}`} onClick={() => togglePin(text.id)}>
                  <Pin />
                </button>
              </span>
            </div>
          ))}
          {textsLoaded && visibleTexts.length === 0 && (
            <p className="lx-empty">{texts.length === 0 ? "Aún no hay textos." : `Ningún texto coincide con “${query.trim()}”.`}</p>
          )}
        </div>
      </aside>

      <main className="lx-work">
        {title ? (
          <>
            <div className="lx-ws-head">
              <div className="lx-ws-heading">
                <div className="lx-ws-title" title={title}>{title}</div>
                <div className="lx-ws-sub">
                  {`${shown.length} ${shown.length === 1 ? "diapositiva" : "diapositivas"}`}
                </div>
              </div>
              <div className="lx-ws-tools">
                <label className="lx-toggle">
                  <Switch checked={projectOnClick} onCheckedChange={onToggleProjectOnClick} aria-label="Proyectar al hacer clic" />
                  <span>Proyectar al clic</span>
                </label>
                {selectedText && (
                  <button type="button" className="lx-btn" onClick={() => setEditing(selectedText.id)}>
                    <Pencil /> Editar
                  </button>
                )}
              </div>
            </div>

            {shown.length > 0 ? (
              <div className="lx-slides" ref={gridRef}>
                {shown.map((text, index) => {
                  const isLive = liveText != null && text === liveText && (liveIndex == null || liveIndex === index);
                  return (
                    <button
                      key={`${index}-${text}`}
                      type="button"
                      className={`lx-card${index === slide ? " sel" : ""}${isLive ? " live" : ""}`}
                      data-current={index === slide ? "" : undefined}
                      onClick={() => onSelectPart(index)}
                      onDoubleClick={() => onTakePart(index)}
                    >
                      <SlideTile text={text} variant="song" />
                      <span className="lx-tag-live">En vivo</span>
                      <span className="lx-card-foot">
                        <span className="num">{index + 1}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="lx-empty-ws">Este texto está vacío. Edítalo para escribir su contenido.</p>
            )}
          </>
        ) : (
          <div className="lx-empty-ws">
            <p>{texts.length === 0 ? "Escribe tu primer texto para proyectarlo." : "Elige un texto de la biblioteca."}</p>
            <button type="button" className="lx-btn pri" onClick={() => setEditing("new")}>
              <Plus /> Nuevo texto
            </button>
          </div>
        )}
      </main>

      <TextDialog open={editing !== null} text={editingText} onOpenChange={(open) => !open && setEditing(null)} onSave={save} onDelete={() => { if (editingText) removeText(editingText); }} />
    </>
  );
}
