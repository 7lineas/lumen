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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { StoredText } from "@shared/types";
import { textSlides } from "@shared/text-slides";
import { DEFAULT_FONT_WEIGHT, type FontFamilyId } from "@shared/fonts";
import { OwnTypeface } from "./TypefaceSelect";

export interface TextDraft {
  title: string;
  body: string;
  /** Undefined when the text follows Ajustes > Tipo de letra. */
  fontFamily?: FontFamilyId;
  fontWeight?: number;
}

interface Props {
  open: boolean;
  /** Text being edited; null creates a new one. */
  text: StoredText | null;
  /** Ajustes > Tipo de letra, used when the text turns on its own typeface. */
  defaultFontFamily: FontFamilyId;
  onOpenChange: (open: boolean) => void;
  onSave: (draft: TextDraft) => void;
  onDelete: () => void;
}

export function TextDialog({
  open,
  text,
  defaultFontFamily,
  onOpenChange,
  onSave,
  onDelete,
}: Props) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [ownType, setOwnType] = useState(false);
  const [fontFamily, setFontFamily] = useState<FontFamilyId>(defaultFontFamily);
  const [fontWeight, setFontWeight] = useState(DEFAULT_FONT_WEIGHT);

  useEffect(() => {
    if (!open) return;
    setTitle(text?.title ?? "");
    setBody(text?.body ?? "");
    setOwnType(text?.fontFamily !== undefined);
    setFontFamily(text?.fontFamily ?? defaultFontFamily);
    setFontWeight(text?.fontWeight ?? DEFAULT_FONT_WEIGHT);
  }, [open, text, defaultFontFamily]);

  const slides = textSlides(body).length;
  const canSave = title.trim() !== "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="lx-dialog" data-testid="text-dialog">
        <DialogHeader>
          <DialogTitle>{text ? "Editar texto" : "Nuevo texto"}</DialogTitle>
          <DialogDescription>
            Cada bloque separado por una línea en blanco es una diapositiva.
          </DialogDescription>
        </DialogHeader>
        <form
          className="lx-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (canSave)
              onSave({
                title: title.trim(),
                body,
                fontFamily: ownType ? fontFamily : undefined,
                fontWeight: ownType ? fontWeight : undefined,
              });
          }}
        >
          <label className="lx-field">
            <span>Título</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Bienvenida"
              autoComplete="off"
              autoFocus
              data-testid="text-title"
            />
          </label>
          <label className="lx-field">
            <span>Texto</span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={13}
              spellCheck
              placeholder={
                "Bienvenidos a la casa de Dios.\n\nHoy celebramos juntos…"
              }
              data-testid="text-body"
            />
            <small>
              {slides > 0
                ? `Ahora: ${slides} ${slides === 1 ? "diapositiva" : "diapositivas"}.`
                : "Escribe el texto para proyectarlo."}
            </small>
          </label>
          <OwnTypeface
            own={ownType}
            onOwnChange={setOwnType}
            fontFamily={fontFamily}
            fontWeight={fontWeight}
            onChange={({ fontFamily: nextFamily, fontWeight: nextWeight }) => {
              setFontFamily(nextFamily);
              setFontWeight(nextWeight);
            }}
            testId="text-own-type"
          />
          <div className="lx-form-actions">
            {text && (
              <AlertDialog>
                <AlertDialogTrigger
                  render={
                    <Button
                      type="button"
                      variant="destructive"
                      data-testid="btn-delete-text"
                    >
                      Eliminar
                    </Button>
                  }
                />
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Eliminar texto</AlertDialogTitle>
                    <AlertDialogDescription>
                      ¿Eliminar “{text.title}”? Esta acción no se puede
                      deshacer.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      variant="destructive"
                      data-testid="confirm-delete-text"
                      onClick={onDelete}
                    >
                      Eliminar
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            <span className="lx-spacer" />
            <Button
              type="button"
              data-testid="btn-cancel-edit-text"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              className="primary"
              disabled={!canSave}
              data-testid="btn-save-text"
            >
              {text ? "Guardar cambios" : "Crear texto"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
