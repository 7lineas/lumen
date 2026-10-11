import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";

const MOD = /Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘" : "Ctrl";

interface Row {
  keys: string[];
  label: string;
  /** Between keys of one shortcut: "+" for chords, a space for the arrow pair. */
  joiner?: string;
}

const SECTIONS: Array<{ title: string; rows: Row[] }> = [
  {
    title: "Espacios",
    rows: [
      { keys: ["1"], label: "Biblia" },
      { keys: ["2"], label: "Canciones" },
      { keys: ["3"], label: "Media" },
    ],
  },
  {
    title: "Presentar",
    rows: [
      { keys: ["←", "→"], joiner: " ", label: "Anterior o siguiente en la vista previa" },
      { keys: ["↑", "↓"], joiner: " ", label: "Fila de arriba o de abajo" },
      { keys: ["Enter"], label: "Proyectar la vista previa" },
      { keys: ["Doble clic"], label: "Proyectar esa diapositiva directamente" },
      { keys: ["Alt", "←", "→"], label: "Mover la parte seleccionada en el orden de la canción" },
      { keys: ["B"], label: "Limpiar el texto o restaurarlo" },
      { keys: ["L"], label: "Mostrar u ocultar el logo" },
    ],
  },
  {
    title: "General",
    rows: [
      { keys: [MOD, "K"], label: "Buscar" },
      { keys: ["?"], label: "Mostrar esta ventana" },
    ],
  },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShortcutsDialog({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="shortcuts-dialog">
        <DialogHeader>
          <DialogTitle>Atajos de teclado</DialogTitle>
          <DialogDescription>Funcionan cuando no estás escribiendo en un campo.</DialogDescription>
        </DialogHeader>
        <div className="shortcuts-list">
          {SECTIONS.map((section) => (
            <section key={section.title} className="shortcuts-section">
              <h3>{section.title}</h3>
              <dl>
                {section.rows.map((row) => (
                  <div key={row.label} className="shortcuts-row">
                    <dt>
                      {row.keys.map((key, i) => (
                        <span key={`${key}-${i}`} className="shortcuts-keys">
                          {i > 0 && <span aria-hidden>{row.joiner ?? "+"}</span>}
                          <Kbd>{key}</Kbd>
                        </span>
                      ))}
                    </dt>
                    <dd>{row.label}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
