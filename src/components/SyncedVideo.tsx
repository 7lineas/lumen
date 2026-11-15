import { useCallback, useEffect, useRef } from "react";
import { backgroundImageUrl } from "@shared/background-image";
import { videoPosition } from "@shared/stage";
import type { MediaFit, VideoPlayback } from "@shared/types";

const DRIFT_TOLERANCE = 0.4;
const PLAYING_DRIFT_TOLERANCE = 3;

interface Props {
  playback: VideoPlayback;
  muted: boolean;
  fit?: MediaFit;
  className?: string;
  onDuration?: (seconds: number) => void;
  still?: boolean;
}

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
        } catch {}
      }
      if (still) return;
      const ended = Number.isFinite(el.duration) && target >= el.duration;
      if (playing && !ended) void el.play().catch(() => undefined);
      else el.pause();
    },
    [playing, startedAt, position, still],
  );

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
