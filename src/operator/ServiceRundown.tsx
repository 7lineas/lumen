import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { HistoryEntry, QueueEntry } from "@shared/types";

interface Props {
  queue: QueueEntry[];
  activeId: string | null;
  history: HistoryEntry[];
  onProject: (item: QueueEntry) => void;
  onRemove: (id: string) => void;
  onMove: (index: number, dir: -1 | 1) => void;
  onNext: () => void;
  onAddCurrent: () => void;
  onHistory: (reference: string) => void;
}

export function ServiceRundown(props: Props) {
  return (
    <section className="rundown">
      <header className="rundown-head">
        <h2>Servicio</h2>
        <Button type="button" className="primary" onClick={props.onNext}>
          Siguiente
        </Button>
      </header>
      <Button type="button" className="linkish" onClick={props.onAddCurrent}>
        + Añadir lo que está en vista previa
      </Button>
      {props.queue.length === 0 && (
        <p className="muted">La lista está vacía. Agregue versículos antes del culto.</p>
      )}
      <ol className="queue-list">
        {props.queue.map((item, idx) => (
          <li key={item.id} className={item.id === props.activeId ? "is-current" : ""}>
            <Button type="button" className="queue-label" onClick={() => props.onProject(item)}>
              <span className="queue-index">{idx + 1}</span>
              {item.reference}
            </Button>
            <div className="queue-actions">
              <Button type="button" onClick={() => props.onMove(idx, -1)} disabled={idx === 0} aria-label="Subir">
                ↑
              </Button>
              <Button
                type="button"
                onClick={() => props.onMove(idx, 1)}
                disabled={idx === props.queue.length - 1}
                aria-label="Bajar"
              >
                ↓
              </Button>
              <Button type="button" onClick={() => props.onRemove(item.id)} aria-label="Quitar">
                ×
              </Button>
            </div>
          </li>
        ))}
      </ol>
      <Separator />
      <h3>Historial</h3>
      <ul className="compact-list">
        {props.history.map((h) => (
          <li key={`${h.at}-${h.reference}`}>
            <Button type="button" onClick={() => props.onHistory(h.reference)}>
              {h.reference}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
