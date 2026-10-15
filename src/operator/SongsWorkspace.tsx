import { useEffect, useMemo, useRef, useState } from "react";
import { Pencil, Pin, Plus, Trash2 } from "lucide-react";
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
import type { StoredSong } from "@shared/types";
import { songParts, type SongSection } from "@shared/song-sections";
import { SearchIcon, SongIcon } from "./icons";
import { SlideTile } from "./SlideTile";
import { SongDialog, type SongDraft } from "./SongDialog";

export type Song = StoredSong;

export interface SongStage {
  title: string;
  slides: string[];
  /** Label of each part ("Coro"), empty for unlabelled parts. */
  labels: string[];
  index: number;
}

/** What the workspace hands up when a song changes. */
export type SongSelection = Omit<SongStage, "index"> & { index?: number };

interface Props {
  staged: SongStage | null;
  selectedId: string | null;
  /** Text on the projector right now, when it is a song part. */
  liveText?: string | null;
  /** Position of that part in the staged song, when it was projected from it (a repeated chorus is live only once). */
  liveIndex?: number | null;
  projectOnClick: boolean;
  onToggleProjectOnClick: (value: boolean) => void;
  onSelectSong: (songId: string | null, selection: SongSelection | null) => void;
  onSelectPart: (index: number) => void;
  /** Double-click: stage the part and project it. */
  onTakePart: (index: number) => void;
}

function id() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** The staged selection for a song: its projected parts, clamped to a valid index. */
function stageOf(song: Song, index = 0): SongSelection {
  const parts = songParts(song.lyrics);
  return {
    title: song.title,
    slides: parts.map((part) => part.text),
    labels: parts.map((part) => part.label),
    index: Math.min(Math.max(index, 0), Math.max(parts.length - 1, 0)),
  };
}

const normalize = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");

