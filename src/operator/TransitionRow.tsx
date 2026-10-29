import { useEffect, useState } from "react";
import { Play, Rabbit, Turtle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

export type DemoContent = "hebrew" | "letra" | "gradient";

/** A small sample that fades in and out with the chosen duration. */
function TransitionDemo({
  ms,
  runKey,
  content,
}: {
  ms: number;
  runKey: number;
  content: DemoContent;
}) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (runKey === 0) return;
    setShown(false);
    const show = window.setTimeout(() => setShown(true), 250);
    const hide = window.setTimeout(() => setShown(false), 250 + ms + 900);
    return () => {
      window.clearTimeout(show);
      window.clearTimeout(hide);
    };
  }, [runKey, ms]);

  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  return (
    <div className="ajustes-demo" aria-hidden>
      <div
        className={`ajustes-demo-card is-${content}`}
        style={{
          opacity: shown ? 1 : 0,
          transitionDuration: reduceMotion ? "0ms" : `${ms}ms`,
        }}
      >
        {content === "hebrew" && (
          <span className="ajustes-demo-text" lang="he" dir="rtl">
            ישוע
          </span>
        )}
        {content === "letra" && (
          <span className="ajustes-demo-text">Letra</span>
        )}
      </div>
    </div>
  );
}

/** The slider runs slow (left) to fast (right), so its value is flipped against the stored ms. */
const MAX_MS = 2000;

export function TransitionRow({
  label,
  value,
  content,
  onChange,
}: {
  /** Title shown above the slider; omit it when the surrounding UI already labels the row. */
  label?: string;
  value: number;
  content: DemoContent;
  onChange: (ms: number) => void;
}) {
  const [runKey, setRunKey] = useState(0);
  return (
    <div className="ajustes-transition">
      {label && (
        <div className="ajustes-transition-head">
          <span>{label}</span>
        </div>
      )}
      <div className="ajustes-transition-controls">
        <Turtle size={16} strokeWidth={1.75} aria-hidden />
        <Slider
          className="ajustes-slider"
          min={0}
          max={MAX_MS}
          step={50}
          value={[MAX_MS - value]}
          onValueChange={(next) => {
            const slider = Array.isArray(next) ? next[0] : next;
            onChange(slider === undefined ? value : MAX_MS - slider);
            setRunKey((k) => k + 1);
          }}
        />
        <Rabbit size={16} strokeWidth={1.75} aria-hidden />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={
            label ? `Probar transición de ${label}` : "Probar transición"
          }
          onClick={() => setRunKey((k) => k + 1)}
        >
          <Play size={14} aria-hidden />
        </Button>
        <TransitionDemo ms={value} runKey={runKey} content={content} />
      </div>
    </div>
  );
}
