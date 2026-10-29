import { useEffect, useRef, useState } from "react";
import type { DragEvent } from "react";
import { ChevronLeft, ChevronRight, History, X } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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

/** Bottom strip with the verses saved for the service, in order, plus the recent history. */
export function SavedStrip(props: Props) {
  const rowRef = useRef<HTMLDivElement>(null);
  const countRef = useRef(props.queue.length);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    if (props.queue.length > countRef.current) {
      rowRef.current?.lastElementChild?.scrollIntoView({
        inline: "nearest",
        block: "nearest",
        behavior: "smooth",
      });
    }
    countRef.current = props.queue.length;
  }, [props.queue.length]);

  const endDrag = () => {
    setDragIndex(null);
    setOverIndex(null);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>, index: number) => {
    event.preventDefault();
    if (dragIndex != null && dragIndex !== index)
      props.onReorder(dragIndex, index);
    endDrag();
  };

  return (
    <footer className="lx-svc" aria-label="Versículos guardados">
      <div className="lx-svc-head">
        <span className="lx-h">Guardados</span>
        <span className="lx-svc-count">
          {props.queue.length}{" "}
          {props.queue.length === 1 ? "versículo" : "versículos"}
        </span>
        <span className="lx-spacer" />
        <Popover open={historyOpen} onOpenChange={setHistoryOpen}>
          <PopoverTrigger
            render={
              <button
                type="button"
                className="lx-ghost lx-ghost-text"
                disabled={props.history.length === 0}
              >
                <History /> Historial
              </button>
            }
          />
          <PopoverContent side="top" align="end" className="lx-history">
            <ul>
              {props.history.map((entry) => (
                <li key={`${entry.at}-${entry.reference}`}>
                  <button
                    type="button"
                    onClick={() => {
                      props.onHistory(entry.reference);
                      setHistoryOpen(false);
                    }}
                  >
                    {entry.reference}
                  </button>
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
        <button
          type="button"
          className="lx-ghost"
          onClick={props.onPrev}
          disabled={props.queue.length === 0}
          aria-label="Proyectar el guardado anterior"
        >
          <ChevronLeft />
        </button>
        <button
          type="button"
          className="lx-ghost"
          onClick={props.onNext}
          disabled={props.queue.length === 0}
          aria-label="Proyectar el guardado siguiente"
        >
          <ChevronRight />
        </button>
      </div>
      <div className="lx-svc-row" ref={rowRef}>
        {props.queue.length === 0 && (
          <p className="lx-svc-empty">
            Guarda versículos antes del servicio y proyéctalos desde aquí con un
            clic.
          </p>
        )}
        {props.queue.map((item, idx) => (
          <div
            key={item.id}
            className={[
              "lx-chip",
              item.id === props.activeId ? "on" : "",
              dragIndex === idx ? "drag" : "",
              overIndex === idx && dragIndex !== null && dragIndex !== idx
                ? "drop"
                : "",
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
              if (dragIndex === null) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              setOverIndex(idx);
            }}
            onDrop={(event) => onDrop(event, idx)}
            onDragEnd={endDrag}
          >
            <button
              type="button"
              className="lx-chip-main"
              title="Proyectar"
              onClick={() => props.onProject(item)}
            >
              <span className="k">{idx + 1} · Escritura</span>
              <span className="t">{item.reference}</span>
            </button>
            <button
              type="button"
              className="lx-chip-x"
              onClick={() => props.onRemove(item.id)}
              aria-label={`Quitar ${item.reference}`}
            >
              <X />
            </button>
          </div>
        ))}
      </div>
    </footer>
  );
}
