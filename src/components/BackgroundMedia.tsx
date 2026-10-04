import { useCallback, useEffect, useRef, useState } from "react";
import { backgroundImageUrl, isBackgroundVideo } from "@shared/background-image";

interface Layer {
  src: string;
  video: boolean;
  /** True while fading out to reveal the solid color beneath. */
  leaving: boolean;
  /** True until the entrance fade completes. A returning layer glides back
   * via transition instead of restarting the entrance animation. */
  fresh: boolean;
}

interface FadingBackgroundMediaProps {
  /** Managed background media path from settings/payload. Null = solid color. */
  path: string | null | undefined;
  brightness: number;
  /** Crossfade duration in ms (backgroundFadeMs). */
  fadeMs: number;
  className?: string;
}

/**
 * Last-known playback position per media URL within this process. If a
 * `<video>` element is ever recreated, it resumes where it left off instead
 * of visibly restarting from 0 (e.g. projecting must never restart the
 * background video).
 */
const videoPositions = new Map<string, number>();

function BackgroundVideo({
  src,
  style,
  className,
  resume,
  onReady,
}: {
  src: string;
  style: React.CSSProperties;
  className?: string;
  /** False for an explicitly selected new media (always starts at 0). */
  resume: boolean;
  onReady?: () => void;
}) {
  const currentRef = useRef<HTMLVideoElement | null>(null);
  // Stable per-src: on detach, remember where playback was.
  const setRef = useCallback(
    (el: HTMLVideoElement | null) => {
      if (el) {
        currentRef.current = el;
      } else if (currentRef.current) {
        try {
          const t = currentRef.current.currentTime;
          if (Number.isFinite(t) && t > 0) videoPositions.set(src, t);
        } catch {
          // ignore (media already gone)
        }
        currentRef.current = null;
      }
    },
    [src],
  );

  return (
    <video
      key={src}
      ref={setRef}
      className={className}
      style={style}
      src={src}
      muted
      loop
      autoPlay
      playsInline
      preload="auto"
      onLoadedMetadata={(event) => {
        if (!resume) return;
        const t = videoPositions.get(src);
        if (t != null && Number.isFinite(t) && t > 0.25) {
          try {
            event.currentTarget.currentTime = t;
          } catch {
            // ignore (seek not yet possible)
          }
        }
      }}
      onCanPlay={(event) => {
        void event.currentTarget.play().catch(() => undefined);
        onReady?.();
      }}
      onError={() => onReady?.()}
      aria-hidden
    />
  );
}

/**
 * Renders background image/video with a crossfade when the media changes.
 * Plain `src` swaps cut instantly (only `background-color` had a CSS
 * transition), so the old layer stays mounted underneath while the new one
 * fades in on top over `fadeMs`. Removing the media fades the old layer out
 * to reveal the solid color beneath.
 *
 * Layers are keyed by their `src` and never move slots, so an outgoing
 * `<video>` keeps playing seamlessly underneath the fade instead of
 * remounting (which would restart it from 0 and feel glitchy).
 */
export function FadingBackgroundMedia({ path, brightness, fadeMs, className }: FadingBackgroundMediaProps) {
  const url = backgroundImageUrl(path);
  const duration = Math.max(0, fadeMs);

  const [layers, setLayers] = useState<Layer[]>(() =>
    url ? [{ src: url, video: isBackgroundVideo(path), leaving: false, fresh: false }] : [],
  );
  // The top layer stays hidden until its file decodes, so a slow load never
  // flashes a half-ready frame over the old media.
  const [readySrc, setReadySrc] = useState<string | null>(null);

  const lastUrlRef = useRef<string | null>(url ?? null);
  useEffect(() => {
    const target = url ?? null;
    if (lastUrlRef.current === target) return;
    lastUrlRef.current = target;
    if (!url) {
      // Back to solid color: fade the stacked media out.
      setLayers((prev) => (prev.length > 0 ? prev.map((l) => ({ ...l, leaving: true })) : prev));
      return;
    }
    const video = isBackgroundVideo(path);
    setLayers((prev) => {
      const top = prev[prev.length - 1];
      // Re-selecting the fading-out media just brings it back.
      if (top && top.src === url) return prev.map((l) => ({ ...l, leaving: false }));
      return [
        ...prev.filter((l) => l.src !== url).map((l) => ({ ...l, leaving: false })),
        { src: url, video, leaving: false, fresh: true },
      ];
    });
    setReadySrc(null);
  }, [url, path]);

  // Drop covered/faded layers once the crossfade completes.
  useEffect(() => {
    if (layers.length === 0) return;
    const top = layers[layers.length - 1];
    if (layers.length === 1 && !top.leaving && !top.fresh) return;
    const timer = window.setTimeout(() => {
      setLayers((prev) => {
        if (prev.length === 0) return prev;
        const prevTop = prev[prev.length - 1];
        if (prevTop.leaving) return [];
        if (prev.length === 1) return prevTop.fresh ? [{ ...prevTop, fresh: false }] : prev;
        return [{ ...prevTop, fresh: false }];
      });
    }, duration + 80);
    return () => window.clearTimeout(timer);
  }, [layers, duration]);

  const filter = `brightness(${brightness})`;

  return (
    <>
      {layers.map((layer, index) => {
        const isTop = index === layers.length - 1;
        // The entering top layer animates in via keyframes (starts on style
        // application, no rAF paint dance needed). A leaving layer fades out
        // via transition from its previously painted opacity of 1. Covered
        // layers hold full opacity underneath.
        const style: React.CSSProperties = layer.leaving
          ? { opacity: 0, transition: `opacity ${duration}ms ease`, filter }
          : isTop
            ? readySrc === layer.src
              ? layer.fresh
                ? { opacity: 1, animation: `lumen-bg-fade-in ${duration}ms ease`, filter }
                : { opacity: 1, transition: `opacity ${duration}ms ease`, filter }
              : { opacity: 0, filter }
            : { opacity: 1, filter };
        const onReady = isTop && !layer.leaving ? () => setReadySrc(layer.src) : undefined;
        if (layer.video) {
          return (
            <BackgroundVideo
              key={layer.src}
              src={layer.src}
              style={style}
              className={className}
              resume={!layer.fresh}
              onReady={onReady}
            />
          );
        }
        return (
          <img
            key={layer.src}
            className={className}
            style={style}
            src={layer.src}
            alt=""
            aria-hidden
            onLoad={() => onReady?.()}
            onError={() => onReady?.()}
          />
        );
      })}
    </>
  );
}
