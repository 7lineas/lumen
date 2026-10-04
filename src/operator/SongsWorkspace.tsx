import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Pin, Pencil } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export interface Song {
  id: string;
  title: string;
  lyrics: string;
  updatedAt: number;
  pinned: boolean;
}

export interface SongStage {
  title: string;
  slides: string[];
  index: number;
}

interface Props {
  staged: SongStage | null;
  selectedId: string | null;
  projectOnClick: boolean;
  onToggleProjectOnClick: (value: boolean) => void;
  onSelectSong: (songId: string, title: string, slides: string[]) => void;
  onSelectPart: (index: number) => void;
}

const STORAGE_KEY = "lumen.canciones";

function id() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function slidesFor(song: Song | null) {
  return song?.lyrics.split(/\n\s*\n/).map((slide) => slide.trim()).filter(Boolean) ?? [];
}

export function slidesForLyrics(lyrics: string) {
  return lyrics.split(/\n\s*\n/).map((slide) => slide.trim()).filter(Boolean);
}

export function SongsWorkspace({ staged, selectedId, projectOnClick, onToggleProjectOnClick, onSelectSong, onSelectPart }: Props) {
  const [songs, setSongs] = useState<Song[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as Song[];
      if (!Array.isArray(saved)) return [];
      return saved.map((song) => ({ ...song, pinned: song.pinned ?? false }));
    } catch {
      return [];
    }
  });
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Song | null>(null);
  const [rightTab, setRightTab] = useState<"library" | "creation">("library");

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(songs));
  }, [songs]);

  const visibleSongs = useMemo(
    () =>
      songs
        .filter((song) => song.title.toLowerCase().includes(query.toLowerCase()))
        .sort((a, b) => Number(b.pinned) - Number(a.pinned)),
    [songs, query],
  );

  const selectSong = (song: Song) => {
    onSelectSong(song.id, song.title, slidesFor(song));
  };

  const editSong = (song: Song) => {
    setDraft({ ...song });
    setRightTab("creation");
  };

  const togglePin = (songId: string) => {
    setSongs((current) => current.map((song) => (song.id === songId ? { ...song, pinned: !song.pinned } : song)));
  };

  const isNew = draft ? !songs.some((song) => song.id === draft.id) : false;

  const openCreation = () => {
    if (!draft) {
      setDraft({ id: id(), title: "", lyrics: "", updatedAt: Date.now(), pinned: false });
    }
    setRightTab("creation");
  };

  // Creation tab always shows the form directly — never the "Nueva canción" placeholder.
  useEffect(() => {
    if (rightTab === "creation" && !draft) {
      setDraft({ id: id(), title: "", lyrics: "", updatedAt: Date.now(), pinned: false });
    }
  }, [rightTab, draft]);

  const create = () => {
    const song = { id: id(), title: "", lyrics: "", updatedAt: Date.now(), pinned: false };
    setDraft({ ...song });
    setRightTab("creation");
  };

  const save = () => {
    if (!draft || !draft.title.trim()) return;
    const next = { ...draft, title: draft.title.trim(), updatedAt: Date.now() };
    setSongs((current) =>
      current.some((song) => song.id === next.id) ? current.map((song) => (song.id === next.id ? next : song)) : [next, ...current],
    );
    setDraft(null);
    setQuery("");
    setRightTab("library");
    if (next.id === selectedId) {
      onSelectSong(next.id, next.title, slidesFor(next));
    }
  };

  const remove = () => {
    if (!draft) return;
    const deletedId = draft.id;
    setSongs((current) => current.filter((song) => song.id !== deletedId));
    setDraft(null);
    setRightTab("library");
  };

  const slides = staged?.slides ?? [];
  const slide = staged?.index ?? 0;

  return (
    <div className="songs-side-panels">
      <aside className="songs-left songs-parts">
        <p className="eyebrow">Partes</p>
        <h2>{staged?.title || "Canción seleccionada"}</h2>
        <label className="song-project-toggle">
          <Switch checked={projectOnClick} onCheckedChange={onToggleProjectOnClick} aria-label="Proyectar al hacer clic" />
          <span>Proyectar al hacer clic</span>
        </label>
        {staged && slides.length > 0 ? (
          <ol className="song-parts-list">
            {slides.map((text, index) => (
              <li key={`${index}-${text}`}>
                <Button type="button" variant="ghost" className={index === slide ? "song-part selected" : "song-part"} onClick={() => onSelectPart(index)}>
                  <span className="song-part-number">{index + 1}</span><span className="song-part-text">{text}</span>
                </Button>
              </li>
            ))}
          </ol>
        ) : <p className="muted">Selecciona o crea una canción en el panel derecho.</p>}
      </aside>

      <aside className="song-presenter songs-library-panel">
        <div className="song-tabs" role="tablist" aria-label="Gestión de canciones">
          <Button type="button" role="tab" aria-selected={rightTab === "library"} className={rightTab === "library" ? "song-tab active" : "song-tab"} onClick={() => setRightTab("library")}>Biblioteca</Button>
          <Button type="button" role="tab" aria-selected={rightTab === "creation"} className={rightTab === "creation" ? "song-tab active" : "song-tab"} onClick={openCreation}>{draft && !isNew ? "Edición" : "Creación"}</Button>
        </div>
        {rightTab === "library" ? <>
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar canción" aria-label="Buscar canción" />
          {visibleSongs.length === 0 ? (
            songs.length === 0 ? (
              <div className="song-empty">
                <p className="muted">Lista vacía</p>
                <Button type="button" className="primary" onClick={create}>Crear canción</Button>
              </div>
            ) : (
              <p className="muted">Sin resultados para “{query}”.</p>
            )
          ) : (
            <ul className="song-list">{visibleSongs.map((song) => <li key={song.id} className={song.id === selectedId ? "song-row selected" : "song-row"}>
              <Button type="button" variant="ghost" aria-label={`Seleccionar ${song.title}`} className="song-row-main" onClick={() => selectSong(song)}>
                <span>{song.title}</span><small>{slidesFor(song).length} partes</small>
              </Button>
              <div className="song-row-actions">
                <Button type="button" size="icon-sm" variant="ghost" aria-label={song.pinned ? "Desfijar canción" : "Fijar canción"} aria-pressed={song.pinned} data-testid={`btn-pin-song-${song.id}`} className={song.pinned ? "song-icon-btn pinned" : "song-icon-btn"} onClick={() => togglePin(song.id)}><Pin /></Button>
                <Button type="button" size="icon-sm" variant="ghost" aria-label={`Editar ${song.title}`} data-testid={`btn-edit-song-${song.id}`} className="song-icon-btn" onClick={() => editSong(song)}><Pencil /></Button>
              </div>
            </li>)}</ul>
          )}
        </> : <div className="song-edit-box">
          {draft && <>
          <div className="song-edit-actions">{!isNew ? <>
            <Button type="button" data-testid="btn-cancel-edit-song" onClick={() => { setDraft(null); setRightTab("library"); }}>Cancelar</Button>
            <AlertDialog>
            <AlertDialogTrigger render={<Button type="button" data-testid="btn-delete-song">Eliminar</Button>} />
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Eliminar canción</AlertDialogTitle>
                <AlertDialogDescription>
                  ¿Eliminar “{draft.title}”? Esta acción no se puede deshacer.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel data-testid="cancel-delete-song">Cancelar</AlertDialogCancel>
                <AlertDialogAction variant="destructive" data-testid="confirm-delete-song" onClick={remove}>Eliminar</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          </> : <Button type="button" onClick={() => setDraft(null)}>Cancelar</Button>}<Button type="button" className="primary" onClick={save} disabled={!draft.title.trim()}>Guardar</Button></div>
          <label className="song-field"><span>Título</span><Input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Título de la canción" /></label>
          <label className="song-field"><span>Letra</span><Textarea className="song-lyrics" value={draft.lyrics} onChange={(event) => setDraft({ ...draft, lyrics: event.target.value })} placeholder={"Verso 1\n\nCoro\n\nPuente"} /></label>
          <p className="hint song-hint-centered">Separa las partes con una línea en blanco.</p>
          </>}
        </div>}
      </aside>
    </div>
  );
}
