import { useEffect, useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { StoredSong } from "@shared/types";
import { SECTION_PRESETS, nextSectionLabel, parseSong } from "@shared/song-sections";

export interface SongDraft {
  title: string;
  author: string;
  lyrics: string;
}

interface Props {
  open: boolean;
  /** Song being edited; null creates a new one. */
  song: StoredSong | null;
  onOpenChange: (open: boolean) => void;
  onSave: (draft: SongDraft) => void;
  onDelete: () => void;
}

const LYRICS_PLACEHOLDER = "[Verso 1]\nSublime gracia del Señor\nque a un infeliz salvó\n\n[Coro]\n…";

export function SongDialog({ open, song, onOpenChange, onSave, onDelete }: Props) {
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [lyrics, setLyrics] = useState("");
  const lyricsRef = useRef<HTMLTextAreaElement>(null);
  // Where the caret goes after a part name is inserted (applied once React has written the text).
  const caret = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(song?.title ?? "");
    setAuthor(song?.author ?? "");
    setLyrics(song?.lyrics ?? "");
  }, [open, song]);

  useEffect(() => {
    const el = lyricsRef.current;
    if (!el || caret.current === null) return;
    el.focus();
    el.setSelectionRange(caret.current, caret.current);
    caret.current = null;
  }, [lyrics]);

  const parsed = useMemo(() => parseSong(lyrics), [lyrics]);
  const canSave = title.trim() !== "";

  // Starts a new part at the caret: a blank line, the name in brackets, and the caret ready for its text.
  const insertSection = (label: string) => {
    const el = lyricsRef.current;
    const start = el?.selectionStart ?? lyrics.length;
    const end = el?.selectionEnd ?? lyrics.length;
    const before = lyrics.slice(0, start).replace(/\s+$/, "");
    const after = lyrics.slice(end).replace(/^\s+/, "");
    const head = `${before ? `${before}\n\n` : ""}[${label}]\n`;
    caret.current = head.length;
    setLyrics(`${head}${after ? `\n\n${after}` : ""}`);
  };

  const submit = () => {
    if (!canSave) return;
    onSave({ title: title.trim(), author: author.trim(), lyrics });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="lx-dialog" data-testid="song-dialog">
        <DialogHeader>
          <DialogTitle>{song ? "Editar canción" : "Nueva canción"}</DialogTitle>
          <DialogDescription>Cada parte es una diapositiva. Sepáralas con una línea en blanco.</DialogDescription>
        </DialogHeader>
        <form
          className="lx-form"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <label className="lx-field">
            <span>Título</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Sublime gracia" autoComplete="off" autoFocus data-testid="song-title" />
          </label>
          <label className="lx-field">
            <span>Autor / crédito</span>
            <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="John Newton, 1779" autoComplete="off" data-testid="song-author" />
          </label>
          <div className="lx-field">
            <span id="song-lyrics-label">Letra</span>
            <div className="lx-insert" role="group" aria-label="Añadir una parte a la letra">
              {SECTION_PRESETS.map((preset) => (
                <button key={preset.label} type="button" className="lx-chip-add" onClick={() => insertSection(nextSectionLabel(lyrics, preset))}>
                  <Plus /> {preset.label}
                </button>
              ))}
            </div>
            <textarea
              ref={lyricsRef}
              aria-labelledby="song-lyrics-label"
              value={lyrics}
              onChange={(e) => setLyrics(e.target.value)}
              rows={13}
              spellCheck={false}
              placeholder={LYRICS_PLACEHOLDER}
              data-testid="song-lyrics"
            />
            <small>
              Empieza una parte con su nombre entre corchetes: [Verso 1], [Coro], [Puente]. Para repetir el coro, escribe [Coro] otra vez, sin letra.
              {parsed.order.length > 0 && ` Ahora: ${parsed.order.length} ${parsed.order.length === 1 ? "diapositiva" : "diapositivas"}.`}
            </small>
          </div>
          <div className="lx-form-actions">
            {song && (
              <AlertDialog>
                <AlertDialogTrigger render={<Button type="button" variant="destructive" data-testid="btn-delete-song">Eliminar</Button>} />
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Eliminar canción</AlertDialogTitle>
                    <AlertDialogDescription>¿Eliminar “{song.title}”? Esta acción no se puede deshacer.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel data-testid="cancel-delete-song">Cancelar</AlertDialogCancel>
                    <AlertDialogAction variant="destructive" data-testid="confirm-delete-song" onClick={onDelete}>Eliminar</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            <span className="lx-spacer" />
            <Button type="button" data-testid="btn-cancel-edit-song" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" className="primary" disabled={!canSave} data-testid="btn-save-song">
              {song ? "Guardar cambios" : "Crear canción"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
