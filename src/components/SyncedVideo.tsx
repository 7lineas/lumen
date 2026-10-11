import { useCallback, useEffect, useRef } from "react";
import { backgroundImageUrl } from "@shared/background-image";
import { videoPosition } from "@shared/stage";
import type { MediaFit, VideoPlayback } from "@shared/types";

/** How far a window may drift from the operator's clock before it is corrected (seconds). */
const DRIFT_TOLERANCE = 0.4;

interface Props {
  playback: VideoPlayback;
  /** The operator monitors are silent; only the projector plays the sound. */
  muted: boolean;
  fit?: MediaFit;
  className?: string;
  onDuration?: (seconds: number) => void;
}

/**
 * A video that follows the operator's transport: every window computes the
 * same position from `playback` and only seeks when it has drifted, so
 * projector and monitors stay in step without streaming time updates.
 */
export function SyncedVideo({ playback, muted, fit = "contain", className, onDuration }: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  const { path, playing, startedAt, position, volume } = playback;

  const sync = useCallback(() => {
    const el = ref.current;
    if (!el || el.readyState < HTMLMediaElement.HAVE_METADATA) return;
    const target = videoPosition({ playing, startedAt, position }, Date.now(), el.duration);
    if (Math.abs(el.currentTime - target) > DRIFT_TOLERANCE) {
      try {
        el.currentTime = target;
      } catch {
        // ignore (seek not possible yet)
      }
    }
    const ended = Number.isFinite(el.duration) && target >= el.duration;
    if (playing && !ended) void el.play().catch(() => undefined);
    else el.pause();
  }, [playing, startedAt, position]);

  // Re-check once a second: it corrects drift and retries a play that
  // Chromium refused (it pauses silent video while the window is covered).
  useEffect(() => {
    sync();
    const id = window.setInterval(sync, 1000);
    document.addEventListener("visibilitychange", sync);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [sync, path]);

  useEffect(() => {
    if (ref.current) ref.current.volume = Math.min(Math.max(volume, 0), 1);
  }, [volume, path]);

  return (
    <video
      key={path}
      ref={ref}
      className={className}
      style={{ objectFit: fit }}
      src={backgroundImageUrl(path)}
      muted={muted}
      playsInline
      preload="auto"
      onLoadedMetadata={(event) => {
        onDuration?.(event.currentTarget.duration);
        sync();
      }}
      aria-hidden
    />
  );
}
