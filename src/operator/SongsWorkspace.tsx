import { useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent } from "react";
import { Pencil, Pin, Plus, RotateCcw, X } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import type { StoredSong } from "@shared/types";
import { parseSong, pruneArrangement, shortLabel, songParts, type SongSection } from "@shared/song-sections";
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

/** What the workspace hands up when a song (or its arrangement) changes. */
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

function withArrangement(song: Song, arrangement: string[] | undefined): Song {
  const next = { ...song };
  if (arrangement) next.arrangement = arrangement;
  else delete next.arrangement;
  return next;
}

/** The staged selection for a song: its projected parts, clamped to a valid index. */
function stageOf(song: Song, index = 0): SongSelection {
  const parts = songParts(song);
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
  const sections = useMemo<SongSection[]>(() => (selectedSong ? parseSong(selectedSong.lyrics).sections : []), [selectedSong]);
  const parts = useMemo<SongSection[]>(() => (selectedSong ? songParts(selectedSong) : []), [selectedSong]);
  // Until the library has loaded, the staged song is what the operator sees.
  const shown: SongSection[] = selectedSong
    ? parts
    : (staged?.slides ?? []).map((text, i) => ({ key: `staged-${i}`, label: staged?.labels[i] ?? "", text }));
  const slide = staged?.index ?? 0;
  const gridRef = useRef<HTMLDivElement>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  useEffect(() => {
    gridRef.current?.querySelector("[data-current]")?.scrollIntoView({ block: "nearest" });
  }, [slide, staged?.title]);

  const togglePin = (songId: string) => {
    setSongs((current) => current.map((song) => (song.id === songId ? { ...song, pinned: !song.pinned } : song)));
  };

  const save = (draft: SongDraft) => {
    const stored = editingSong;
    const base: Song = stored ?? { id: id(), title: "", lyrics: "", updatedAt: 0, pinned: false };
    // Keep the stored arrangement, minus parts the edited lyrics no longer have.
    const next = withArrangement(
      { ...base, title: draft.title, lyrics: draft.lyrics, updatedAt: Date.now() },
      pruneArrangement(draft.lyrics, stored?.arrangement),
    );
    if (draft.author) next.author = draft.author;
    else delete next.author;
    setSongs((current) => (stored ? current.map((song) => (song.id === next.id ? next : song)) : [next, ...current]));
    setEditing(null);
    setQuery("");
    // A new song opens straight away; an edited one keeps the part that was staged.
    if (!stored) onSelectSong(next.id, stageOf(next));
    else if (next.id === selectedId) onSelectSong(next.id, stageOf(next, staged?.index ?? 0));
  };

  const remove = () => {
    if (!editingSong) return;
    const deletedId = editingSong.id;
    setSongs((current) => current.filter((song) => song.id !== deletedId));
    setEditing(null);
    if (deletedId === selectedId) onSelectSong(null, null);
  };

  // Every arrangement change is stored on the song and re-staged, so the
  // projection follows the new order straight away. The selection stays on
  // the same part where it still exists.
  const commitArrangement = (song: Song, index: number, arrangement: string[] | undefined) => {
    const updated = withArrangement(song, arrangement);
    setSongs((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    onSelectSong(updated.id, stageOf(updated, index));
  };

  const moveSongPart = (from: number, to: number) => {
    if (!selectedSong || from === to || from < 0 || to < 0 || from >= parts.length || to >= parts.length) return;
    const keys = parts.map((part) => part.key);
    const [moved] = keys.splice(from, 1);
    if (moved === undefined) return;
    keys.splice(to, 0, moved);
    let index = slide;
    if (slide === from) index = to;
    else if (from < slide && slide <= to) index = slide - 1;
    else if (to <= slide && slide < from) index = slide + 1;
    commitArrangement(selectedSong, index, keys);
  };

  const removeSongPart = (at: number) => {
    if (!selectedSong || at < 0 || at >= parts.length) return;
    const keys = parts.map((part) => part.key).filter((_, i) => i !== at);
    commitArrangement(selectedSong, at < slide ? slide - 1 : slide, keys);
  };

  const addSongPart = (section: SongSection) => {
    if (!selectedSong) return;
    commitArrangement(selectedSong, slide, [...parts.map((part) => part.key), section.key]);
  };

  const dropPart = (event: DragEvent<HTMLElement>, index: number) => {
    event.preventDefault();
    if (dragFrom !== null) moveSongPart(dragFrom, index);
    setDragFrom(null);
    setDragOver(null);
  };

  const sectionBadge = (section: SongSection) =>
    section.label ? shortLabel(section.label) : `T${sections.findIndex((s) => s.key === section.key) + 1}`;

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
                  <span className="s">{song.author || `${songParts(song).length} partes`}</span>
                </span>
              </button>
              <span className={`lx-item-actions${song.pinned ? " keep" : ""}`}>
                <button type="button" className={song.pinned ? "lx-ghost on" : "lx-ghost"} aria-label={song.pinned ? "Desfijar canción" : "Fijar canción"} aria-pressed={song.pinned} data-testid={`btn-pin-song-${song.id}`} onClick={() => togglePin(song.id)}>
                  <Pin />
                </button>
                <button type="button" className="lx-ghost" aria-label={`Editar ${song.title}`} data-testid={`btn-edit-song-${song.id}`} onClick={() => setEditing(song.id)}>
                  <Pencil />
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

            {selectedSong && sections.length > 0 && (
              <div className="lx-arr" aria-label="Orden de la canción">
                <span className="lx-h">Orden</span>
                {parts.map((part, index) => (
                  <span
                    key={`${index}-${part.key}`}
                    className={[
                      "lx-arr-chip",
                      index === slide ? "on" : "",
                      dragFrom === index ? "drag" : "",
                      dragOver === index && dragFrom !== null && dragFrom !== index ? "drop" : "",
                    ].filter(Boolean).join(" ")}
                    draggable
                    onDragStart={(event) => {
                      setDragFrom(index);
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", String(index));
                    }}
                    onDragOver={(event) => {
                      if (dragFrom === null) return;
                      event.preventDefault();
                      setDragOver(index);
                    }}
                    onDrop={(event) => dropPart(event, index)}
                    onDragEnd={() => {
                      setDragFrom(null);
                      setDragOver(null);
                    }}
                  >
                    <button
                      type="button"
                      className="lx-arr-pick"
                      title={`${part.label || "Texto"} · arrastra o usa Alt + ← → para mover`}
                      onClick={() => onSelectPart(index)}
                      onKeyDown={(event) => {
                        if (!event.altKey) return;
                        if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
                          event.preventDefault();
                          moveSongPart(index, index - 1);
                        } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                          event.preventDefault();
                          moveSongPart(index, index + 1);
                        }
                      }}
                    >
                      {sectionBadge(part)}
                    </button>
                    <button type="button" className="lx-arr-x" aria-label={`Quitar parte ${index + 1}`} title="Quitar del orden (la letra no cambia)" onClick={() => removeSongPart(index)}>
                      <X />
                    </button>
                  </span>
                ))}
                <span className="lx-arr-sep" aria-hidden />
                {sections.map((section) => (
                  <button key={section.key} type="button" className="lx-chip-add" title={`Añadir ${section.label || "texto"} al orden`} onClick={() => addSongPart(section)}>
                    <Plus /> {sectionBadge(section)}
                  </button>
                ))}
                {selectedSong.arrangement && (
                  <button type="button" className="lx-ghost" aria-label="Volver al orden de la letra" title="Volver al orden de la letra" onClick={() => commitArrangement(selectedSong, slide, undefined)}>
                    <RotateCcw />
                  </button>
                )}
              </div>
            )}

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
              <p className="lx-empty-ws">
                {sections.length === 0 ? "Esta canción no tiene letra. Edítala para añadir sus partes." : "No hay partes en el orden. Añade una desde la fila de arriba."}
              </p>
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

      <SongDialog open={editing !== null} song={editingSong} onOpenChange={(open) => !open && setEditing(null)} onSave={save} onDelete={remove} />
    </>
  );
}
