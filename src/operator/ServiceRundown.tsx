import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ChevronLeft, ChevronRight, GripVertical, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { DragEvent } from "react";
import type { HistoryEntry, QueueEntry } from "@shared/types";

interface Props {
  queue: QueueEntry[];
  activeId: string | null;
  history: HistoryEntry[];
  onProject: (item: QueueEntry) => void;
  onRemove: (id: string) => void;
  onReorder: (from: number, to: number) => void;
  onPrev: () => void;
  onNext: () => void;
  onHistory: (reference: string) => void;
}

export function ServiceRundown(props: Props) {
  const listRef = useRef<HTMLOListElement>(null);
  const countRef = useRef(props.queue.length);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  useEffect(() => {
    if (props.queue.length > countRef.current) {
      listRef.current?.lastElementChild?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
    countRef.current = props.queue.length;
  }, [props.queue.length]);

  const endDrag = () => {
    setDragIndex(null);
    setOverIndex(null);
  };

  const onDrop = (event: DragEvent<HTMLLIElement>, index: number) => {
    event.preventDefault();
    if (dragIndex != null && dragIndex !== index) props.onReorder(dragIndex, index);
    endDrag();
  };

  return (
    <section className="rundown">
      <div className="rundown-block">
        <header className="rundown-head">
          <h2>Guardados</h2>
          <div className="rundown-nav">
            <Button
              type="button"
              size="icon-sm"
              onClick={props.onPrev}
              disabled={props.queue.length === 0}
              aria-label="Anterior"
            >
              <ChevronLeft />
            </Button>
            <Button
              type="button"
              size="icon-sm"
              onClick={props.onNext}
              disabled={props.queue.length === 0}
              aria-label="Siguiente"
            >
              <ChevronRight />
            </Button>
          </div>
        </header>
        {props.queue.length === 0 && (
          <p className="muted">La lista está vacía. Agregue versículos antes del culto.</p>
        )}
        <ol className="queue-list" ref={listRef}>
          {props.queue.map((item, idx) => (
            <li
              key={item.id}
              className={[
                item.id === props.activeId ? "is-current" : "",
                dragIndex === idx ? "is-dragging" : "",
                overIndex === idx && dragIndex !== idx ? "is-drop-target" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              draggable
              onDragStart={(event) => {
                setDragIndex(idx);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", item.id);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setOverIndex(idx);
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  setOverIndex((current) => (current === idx ? null : current));
                }
              }}
              onDrop={(event) => onDrop(event, idx)}
              onDragEnd={endDrag}
            >
              <span className="queue-handle" aria-hidden>
                <GripVertical />
              </span>
              <Button type="button" className="queue-label" onClick={() => props.onProject(item)}>
                <span className="queue-index">{idx + 1}</span>
                <span className="queue-reference">{item.reference}</span>
              </Button>
              <div className="queue-actions">
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => props.onRemove(item.id)}
                  aria-label="Quitar"
                >
                  <Trash2 />
                </Button>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div className="rundown-block">
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
      </div>
    </section>
  );
}
