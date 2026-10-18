import { useEffect, useState } from "react";
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
import type { StoredText } from "@shared/types";
import { textSlides } from "@shared/text-slides";

export interface TextDraft {
  title: string;
  body: string;
}

interface Props {
  open: boolean;
  /** Text being edited; null creates a new one. */
  text: StoredText | null;
  onOpenChange: (open: boolean) => void;
  onSave: (draft: TextDraft) => void;
  onDelete: () => void;
}

export function TextDialog({ open, text, onOpenChange, onSave, onDelete }: Props) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  useEffect(() => {
    if (!open) return;
    setTitle(text?.title ?? "");
    setBody(text?.body ?? "");
  }, [open, text]);

  const slides = textSlides(body).length;
  const canSave = title.trim() !== "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="lx-dialog" data-testid="text-dialog">
        <DialogHeader>
          <DialogTitle>{text ? "Editar texto" : "Nuevo texto"}</DialogTitle>
          <DialogDescription>Cada bloque separado por una línea en blanco es una diapositiva.</DialogDescription>
        </DialogHeader>
        <form
          className="lx-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (canSave) onSave({ title: title.trim(), body });
          }}
        >
          <label className="lx-field">
            <span>Título</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Bienvenida" autoComplete="off" autoFocus data-testid="text-title" />
          </label>
          <label className="lx-field">
            <span>Texto</span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={13}
              spellCheck
              placeholder={"Bienvenidos a la casa de Dios.\n\nHoy celebramos juntos…"}
              data-testid="text-body"
            />
            <small>{slides > 0 ? `Ahora: ${slides} ${slides === 1 ? "diapositiva" : "diapositivas"}.` : "Escribe el texto para proyectarlo."}</small>
          </label>
          <div className="lx-form-actions">
            {text && (
              <AlertDialog>
                <AlertDialogTrigger render={<Button type="button" variant="destructive" data-testid="btn-delete-text">Eliminar</Button>} />
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Eliminar texto</AlertDialogTitle>
                    <AlertDialogDescription>¿Eliminar “{text.title}”? Esta acción no se puede deshacer.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction variant="destructive" data-testid="confirm-delete-text" onClick={onDelete}>Eliminar</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            <span className="lx-spacer" />
            <Button type="button" data-testid="btn-cancel-edit-text" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" className="primary" disabled={!canSave} data-testid="btn-save-text">
              {text ? "Guardar cambios" : "Crear texto"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
