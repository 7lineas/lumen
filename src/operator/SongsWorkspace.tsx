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
      <aside className="songs-left songs-parts">
        <p className="eyebrow">Partes</p>
        <h2>{draft?.title || "Canción seleccionada"}</h2>
        {draft && slides.length > 0 ? <>
          <ol className="song-parts-list">
            {slides.map((text, index) => (
              <li key={`${index}-${text}`}>
                <Button type="button" className={index === slide ? "song-part selected" : "song-part"} onClick={() => setSlide(index)}>
                  <span className="song-part-number">{index + 1}</span><span>{text}</span>
                </Button>
              </li>
            ))}
          </ol>
          <div className="song-preview"><p className="song-preview-title">Parte {slide + 1}</p><p>{slides[slide] ?? slides[0]}</p></div>
          <Button type="button" className="primary project-song" onClick={project}>Proyectar parte {slide + 1}</Button>
        </> : <p className="muted">Selecciona o crea una canción en el panel derecho.</p>}
      </aside>

      <aside className="song-presenter songs-library-panel">
        <div className="songs-panel-head"><div><p className="eyebrow">Biblioteca</p><h2>Canciones</h2></div><Button type="button" className="primary" onClick={create}>Nueva</Button></div>
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar canción" aria-label="Buscar canción" />
        {visibleSongs.length === 0 ? <p className="muted">Crea tu primera canción para comenzar.</p> : (
          <ul className="song-list">{visibleSongs.map((song) => <li key={song.id}><Button type="button" className={song.id === selectedId ? "song-item selected" : "song-item"} onClick={() => choose(song)}><span>{song.title}</span><small>{slidesFor(song).length} partes</small></Button></li>)}</ul>
        )}
        {draft && <div className="song-edit-box">
          <div className="songs-panel-head"><div><p className="eyebrow">Editor</p><h2>Contenido</h2></div><div className="action-row"><Button type="button" onClick={remove}>Eliminar</Button><Button type="button" className="primary" onClick={save}>Guardar</Button></div></div>
          <label className="song-field"><span>Título</span><Input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
          <label className="song-field"><span>Letra</span><Textarea className="song-lyrics" value={draft.lyrics} onChange={(event) => setDraft({ ...draft, lyrics: event.target.value })} placeholder="Verso 1\n\nCoro\n\nPuente" /></label>
          <p className="hint">Separa las partes con una línea en blanco.</p>
        </div>}
      </aside>
    </div>
  );
}
