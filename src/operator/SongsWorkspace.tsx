import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { AppSettings, ProjectorPayload } from "@shared/types";

export interface Song {
  id: string;
  title: string;
  lyrics: string;
  updatedAt: number;
}

interface Props {
  settings: AppSettings;
  onProject: (payload: ProjectorPayload) => void;
}

const STORAGE_KEY = "lumen.canciones";

function id() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function slidesFor(song: Song | null) {
  return song?.lyrics.split(/\n\s*\n/).map((slide) => slide.trim()).filter(Boolean) ?? [];
}

export function SongsWorkspace({ settings, onProject }: Props) {
  const [songs, setSongs] = useState<Song[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as Song[];
      return Array.isArray(saved) ? saved : [];
    } catch {
      return [];
    }
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Song | null>(null);
  const [slide, setSlide] = useState(0);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(songs));
  }, [songs]);

  const selected = songs.find((song) => song.id === selectedId) ?? null;
  const slides = useMemo(() => slidesFor(draft ?? selected), [draft, selected]);
  const visibleSongs = songs.filter((song) => song.title.toLowerCase().includes(query.toLowerCase()));

  const choose = (song: Song) => {
    setSelectedId(song.id);
    setDraft({ ...song });
    setSlide(0);
  };

  const create = () => {
    const song = { id: id(), title: "Nueva canción", lyrics: "Escribe la letra aquí", updatedAt: Date.now() };
    setSongs((current) => [song, ...current]);
    choose(song);
  };

  const save = () => {
    if (!draft || !draft.title.trim()) return;
    const next = { ...draft, title: draft.title.trim(), updatedAt: Date.now() };
    setSongs((current) => current.map((song) => (song.id === next.id ? next : song)));
    setDraft(next);
  };

  const remove = () => {
    if (!draft) return;
    setSongs((current) => current.filter((song) => song.id !== draft.id));
    setDraft(null);
    setSelectedId(null);
  };

  const project = () => {
    if (!draft || slides.length === 0) return;
    onProject({
      mode: "verse",
      referenceLabel: draft.title,
      blocks: [{ text: slides[slide] ?? slides[0] }],
      churchName: settings.churchName,
      fontSize: settings.fontSize,
      brightness: settings.brightness,
      theme: settings.theme,
      backgroundColor: settings.backgroundColor,
      copyright: "",
    });
  };

  return (
    <div className="songs-side-panels">
      <div className="songs-left">
        <aside className="songs-library">
        <div className="songs-panel-head"><div><p className="eyebrow">Biblioteca</p><h2>Canciones</h2></div><Button type="button" className="primary" onClick={create}>Nueva</Button></div>
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar canción" aria-label="Buscar canción" />
        {visibleSongs.length === 0 ? <p className="muted">Crea tu primera canción para comenzar.</p> : (
          <ul className="song-list">{visibleSongs.map((song) => <li key={song.id}><Button type="button" className={song.id === selectedId ? "song-item selected" : "song-item"} onClick={() => choose(song)}><span>{song.title}</span><small>{slidesFor(song).length} partes</small></Button></li>)}</ul>
        )}
        </aside>

        <main className="song-editor">
        {!draft ? <div className="song-empty"><span className="song-empty-icon">♫</span><h2>Prepara una canción</h2><p className="muted">Crea una canción y separa sus partes con una línea en blanco.</p><Button type="button" className="primary" onClick={create}>Crear canción</Button></div> : <>
          <div className="songs-panel-head"><div><p className="eyebrow">Editor</p><h2>Contenido de la canción</h2></div><div className="action-row"><Button type="button" onClick={remove}>Eliminar</Button><Button type="button" className="primary" onClick={save}>Guardar</Button></div></div>
          <label className="song-field"><span>Título</span><Input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
          <label className="song-field"><span>Letra</span><Textarea className="song-lyrics" value={draft.lyrics} onChange={(event) => setDraft({ ...draft, lyrics: event.target.value })} placeholder="Verso 1\n\nCoro\n\nPuente" /></label>
          <p className="hint">Cada bloque separado por una línea en blanco se convierte en una parte proyectable.</p>
        </>}
        </main>
      </div>

      <aside className="song-presenter">
        <p className="eyebrow">Presentación</p><h2>Vista previa</h2>
        {draft && slides.length > 0 ? <>
          <div className="song-preview"><p className="song-preview-title">{draft.title}</p><p>{slides[slide] ?? slides[0]}</p></div>
          <div className="song-slides">{slides.map((text, index) => <Button key={`${index}-${text}`} type="button" className={index === slide ? "chip selected" : "chip"} onClick={() => setSlide(index)}>{index + 1}</Button>)}</div>
          <Button type="button" className="primary project-song" onClick={project}>Proyectar parte {slide + 1}</Button>
        </> : <p className="muted">Selecciona una canción para preparar la proyección.</p>}
      </aside>
    </div>
  );
}
