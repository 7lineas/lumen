import { useEffect, useRef, useState } from "react";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import type { StoredSong } from "@shared/types";
import { TransitionRow } from "./TransitionRow";

export interface SongDraft {
  title: string;
  author: string;
  lyrics: string;
  /** Undefined when the song follows Ajustes > Canciones. */
  fadeMs?: number;
}

interface Props {
  open: boolean;
  /** Song being edited; null creates a new one. */
  song: StoredSong | null;
  /** Ajustes > Canciones transition, used when the song has no velocity of its own. */
  defaultFadeMs: number;
  onOpenChange: (open: boolean) => void;
  onSave: (draft: SongDraft) => void;
  onDelete: () => void;
}

const LYRICS_PLACEHOLDER = "[Verso 1]\nSublime gracia del Señor\nque a un infeliz salvó\n\n[Coro]\n…";

export function SongDialog({ open, song, defaultFadeMs, onOpenChange, onSave, onDelete }: Props) {
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [ownFade, setOwnFade] = useState(false);
  const [fadeMs, setFadeMs] = useState(defaultFadeMs);
  const lyricsRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(song?.title ?? "");
    setAuthor(song?.author ?? "");
    setLyrics(song?.lyrics ?? "");
    setOwnFade(song?.fadeMs !== undefined);
    setFadeMs(song?.fadeMs ?? defaultFadeMs);
  }, [open, song, defaultFadeMs]);

  const canSave = title.trim() !== "";

  const submit = () => {
    if (!canSave) return;
    onSave({ title: title.trim(), author: author.trim(), lyrics, fadeMs: ownFade ? fadeMs : undefined });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="lx-dialog" data-testid="song-dialog">
        <DialogHeader>
          <DialogTitle>{song ? "Editar canción" : "Nueva canción"}</DialogTitle>
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
            <label className="lx-toggle">
              <Switch checked={ownFade} onCheckedChange={setOwnFade} aria-label="Velocidad de transición propia de la canción" data-testid="song-own-fade" />
              <span>Velocidad de transición</span>
            </label>
            {ownFade && <TransitionRow content="letra" value={fadeMs} onChange={setFadeMs} />}
          </div>
          <div className="lx-field">
            <span id="song-lyrics-label">Letra</span>
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
