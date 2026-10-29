import { useCallback, useEffect, useRef } from "react";
import { backgroundImageUrl } from "@shared/background-image";
import { videoPosition } from "@shared/stage";
import type { MediaFit, VideoPlayback } from "@shared/types";

/** How far a window may be from the operator's clock right after a transport action (seconds). */
const DRIFT_TOLERANCE = 0.4;
/**
 * How far it may drift while simply playing. Wider on purpose: on a slow
 * computer a seek takes longer than the tolerance, so correcting small drift
 * would seek again and again and the video would never play.
 */
const PLAYING_DRIFT_TOLERANCE = 3;

interface Props {
  playback: VideoPlayback;
  /** The operator monitors are silent; only the projector plays the sound. */
  muted: boolean;
  fit?: MediaFit;
  className?: string;
  onDuration?: (seconds: number) => void;
  /**
   * Show the frame of the last transport action instead of playing. The
   * operator monitors use it: each playing copy is one more full decode of
   * the video, and older computers cannot afford several next to the projector.
   */
  still?: boolean;
}

/**
 * A video that follows the operator's transport: every window computes the
 * same position from `playback` and only seeks when it has drifted, so
 * projector and monitors stay in step without streaming time updates.
 */
export function SyncedVideo({
  playback,
  muted,
  fit = "contain",
  className,
  onDuration,
  still = false,
}: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  const { path, playing, startedAt, position, volume } = playback;

  const sync = useCallback(
    (tolerance: number) => {
      const el = ref.current;
      if (!el || el.readyState < HTMLMediaElement.HAVE_METADATA) return;
      const target = videoPosition(
        { playing, startedAt, position },
        Date.now(),
        el.duration,
      );
      if (Math.abs(el.currentTime - target) > tolerance) {
        try {
          el.currentTime = target;
        } catch {
          // ignore (seek not possible yet)
        }
      }
      if (still) return;
      const ended = Number.isFinite(el.duration) && target >= el.duration;
      if (playing && !ended) void el.play().catch(() => undefined);
      else el.pause();
    },
    [playing, startedAt, position, still],
  );

  // A transport action (play, pause, seek) is followed at once. After that a
  // playing video is re-checked once a second: it corrects real drift and
  // retries a play that Chromium refused (it pauses silent video while the
  // window is covered).
  useEffect(() => {
    sync(DRIFT_TOLERANCE);
    if (still) return;
    const check = () => {
      if (!ref.current?.seeking) sync(PLAYING_DRIFT_TOLERANCE);
    };
    const id = window.setInterval(check, 1000);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", check);
    };
  }, [sync, still, path]);

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
      preload={still ? "metadata" : "auto"}
      onLoadedMetadata={(event) => {
        onDuration?.(event.currentTarget.duration);
        sync(DRIFT_TOLERANCE);
      }}
      aria-hidden
    />
  );
}