export function SongsWorkspace({ staged, selectedId, liveText, liveIndex, projectOnClick, onToggleProjectOnClick, onSelectSong, onSelectPart, onTakePart }: Props) {
  const [songs, setSongs] = useState<Song[]>([]);
  const [songsLoaded, setSongsLoaded] = useState(false);
  const [query, setQuery] = useState("");
  // null = closed, "new" = creating, otherwise the id of the song being edited.
  const [editing, setEditing] = useState<string | null>(null);
  // The song whose delete confirmation is open from its row.
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const api = window.proyector;
    if (!api) {
      setSongsLoaded(true);
      return () => { cancelled = true; };
    }
    void api.getSongs().then((saved) => {
      if (cancelled) return;
      setSongs(Array.isArray(saved) ? saved : []);
      setSongsLoaded(true);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (songsLoaded) void window.proyector?.setSongs(songs);
  }, [songs, songsLoaded]);

  const visibleSongs = useMemo(() => {
    const q = normalize(query.trim());
    return songs
      .filter((song) => !q || normalize(`${song.title} ${song.author ?? ""}`).includes(q))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned));
  }, [songs, query]);

  const selectedSong = useMemo(() => songs.find((song) => song.id === selectedId) ?? null, [songs, selectedId]);
  const editingSong = editing && editing !== "new" ? songs.find((song) => song.id === editing) ?? null : null;
  const parts = useMemo<SongSection[]>(() => (selectedSong ? songParts(selectedSong.lyrics) : []), [selectedSong]);
  // Until the library has loaded, the staged song is what the operator sees.
  const shown: SongSection[] = selectedSong
    ? parts
    : (staged?.slides ?? []).map((text, i) => ({ key: `staged-${i}`, label: staged?.labels[i] ?? "", text }));
  const slide = staged?.index ?? 0;
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    gridRef.current?.querySelector("[data-current]")?.scrollIntoView({ block: "nearest" });
  }, [slide, staged?.title]);

  const togglePin = (songId: string) => {
    setSongs((current) => current.map((song) => (song.id === songId ? { ...song, pinned: !song.pinned } : song)));
  };

  const save = (draft: SongDraft) => {
    const stored = editingSong;
    const base: Song = stored ?? { id: id(), title: "", lyrics: "", updatedAt: 0, pinned: false };
    const next: Song = { ...base, title: draft.title, lyrics: draft.lyrics, updatedAt: Date.now() };
    if (draft.author) next.author = draft.author;
    else delete next.author;
    setSongs((current) => (stored ? current.map((song) => (song.id === next.id ? next : song)) : [next, ...current]));
    setEditing(null);
    setQuery("");
    // A new song opens straight away; an edited one keeps the part that was staged.
    if (!stored) onSelectSong(next.id, stageOf(next));
    else if (next.id === selectedId) onSelectSong(next.id, stageOf(next, staged?.index ?? 0));
  };

  const removeSong = (song: Song) => {
    setSongs((current) => current.filter((entry) => entry.id !== song.id));
    setEditing(null);
    if (song.id === selectedId) onSelectSong(null, null);
  };

  const title = selectedSong?.title ?? staged?.title ?? "";
  const author = selectedSong?.author ?? "";

  return (
    <>
      <aside className="lx-lib">
        <div className="lx-lib-head">
          <span className="lx-h">Canciones</span>
          <button type="button" className="lx-icon-btn" aria-label="Nueva canción" title="Nueva canción" data-testid="btn-new-song" onClick={() => setEditing("new")}>
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
              if (event.key === "Enter" && visibleSongs[0]) onSelectSong(visibleSongs[0].id, stageOf(visibleSongs[0]));
              else if (event.key === "Escape") {
                setQuery("");
                event.currentTarget.blur();
              }
            }}
            placeholder="Buscar canción o autor…"
            aria-label="Buscar canción"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <div className="lx-lib-scroll">
          {visibleSongs.map((song) => (
            <div key={song.id} className={`lx-item${song.id === selectedId ? " on" : ""}`}>
              <button type="button" className="lx-item-main" aria-label={`Seleccionar ${song.title}`} onClick={() => onSelectSong(song.id, stageOf(song))} onDoubleClick={() => setEditing(song.id)}>
                <span className="lx-ico"><SongIcon /></span>
                <span className="lx-item-text">
                  <span className="t">{song.title}</span>
                  <span className="s">{song.author || `${songParts(song.lyrics).length} partes`}</span>
                </span>
              </button>
              <span className={`lx-item-actions${song.pinned ? " keep" : ""}`}>
                <button type="button" className="lx-ghost" aria-label={`Eliminar ${song.title}`} title="Eliminar" data-testid={`btn-delete-song-${song.id}`} onClick={() => setDeletingId(song.id)}>
                  <Trash2 />
                </button>
                <AlertDialog open={deletingId === song.id} onOpenChange={(open) => setDeletingId(open ? song.id : null)}>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Eliminar canción</AlertDialogTitle>
                      <AlertDialogDescription>¿Eliminar “{song.title}”? Esta acción no se puede deshacer.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction variant="destructive" data-testid={`confirm-delete-song-${song.id}`} onClick={() => { setDeletingId(null); removeSong(song); }}>Eliminar</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <button type="button" className="lx-ghost" aria-label={`Editar ${song.title}`} title="Editar" data-testid={`btn-edit-song-${song.id}`} onClick={() => setEditing(song.id)}>
                  <Pencil />
                </button>
                <button type="button" className={song.pinned ? "lx-ghost on" : "lx-ghost"} aria-label={song.pinned ? "Desfijar canción" : "Fijar canción"} aria-pressed={song.pinned} title={song.pinned ? "Desfijar" : "Fijar"} data-testid={`btn-pin-song-${song.id}`} onClick={() => togglePin(song.id)}>
                  <Pin />
                </button>
              </span>
            </div>
          ))}
          {songsLoaded && visibleSongs.length === 0 && (
            <p className="lx-empty">{songs.length === 0 ? "Aún no hay canciones." : `Ninguna canción coincide con “${query.trim()}”.`}</p>
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
                  {[author, `${shown.length} ${shown.length === 1 ? "diapositiva" : "diapositivas"}`].filter(Boolean).join(" · ")}
                </div>
              </div>
              <div className="lx-ws-tools">
                <label className="lx-toggle">
                  <Switch checked={projectOnClick} onCheckedChange={onToggleProjectOnClick} aria-label="Proyectar al hacer clic" />
                  <span>Proyectar al clic</span>
                </label>
                {selectedSong && (
                  <button type="button" className="lx-btn" onClick={() => setEditing(selectedSong.id)}>
                    <Pencil /> Editar
                  </button>
                )}
              </div>
            </div>

            {shown.length > 0 ? (
              <div className="lx-slides" ref={gridRef}>
                {shown.map((part, index) => {
                  const isLive = liveText != null && part.text === liveText && (liveIndex == null || liveIndex === index);
                  return (
                    <button
                      key={`${index}-${part.key}`}
                      type="button"
                      className={`lx-card${index === slide ? " sel" : ""}${isLive ? " live" : ""}`}
                      data-current={index === slide ? "" : undefined}
                      onClick={() => onSelectPart(index)}
                      onDoubleClick={() => onTakePart(index)}
                    >
                      <SlideTile text={part.text} variant="song" />
                      <span className="lx-tag-live">En vivo</span>
                      <span className="lx-card-foot">
                        <span className="num">{index + 1}</span>
                        <span className="lab">{part.label || part.text.split("\n")[0]}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="lx-empty-ws">Esta canción no tiene letra. Edítala para añadir sus partes.</p>
            )}
          </>
        ) : (
          <div className="lx-empty-ws">
            <p>{songs.length === 0 ? "Crea tu primera canción para proyectar su letra." : "Elige una canción de la biblioteca."}</p>
            <button type="button" className="lx-btn pri" onClick={() => setEditing("new")}>
              <Plus /> Nueva canción
            </button>
          </div>
        )}
      </main>

      <SongDialog open={editing !== null} song={editingSong} onOpenChange={(open) => !open && setEditing(null)} onSave={save} onDelete={() => { if (editingSong) removeSong(editingSong); }} />
    </>
  );
}
