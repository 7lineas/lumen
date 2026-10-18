import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { BibleIcon, MediaIcon, SongIcon, TextIcon } from "./icons";

export type OperatorMode = "biblia" | "canciones" | "textos" | "media";

/** Order of the workspaces, matching the number keys 1, 2, 3. */
export const MODE_ORDER: readonly OperatorMode[] = ["biblia", "canciones", "textos", "media"];

const MODES: Array<{ id: OperatorMode; label: string; testId: string; icon: ReactNode }> = [
  { id: "biblia", label: "Biblia", testId: "mode-biblia", icon: <BibleIcon /> },
  { id: "canciones", label: "Canciones", testId: "mode-canciones", icon: <SongIcon /> },
  { id: "textos", label: "Textos", testId: "mode-textos", icon: <TextIcon /> },
  { id: "media", label: "Media", testId: "mode-media", icon: <MediaIcon /> },
];

interface Props {
  mode: OperatorMode;
  onSwitch: (mode: OperatorMode) => void;
  /** Controls shown after the modes, inside the same pill (e.g. the update button). */
  trailing?: ReactNode;
}

/**
 * Segmented switch between the workspaces. The highlight is one element that
 * slides from the old mode to the new one, instead of two buttons swapping.
 */
export function ModeSwitch({ mode, onSwitch, trailing }: Props) {
  const railRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);

  // Position the highlight before paint so the first frame is already right.
  useLayoutEffect(() => {
    const rail = railRef.current;
    const indicator = indicatorRef.current;
    if (!rail || !indicator) return;
    const place = () => {
      const active = rail.querySelector<HTMLElement>(`[data-mode-key="${mode}"]`);
      if (!active) return;
      indicator.style.width = `${active.offsetWidth}px`;
      indicator.style.transform = `translateX(${active.offsetLeft}px)`;
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(rail);
    return () => observer.disconnect();
  }, [mode]);

  // The slide is only enabled after the first placement, so the highlight does
  // not fly in from the left edge when the app opens.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (indicatorRef.current) indicatorRef.current.dataset.ready = "true";
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="modes" ref={railRef}>
      <span ref={indicatorRef} className="modes-indicator" aria-hidden />
      {MODES.map((item, index) => (
        <Button
          key={item.id}
          type="button"
          data-testid={item.testId}
          data-mode-key={item.id}
          aria-pressed={mode === item.id}
          className={mode === item.id ? "active" : ""}
          onClick={() => onSwitch(item.id)}
        >
          {item.icon}
          {item.label}
          <kbd>{index + 1}</kbd>
        </Button>
      ))}
      {trailing}
    </div>
  );
}
