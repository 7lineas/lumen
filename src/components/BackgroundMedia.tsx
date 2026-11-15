import { useCallback, useEffect, useRef, useState } from "react";
import {
  backgroundImageUrl,
  backgroundThumbnailUrl,
  isBackgroundVideo,
} from "@shared/background-image";
import type { MediaFit } from "@shared/types";

interface Layer {
  src: string;
  video: boolean;
  leaving: boolean;
  fresh: boolean;
}

interface FadingBackgroundMediaProps {
  path: string | null | undefined;
  brightness: number;
  fadeMs: number;
  fit?: MediaFit;
  className?: string;
  still?: boolean;
}

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
  resume: boolean;
  onReady?: () => void;
}) {
  const currentRef = useRef<HTMLVideoElement | null>(null);
  const setRef = useCallback(
    (el: HTMLVideoElement | null) => {
      if (el) {
        currentRef.current = el;
      } else if (currentRef.current) {
        try {
          const t = currentRef.current.currentTime;
          if (Number.isFinite(t) && t > 0) videoPositions.set(src, t);
        } catch {}
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
          } catch {}
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

export function FadingBackgroundMedia({
  path,
  brightness,
  fadeMs,
  fit = "cover",
  className,
  still = false,
}: FadingBackgroundMediaProps) {
  const videoPath = isBackgroundVideo(path);
  const url =
    still && videoPath
      ? backgroundThumbnailUrl(path)
      : backgroundImageUrl(path);
  const duration = Math.max(0, fadeMs);

  const [layers, setLayers] = useState<Layer[]>(() =>
    url
      ? [
          {
            src: url,
            video: videoPath && !still,
            leaving: false,
            fresh: false,
          },
        ]
      : [],
  );
  const [readySrc, setReadySrc] = useState<string | null>(null);

  const lastUrlRef = useRef<string | null>(url ?? null);
  useEffect(() => {
    const target = url ?? null;
    if (lastUrlRef.current === target) return;
    lastUrlRef.current = target;
    if (!url) {
      setLayers((prev) =>
        prev.length > 0 ? prev.map((l) => ({ ...l, leaving: true })) : prev,
      );
      return;
    }
    const video = isBackgroundVideo(path) && !still;
    setLayers((prev) => {
      const top = prev[prev.length - 1];
      if (top && top.src === url)
        return prev.map((l) => ({ ...l, leaving: false }));
      return [
        ...prev
          .filter((l) => l.src !== url)
          .map((l) => ({ ...l, leaving: false })),
        { src: url, video, leaving: false, fresh: true },
      ];
    });
    setReadySrc(null);
  }, [url, path, still]);

  useEffect(() => {
    if (layers.length === 0) return;
    const top = layers[layers.length - 1];
    if (layers.length === 1 && !top.leaving && !top.fresh) return;
    const timer = window.setTimeout(() => {
      setLayers((prev) => {
        if (prev.length === 0) return prev;
        const prevTop = prev[prev.length - 1];
        if (prevTop.leaving) return [];
        if (prev.length === 1)
          return prevTop.fresh ? [{ ...prevTop, fresh: false }] : prev;
        return [{ ...prevTop, fresh: false }];
      });
    }, duration + 80);
    return () => window.clearTimeout(timer);
  }, [layers, duration]);

  const filter = brightness === 1 ? undefined : `brightness(${brightness})`;

  return (
    <>
      {layers.map((layer, index) => {
        const isTop = index === layers.length - 1;
        const layerStyle: React.CSSProperties = layer.leaving
          ? { opacity: 0, transition: `opacity ${duration}ms ease`, filter }
          : isTop
            ? readySrc === layer.src
              ? layer.fresh
                ? {
                    opacity: 1,
                    animation: `lumen-bg-fade-in ${duration}ms ease`,
                    filter,
                  }
                : {
                    opacity: 1,
                    transition: `opacity ${duration}ms ease`,
                    filter,
                  }
              : { opacity: 0, filter }
            : { opacity: 1, filter };
        const style: React.CSSProperties = { ...layerStyle, objectFit: fit };
        const onReady =
          isTop && !layer.leaving ? () => setReadySrc(layer.src) : undefined;
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
